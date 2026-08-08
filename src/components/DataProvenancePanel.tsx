import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Database, Brain, ChevronDown, Info, ShieldCheck, Satellite } from "lucide-react";

interface DataProvenancePanelProps {
  results: any;
  eventType: string;
}

const DataProvenancePanel = ({ results, eventType }: DataProvenancePanelProps) => {
  const confidence = results?.analysisConfidence || 0;
  const cloudCoverage = results?.cloudCoverage?.percentage;
  const dataQuality = results?.dataQuality?.overall_score;
  const provenance = results?.dataProvenance;
  const isReal = provenance?.analysisMethod === "real_sentinel_statistics";

  return (
    <div className="space-y-3">
      {/* Authenticity Notice */}
      <Card className={isReal ? "p-3 border-green-500/30 bg-green-500/5" : "p-3 border-amber-500/30 bg-amber-500/5"}>
        <div className="flex items-start gap-2">
          {isReal ? (
            <Satellite className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          )}
          <div className="text-xs space-y-1">
            <p className={isReal ? "font-medium text-green-600 dark:text-green-400" : "font-medium text-amber-600 dark:text-amber-400"}>
              {isReal ? "Real Satellite Data Used" : "Data Authenticity Notice"}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {provenance?.disclaimer ||
                "These figures are AI-generated plausible estimates, not measurements from real satellite imagery. For critical decisions, cross-validate with in-situ field data and official government reports."}
            </p>
          </div>
        </div>
      </Card>

      {/* Data Sources */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Data Sources & Methodology</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          <Card className="p-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {isReal ? "What actually produced these numbers" : "What actually produced these numbers"}
              </p>
              <div className="flex flex-wrap gap-1">
                {isReal && <Badge variant="outline" className="text-xs border-green-500/40 text-green-600 dark:text-green-400">Sentinel-2 L2A (real measurement)</Badge>}
                <Badge variant="outline" className="text-xs">Google Gemini 2.5 Flash ({isReal ? "narrative only" : "AI estimation"})</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                {isReal ? (
                  <>
                    The change percentage and spectral index values (NDVI/NDWI/NBR) come from real Sentinel-2 pixels,
                    fetched for the start and end of the study period via the Sentinel Hub Statistics API and averaged
                    over cloud-free pixels. Gemini only writes the narrative summary, severity assessment, and
                    recommendations - grounded in these real numbers, not generating them.
                  </>
                ) : (
                  <>
                    No Sentinel-2 imagery is fetched for this numeric analysis - the model generates
                    plausible spectral-index values and narrative findings based on its training knowledge of
                    typical patterns for this region and event type.{" "}
                    {provenance?.earthEngine?.configured
                      ? "An Earth Engine credential is configured and authenticates successfully, but isn't yet used to pull real pixel data into this analysis."
                      : "Google Earth Engine is not configured, so no real pixel data is available as an alternative."}
                  </>
                )}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">What actually happens, step by step</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                {isReal ? (
                  <>
                    <li>Your coordinates and study period are split into a "before" and "after" time window</li>
                    <li>Real Sentinel-2 pixels for both windows are fetched via the Sentinel Hub Statistics API, with clouds excluded using the Scene Classification Layer</li>
                    <li>NDVI/NDWI/NBR means are computed for each window from real band values (B03/B04/B08/B12) - the % change is the real difference between them</li>
                    <li>These real numbers are given to Gemini, which writes a narrative and recommendations grounded in them (but does not alter the numbers)</li>
                  </>
                ) : (
                  <>
                    <li>Your region, event type, and date range are sent to Gemini in a detailed text prompt</li>
                    <li>The prompt describes real spectral-index formulas (NDVI, NDWI, NBR, NDBI) and asks the model to reason about plausible values for this kind of location/event</li>
                    <li>Gemini returns estimated percentages, a narrative analysis, and recommendations as structured JSON</li>
                    <li>No image pixels, bands, or files are downloaded or processed at any point</li>
                  </>
                )}
              </ol>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Reported Quality Metrics {isReal ? "(cloud cover is measured; confidence is still AI-assessed)" : "(also AI-estimated)"}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-muted/30 rounded">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className={`text-sm font-bold ${confidence >= 80 ? 'text-green-500' : confidence >= 60 ? 'text-amber-500' : 'text-destructive'}`}>
                    {confidence}%
                  </p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded">
                  <p className="text-xs text-muted-foreground">Cloud Cover</p>
                  <p className="text-sm font-bold text-muted-foreground">
                    {cloudCoverage ?? "—"}{cloudCoverage != null ? "%" : ""}
                  </p>
                </div>
                <div className="text-center p-2 bg-muted/30 rounded">
                  <p className="text-xs text-muted-foreground">Data Quality</p>
                  <p className="text-sm font-bold text-muted-foreground">
                    {dataQuality ?? "—"}{dataQuality != null ? "%" : ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-2 bg-primary/5 rounded text-xs text-muted-foreground">
              <div className="flex items-center gap-1 mb-1">
                <Info className="h-3 w-3" />
                <span className="font-medium">Limitations</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {isReal ? (
                  <>
                    <li>Real values are averaged over an ~11km area around your coordinates, not the whole region - a large or irregularly-shaped region may not be fully represented</li>
                    <li>Cloud-obscured pixels are excluded, so results depend on cloud-free coverage in the chosen time windows</li>
                    <li>The narrative, severity rating, and recommendations remain AI-generated interpretation, not independently verified</li>
                  </>
                ) : (
                  <>
                    <li>These are not measurements - treat every percentage as a plausible estimate, not a fact</li>
                    <li>AI interpretations are probabilistic and can be wrong or inconsistent between runs</li>
                    <li>For the imagery panels specifically (true-color/false-color/NDVI), real Sentinel-2 satellite imagery is used when a location is available - that part is genuinely real data</li>
                  </>
                )}
              </ul>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Model Explainability */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{isReal ? "How This Data Was Generated" : "How the Estimate Is Generated"}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card className="p-3 space-y-3">
            <div className="space-y-2">
              {isReal ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">1</div>
                    <div>
                      <p className="text-xs font-medium">Real Pixel Retrieval</p>
                      <p className="text-[10px] text-muted-foreground">Sentinel-2 L2A pixels for your coordinates are fetched for two real time windows via the Sentinel Hub Statistics API (Copernicus Data Space Ecosystem)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">2</div>
                    <div>
                      <p className="text-xs font-medium">Real Index Computation</p>
                      <p className="text-[10px] text-muted-foreground">
                        NDVI/NDWI/NBR are computed directly from real band values for every cloud-free pixel, then averaged. The reported % change is the real difference between the two time windows' means.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">3</div>
                    <div>
                      <p className="text-xs font-medium">Grounded Narrative</p>
                      <p className="text-[10px] text-muted-foreground">Gemini receives the real numbers and writes a summary, severity assessment, and recommendations around them - it's instructed to use the real figures exactly, not invent its own</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">1</div>
                    <div>
                      <p className="text-xs font-medium">Prompt Construction</p>
                      <p className="text-[10px] text-muted-foreground">Your region, event type, and date range are formatted into a detailed text prompt - no imagery is fetched</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">2</div>
                    <div>
                      <p className="text-xs font-medium">Index Definitions Given to the Model</p>
                      <p className="text-[10px] text-muted-foreground">
                        {eventType === 'deforestation' || eventType === 'vegetation_loss'
                          ? 'NDVI (NIR-Red)/(NIR+Red) measures vegetation health. Values <0.2 indicate bare soil; >0.6 indicates dense vegetation.'
                          : eventType === 'flood' || eventType === 'water_scarcity'
                          ? 'NDWI (Green-NIR)/(Green+NIR) detects water bodies. Positive values indicate water presence.'
                          : eventType === 'wildfire' || eventType === 'bushfire'
                          ? 'NBR (NIR-SWIR2)/(NIR+SWIR2) assesses burn severity. Lower values indicate more severe burns.'
                          : 'Multiple spectral indices (NDVI, NDWI, NBR, NDBI) are described to the model for it to reason about.'}
                        {" "}The model estimates plausible values for these formulas - it does not compute them from real pixels.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">3</div>
                    <div>
                      <p className="text-xs font-medium">Text Generation</p>
                      <p className="text-[10px] text-muted-foreground">Google Gemini 2.5 Flash generates estimated percentages, narrative findings, and recommendations as structured JSON, based on patterns in its training data</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-2 bg-muted/30 rounded">
              <div className="flex items-center gap-1 mb-1">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">Validation Approach</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isReal
                  ? "The index values and % change are real measurements, but still summarize a small area and a specific time window - verify against ground data before high-stakes decisions. The narrative/recommendations remain AI interpretation."
                  : "Treat this as a starting hypothesis, not a finding. For decisions that matter, verify against real sources: USGS Earth Explorer, ESA Copernicus Browser, or the real Sentinel-2 imagery already shown in this report's imagery panels."}
              </p>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default DataProvenancePanel;
