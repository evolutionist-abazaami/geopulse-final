import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, Database, Brain, ChevronDown, Info, ShieldCheck } from "lucide-react";

interface DataProvenancePanelProps {
  results: any;
  eventType: string;
}

const DataProvenancePanel = ({ results, eventType }: DataProvenancePanelProps) => {
  const confidence = results?.analysisConfidence || 0;
  const cloudCoverage = results?.cloudCoverage?.percentage;
  const dataQuality = results?.dataQuality?.overall_score;
  const provenance = results?.dataProvenance;

  return (
    <div className="space-y-3">
      {/* Authenticity Disclaimer */}
      <Card className="p-3 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">Data Authenticity Notice</p>
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
              <p className="text-xs font-medium text-muted-foreground mb-1">What actually produced these numbers</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">Google Gemini 2.5 Flash (AI estimation)</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                No Landsat or Sentinel imagery is fetched for this numeric analysis - the model generates
                plausible spectral-index values and narrative findings based on its training knowledge of
                typical patterns for this region and event type.{" "}
                {provenance?.earthEngine?.configured
                  ? "An Earth Engine credential is configured and authenticates successfully, but isn't yet used to pull real pixel data into this analysis."
                  : "Google Earth Engine is not configured, so no real pixel data is available as an alternative."}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">What actually happens, step by step</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Your region, event type, and date range are sent to Gemini in a detailed text prompt</li>
                <li>The prompt describes real spectral-index formulas (NDVI, NDWI, NBR, NDBI) and asks the model to reason about plausible values for this kind of location/event</li>
                <li>Gemini returns estimated percentages, a narrative analysis, and recommendations as structured JSON</li>
                <li>No image pixels, bands, or files are downloaded or processed at any point</li>
              </ol>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Reported Quality Metrics (also AI-estimated)</p>
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
                <li>These are not measurements - treat every percentage as a plausible estimate, not a fact</li>
                <li>AI interpretations are probabilistic and can be wrong or inconsistent between runs</li>
                <li>For the imagery panels specifically (true-color/false-color/NDVI), real Sentinel-2 satellite imagery is used when a location is available - that part is genuinely real data</li>
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
            <span className="text-sm font-medium">How the Estimate Is Generated</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <Card className="p-3 space-y-3">
            <div className="space-y-2">
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
            </div>

            <div className="p-2 bg-muted/30 rounded">
              <div className="flex items-center gap-1 mb-1">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium">Validation Approach</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Treat this as a starting hypothesis, not a finding. For decisions that matter, verify against
                real sources: USGS Earth Explorer, ESA Copernicus Browser, or the real Sentinel-2 imagery
                already shown in this report's imagery panels.
              </p>
            </div>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default DataProvenancePanel;
