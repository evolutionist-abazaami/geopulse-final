import { describe, expect, it } from "vitest";
import { parseCSVText, parseGeoJSONText } from "./gis-import";

describe("GIS format imports", () => {
  it("preserves GeoJSON geometries and calculates their bounds", () => {
    const result = parseGeoJSONText(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: { name: "test line" },
        geometry: { type: "LineString", coordinates: [[-2, 1], [4, 8]] },
      }],
    }));

    expect(result.geoJSON.features[0].geometry).toEqual({
      type: "LineString",
      coordinates: [[-2, 1], [4, 8]],
    });
    expect(result.bounds).toEqual({ minLat: 1, maxLat: 8, minLng: -2, maxLng: 4 });
    expect(result.features[0].name).toBe("test line");
  });

  it("imports CSV latitude/longitude columns as point features", () => {
    const result = parseCSVText("name,latitude,longitude\n\"Forest, north\",1.5,-2.25");

    expect(result.geoJSON.features[0].geometry).toEqual({
      type: "Point",
      coordinates: [-2.25, 1.5],
    });
    expect(result.features[0].name).toBe("Forest, north");
    expect(result.bounds).toEqual({ minLat: 1.5, maxLat: 1.5, minLng: -2.25, maxLng: -2.25 });
  });

  it("imports CSV WKT geometries", () => {
    const result = parseCSVText('name,wkt\n"path", "LINESTRING (0 1, 2 3)"');

    expect(result.geoJSON.features[0].geometry).toEqual({
      type: "LineString",
      coordinates: [[0, 1], [2, 3]],
    });
  });
});
