import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getAoiAreaKm2, getAoiBounds, validateAoiGeometry } from "./geojson.ts";

Deno.test("validates and measures a selected polygon boundary", () => {
  const geometry = validateAoiGeometry({
    type: "Polygon",
    coordinates: [[[-1, 0], [0, 0], [0, 1], [-1, 1]]],
  });

  assertEquals(geometry.coordinates[0][0], [-1, 0]);
  assertEquals(getAoiBounds(geometry), { west: -1, south: 0, east: 0, north: 1 });
  const areaKm2 = getAoiAreaKm2(geometry);
  assert(areaKm2 > 12_000 && areaKm2 < 13_000);
});

Deno.test("rejects non-polygon and unsupported large boundaries", () => {
  let pointRejected = false;
  try {
    validateAoiGeometry({ type: "Point", coordinates: [0, 0] });
  } catch {
    pointRejected = true;
  }
  assert(pointRejected);

  let largeExtentRejected = false;
  try {
    validateAoiGeometry({
      type: "Polygon",
      coordinates: [[[-100, 0], [100, 0], [100, 1], [-100, 1]]],
    });
  } catch {
    largeExtentRejected = true;
  }
  assert(largeExtentRejected);
});
