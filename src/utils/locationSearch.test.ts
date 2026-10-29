import { describe, expect, it } from "vitest";
import { isBoundaryGeometry, searchPlaces } from "./locationSearch";

describe("isBoundaryGeometry", () => {
  it("accepts a valid polygon and multipolygon", () => {
    const ring = [[-1, 0], [0, 0], [0, 1], [-1, 1], [-1, 0]];
    expect(isBoundaryGeometry({ type: "Polygon", coordinates: [ring] })).toBe(true);
    expect(isBoundaryGeometry({ type: "MultiPolygon", coordinates: [[ring]] })).toBe(true);
  });

  it("rejects points, malformed coordinates, and oversized boundaries", () => {
    expect(isBoundaryGeometry({ type: "Point", coordinates: [0, 0] })).toBe(false);
    expect(isBoundaryGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 1]]] })).toBe(false);
    const tooManyVertices = Array.from({ length: 20_001 }, () => [0, 0]);
    expect(isBoundaryGeometry({ type: "Polygon", coordinates: [tooManyVertices] })).toBe(false);
  });

  it("preserves real geocoder bounds and geometry without fabricating a boundary", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([{
      display_name: "Ghana",
      lat: "7.9465",
      lon: "-1.0232",
      addresstype: "country",
      boundingbox: ["4.5", "11.2", "-3.3", "1.3"],
      geojson: {
        type: "Polygon",
        coordinates: [[[-3.3, 4.5], [1.3, 4.5], [1.3, 11.2], [-3.3, 11.2], [-3.3, 4.5]]],
      },
    }]), { status: 200, headers: { "Content-Type": "application/json" } });

    const [place] = await searchPlaces("test country with boundary", undefined, fetcher);

    expect(place.name).toBe("Ghana");
    expect(place.bounds).toEqual([[4.5, -3.3], [11.2, 1.3]]);
    expect(place.geometry?.type).toBe("Polygon");
    expect(place.source).toBe("nominatim");
  });
});
