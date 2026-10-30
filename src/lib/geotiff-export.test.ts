import { describe, expect, it } from "vitest";
import { fromArrayBuffer } from "geotiff";
import { encodeGeoTIFF } from "./geotiff-export";

describe("encodeGeoTIFF", () => {
  it("writes RGB pixels with EPSG:3857 GeoTIFF metadata", () => {
    const tiff = encodeGeoTIFF(
      new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
      2,
      1,
      { north: 10, south: 0, east: 20, west: 10 }
    );
    const view = new DataView(tiff);
    expect(view.getUint8(0)).toBe(0x49);
    expect(view.getUint8(1)).toBe(0x49);
    expect(view.getUint16(2, true)).toBe(42);

    const entryCount = view.getUint16(8, true);
    const findEntry = (tag: number) => {
      for (let index = 0; index < entryCount; index++) {
        const offset = 10 + index * 12;
        if (view.getUint16(offset, true) === tag) return offset;
      }
      throw new Error(`Missing TIFF tag ${tag}`);
    };

    const widthEntry = findEntry(256);
    expect(view.getUint32(widthEntry + 8, true)).toBe(2);
    const geoKeyEntry = findEntry(34735);
    const geoKeyOffset = view.getUint32(geoKeyEntry + 8, true);
    expect(view.getUint16(geoKeyOffset + 6, true)).toBe(4);
    expect(view.getUint16(geoKeyOffset + 22, true)).toBe(1);
    expect(view.getUint16(geoKeyOffset + 38, true)).toBe(3857);

    const stripOffset = view.getUint32(findEntry(273) + 8, true);
    expect(Array.from(new Uint8Array(tiff, stripOffset, 6))).toEqual([255, 0, 0, 0, 0, 255]);

    const pixelScaleEntry = findEntry(33550);
    const pixelScaleOffset = view.getUint32(pixelScaleEntry + 8, true);
    const westNorthEntry = findEntry(33922);
    const tiepointOffset = view.getUint32(westNorthEntry + 8, true);
    expect(view.getFloat64(tiepointOffset + 24, true)).toBeCloseTo(10 * Math.PI / 180 * 6378137);
    expect(view.getFloat64(pixelScaleOffset, true)).toBeGreaterThan(0);
    expect(view.getFloat64(pixelScaleOffset + 8, true)).toBeGreaterThan(0);
  });

  it("rejects invalid bounds", () => {
    expect(() => encodeGeoTIFF(
      new Uint8ClampedArray(4),
      1,
      1,
      { north: 0, south: 10, east: 20, west: 10 }
    )).toThrow("invalid geographic bounds");
  });

  it("opens as a georeferenced raster in an independent GeoTIFF reader", async () => {
    const tiff = encodeGeoTIFF(
      new Uint8ClampedArray([10, 20, 30, 255]),
      1,
      1,
      { north: 2, south: 1, east: 4, west: 3 }
    );
    const dataset = await fromArrayBuffer(tiff);
    const image = await dataset.getImage();

    expect(image.getGeoKeys()?.ProjectedCSTypeGeoKey).toBe(3857);
    const boundingBox = image.getBoundingBox();
    expect(boundingBox).toHaveLength(4);
    expect(boundingBox[0]).toBeCloseTo(333958.47, 1);
    expect(boundingBox[1]).toBeCloseTo(111325.14, 1);
    expect(boundingBox[2]).toBeCloseTo(445277.96, 1);
    expect(boundingBox[3]).toBeCloseTo(222684.21, 1);
    expect(Array.from(await image.readRasters({ interleave: true }))).toEqual([10, 20, 30]);
  });
});
