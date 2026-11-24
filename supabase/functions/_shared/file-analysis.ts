export function normalizeModelConfidence(value: unknown): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 1 &&
      value <= 100
    ? value
    : null;
}
