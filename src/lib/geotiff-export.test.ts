import { describe, expect, it } from "vitest";
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
    expect(view.getUint16(geoKeyOffset + 22, true)).toBe(3857);

    const stripOffset = view.getUint32(findEntry(273) + 8, true);
    expect(Array.from(new Uint8Array(tiff, stripOffset, 6))).toEqual([255, 0, 0, 0, 0, 255]);
  });

  it("rejects invalid bounds", () => {
    expect(() => encodeGeoTIFF(
      new Uint8ClampedArray(4),
      1,
      1,
      { north: 0, south: 10, east: 20, west: 10 }
    )).toThrow("invalid geographic bounds");
  });
});
