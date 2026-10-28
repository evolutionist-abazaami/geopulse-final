export type Origin = "measured" | "model_generated" | "geocoded" | "unavailable";

export type FallbackReason =
  | "NO_COORDINATES"
  | "NO_CREDENTIALS"
  | "INSUFFICIENT_VALID_PIXELS"
  | "SENTINEL_API_ERROR"
  | "PROVIDER_OVERLOAD";

export const AOI_HALF_WIDTH_DEGREES = 0.05;
export const STATISTICS_GRID_SIZE = 128;
export const MAX_CLOUD_COVERAGE_PERCENT = 60;
export const EXCLUDED_SCL_CLASSES = [3, 8, 9, 10] as const;
export const MAX_ANALYSIS_WINDOW_DAYS = 90;
export const MIN_VALID_PIXEL_RATIO = 0.1;
export const NEAR_ZERO_NDVI_BASELINE = 0.05;
export const DAYS_PER_MONTH_APPROXIMATION = 30;
export const SECOND_INTERIOR_SAMPLE_MIN_GAP_DAYS = 60;
export const FIRST_INTERIOR_SAMPLE_MIN_GAP_DAYS = 20;
export const INTERIOR_SAMPLE_HALF_WIDTH_DAYS = 20;
export const ENABLE_UNVERIFIED_MODEL_FEATURES = false;

// Absolute NDVI change percentage: low <3, medium 3 to <8, high 8 to <15, critical >=15.
export const NDVI_SEVERITY_THRESHOLDS = {
  medium: 3,
  high: 8,
  critical: 15,
} as const;

// Regression slopes smaller than this magnitude are reported as stable.
export const TREND_SLOPE_DEADBAND_PERCENT_PER_MONTH = 0.1;

export const HAZARD_SEVERITY_RATIO_THRESHOLDS = {
  moderate: 0.3,
  high: 0.75,
  critical: 1.5,
} as const;
export const MAX_HAZARD_OBSERVATION_DISTANCE_KM = 25;

export const SENTINEL_2_SENSOR = "Sentinel-2 MSI L2A";

export const SENTINEL_2_BAND_RESOLUTIONS_METERS = {
  B02: 10,
  B03: 10,
  B04: 10,
  B08: 10,
  B11: 20,
  B12: 20,
} as const;
