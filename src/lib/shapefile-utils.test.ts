import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import { extractShapefileArchive, parseShapefile } from "./shapefile-utils";

function createPointShapefile(x: number, y: number): ArrayBuffer {
  const buffer = new ArrayBuffer(128);
  const view = new DataView(buffer);
  view.setInt32(0, 9994, false);
  view.setInt32(24, 64, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 1, true);
  [x, y, x, y].forEach((value, index) => view.setFloat64(36 + index * 8, value, true));

  view.setInt32(100, 1, false);
  view.setInt32(104, 10, false);
  view.setInt32(108, 1, true);
  view.setFloat64(112, x, true);
  view.setFloat64(120, y, true);
  return buffer;
}

const webMercatorPrj = [
  'PROJCS["WGS 84 / Pseudo-Mercator",',
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],',
  'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],',
  'PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],',
  'PARAMETER["scale_factor",1],PARAMETER["false_easting",0],',
  'PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","3857"]]',
].join("");

describe("shapefile import", () => {
  it("extracts a zipped shapefile and reprojects its geometry from the PRJ", async () => {
    const shape = createPointShapefile(111319.490793, 111325.142866);
    const shapeBytes = new Uint8Array(shape);
    const archive = zipSync({
      "folder/roads.SHP": shapeBytes,
      "folder/roads.PRJ": new TextEncoder().encode(webMercatorPrj),
    });
    const extracted = extractShapefileArchive(
      new Uint8Array(archive).buffer as ArrayBuffer
    );

    const result = await parseShapefile(
      extracted.shpBuffer,
      extracted.dbfBuffer,
      extracted.prjText
    );

    expect(result.features).toHaveLength(1);
    expect(result.geoJSON.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [expect.closeTo(1, 4), expect.closeTo(1, 4)],
    });
    expect(result.bounds.minLng).toBeCloseTo(1, 4);
    expect(result.bounds.minLat).toBeCloseTo(1, 4);
  });

  it("reports when a projected shapefile is missing its PRJ", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(parseShapefile(createPointShapefile(500000, 500000)))
        .rejects.toThrow("Upload the matching .prj file");
    } finally {
      consoleError.mockRestore();
    }
  });

  it("requires one shapefile in each ZIP archive", () => {
    const archive = zipSync({
      "first.shp": new Uint8Array([1]),
      "second.shp": new Uint8Array([2]),
    });
    expect(() => extractShapefileArchive(
      new Uint8Array(archive).buffer as ArrayBuffer
    )).toThrow("multiple .shp files");
  });
});
