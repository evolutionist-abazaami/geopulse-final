const UNAVAILABLE_VISUALIZATIONS: Record<string, string> = {
  classification_map:
    "Land-cover classification is disabled in this build; no validated classification result is available.",
  change_detection_map:
    "Pixel-wise change detection is disabled in this build; no validated change matrix or changed-area estimate is available.",
  landsat_change:
    "Pixel-wise change detection is disabled in this build; no validated change map is available.",
  chart:
    "AI-generated data charts are disabled; chart outputs must be rendered from actual measured values.",
  predictive:
    "Forecast projections and confidence bands are disabled pending independent validation.",
};

export function createUnavailableVisualizationResponse(
  visualizationType: string,
  headers: HeadersInit,
): Response | null {
  const error = UNAVAILABLE_VISUALIZATIONS[visualizationType];
  if (!error) return null;

  return new Response(
    JSON.stringify({
      success: false,
      unavailable: true,
      error,
      visualizationType,
      dataSource: "unavailable",
      origin: "unavailable",
    }),
    { status: 501, headers },
  );
}
