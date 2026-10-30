import { downloadFile } from "@/lib/gis-export";

export interface GeographicBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const WEB_MERCATOR_RADIUS = 6378137;
const MAX_MERCATOR_LATITUDE = 85.0511287798066;

function projectX(longitude: number): number {
  return WEB_MERCATOR_RADIUS * longitude * Math.PI / 180;
}

function projectY(latitude: number): number {
  const clampedLatitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const radians = clampedLatitude * Math.PI / 180;
  return WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function alignToWord(offset: number): number {
  return (offset + 3) & ~3;
}

export function encodeGeoTIFF(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  bounds: GeographicBounds
): ArrayBuffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("GeoTIFF image dimensions must be positive integers");
  }
  if (rgba.length !== width * height * 4) {
    throw new Error("GeoTIFF pixel data does not match the image dimensions");
  }
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.north <= bounds.south ||
    bounds.east <= bounds.west ||
    bounds.north > MAX_MERCATOR_LATITUDE ||
    bounds.south < -MAX_MERCATOR_LATITUDE ||
    bounds.east > 180 ||
    bounds.west < -180
  ) {
    throw new Error("The current map view has invalid geographic bounds");
  }

  const pixelCount = width * height;
  const rgb = new Uint8Array(pixelCount * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    const alpha = rgba[source + 3] / 255;
    rgb[target] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
    rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
    rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
  }

  const north = projectY(bounds.north);
  const south = projectY(bounds.south);
  const west = projectX(bounds.west);
  const east = projectX(bounds.east);
  const scaleX = (east - west) / width;
  const scaleY = (north - south) / height;

  const entries = [
    { tag: 256, type: 4, count: 1, value: width },
    { tag: 257, type: 4, count: 1, value: height },
    { tag: 258, type: 3, count: 3, data: "bits" },
    { tag: 259, type: 3, count: 1, value: 1 },
    { tag: 262, type: 3, count: 1, value: 2 },
    { tag: 273, type: 4, count: 1, data: "pixels" },
    { tag: 277, type: 3, count: 1, value: 3 },
    { tag: 278, type: 4, count: 1, value: height },
    { tag: 279, type: 4, count: 1, value: rgb.length },
    { tag: 282, type: 5, count: 1, data: "xResolution" },
    { tag: 283, type: 5, count: 1, data: "yResolution" },
    { tag: 284, type: 3, count: 1, value: 1 },
    { tag: 296, type: 3, count: 1, value: 2 },
    { tag: 339, type: 3, count: 3, data: "sampleFormat" },
    { tag: 33550, type: 12, count: 3, data: "pixelScale" },
    { tag: 33922, type: 12, count: 6, data: "tiepoint" },
    { tag: 34735, type: 3, count: 20, data: "geoKeys" },
  ];

  const ifdEnd = 8 + 2 + entries.length * 12 + 4;
  let extraOffset = alignToWord(ifdEnd);
  const offsets: Record<string, number> = {};
  const reserve = (name: string, byteLength: number) => {
    extraOffset = alignToWord(extraOffset);
    offsets[name] = extraOffset;
    extraOffset += byteLength;
  };
  reserve("bits", 6);
  reserve("xResolution", 8);
  reserve("yResolution", 8);
  reserve("sampleFormat", 6);
  reserve("pixelScale", 24);
  reserve("tiepoint", 48);
  reserve("geoKeys", 40);
  reserve("pixels", rgb.length);

  const buffer = new ArrayBuffer(extraOffset);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);

  entries.forEach((entry, index) => {
    const entryOffset = 10 + index * 12;
    view.setUint16(entryOffset, entry.tag, true);
    view.setUint16(entryOffset + 2, entry.type, true);
    view.setUint32(entryOffset + 4, entry.count, true);
    if ("value" in entry) {
      if (entry.type === 3) view.setUint16(entryOffset + 8, entry.value, true);
      else view.setUint32(entryOffset + 8, entry.value, true);
    } else {
      view.setUint32(entryOffset + 8, offsets[entry.data], true);
    }
  });
  view.setUint32(10 + entries.length * 12, 0, true);

  [8, 8, 8].forEach((value, index) => view.setUint16(offsets.bits + index * 2, value, true));
  view.setUint32(offsets.xResolution, 96, true);
  view.setUint32(offsets.xResolution + 4, 1, true);
  view.setUint32(offsets.yResolution, 96, true);
  view.setUint32(offsets.yResolution + 4, 1, true);
  [1, 1, 1].forEach((value, index) => view.setUint16(offsets.sampleFormat + index * 2, value, true));
  [scaleX, scaleY, 0].forEach((value, index) => view.setFloat64(offsets.pixelScale + index * 8, value, true));
  [0, 0, 0, west, north, 0].forEach((value, index) => view.setFloat64(offsets.tiepoint + index * 8, value, true));
  [1, 1, 0, 4, 1024, 0, 1, 1, 1025, 0, 1, 1, 2054, 0, 1, 9102, 3072, 0, 1, 3857]
    .forEach((value, index) => view.setUint16(offsets.geoKeys + index * 2, value, true));
  bytes.set(rgb, offsets.pixels);
  return buffer;
}

export async function exportMapAsGeoTIFF(
  imageDataUrl: string,
  bounds: GeographicBounds,
  filename = "geopulse-map"
): Promise<void> {
  if (!imageDataUrl) {
    throw new Error("The map image is not available yet");
  }

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not read the current map image"));
    image.src = imageDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create an image canvas for GeoTIFF export");
  context.drawImage(image, 0, 0);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const tiff = encodeGeoTIFF(pixels.data, canvas.width, canvas.height, bounds);
  const blob = new Blob([tiff], { type: "image/tiff" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.tif`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
