import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createUnavailableVisualizationResponse } from "./visualization-policy.ts";

Deno.test("unvalidated analysis charts and maps fail closed", async () => {
  const headers = { "Content-Type": "application/json" };
  const unavailableReasons: Record<string, string> = {
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

  for (const [visualizationType, error] of Object.entries(unavailableReasons)) {
    const response = createUnavailableVisualizationResponse(visualizationType, headers);
    assertEquals(response?.status, 501);
    assertEquals(await response?.json(), {
      success: false,
      unavailable: true,
      error,
      visualizationType,
      dataSource: "unavailable",
      origin: "unavailable",
    });
  }

  assertEquals(createUnavailableVisualizationResponse("ndvi_map", headers), null);
});
