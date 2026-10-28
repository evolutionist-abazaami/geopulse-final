import { HAZARD_SEVERITY_RATIO_THRESHOLDS } from "./analysis-constants.ts";

export type HazardSeverity = "low" | "moderate" | "high" | "critical";

export function determineHazardSeverity(value: number, threshold: number): HazardSeverity {
  const ratio = Math.abs(value - threshold) / Math.max(Math.abs(threshold), 1);
  if (ratio > HAZARD_SEVERITY_RATIO_THRESHOLDS.critical) return "critical";
  if (ratio > HAZARD_SEVERITY_RATIO_THRESHOLDS.high) return "high";
  if (ratio > HAZARD_SEVERITY_RATIO_THRESHOLDS.moderate) return "moderate";
  return "low";
}

export function distanceKilometers(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusKm = 6371;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}
