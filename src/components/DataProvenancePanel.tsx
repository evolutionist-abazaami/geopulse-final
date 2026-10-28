import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface DataProvenancePanelProps {
  results: Record<string, any>;
}

const DataProvenancePanel = ({ results }: DataProvenancePanelProps) => {
  const analysisMethod = results?.analysisMethod ?? results?.dataProvenance?.analysisMethod;
  const isMeasured = analysisMethod === "measured";
  const provenance = results?.fieldProvenance ?? {};
  const visibleFields = [
    "changePercent",
    "area",
    "spectralIndices",
    "predictiveModeling",
    "severity",
    "summary",
    "fullAnalysis",
    "recommendations",
  ];

  return (
    <Card className="space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Data provenance</span>
        <Badge variant={isMeasured ? "default" : "outline"}>
          {isMeasured ? "Measured satellite data" : "Model-only analysis"}
        </Badge>
        {provenance.summary?.origin === "model_generated" && (
          <Badge variant="outline">Narrative is model-generated</Badge>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {results?.dataProvenance?.disclaimer ??
          "Values without measured input are unavailable; generated narrative is not a measurement."}
      </p>
      <div className="flex flex-wrap gap-1">
        {visibleFields.map((field) => {
          const entry = provenance[field];
          if (!entry) return null;
          return (
            <Badge key={field} variant="secondary" className="text-[10px]">
              {field}: {entry.origin}
            </Badge>
          );
        })}
      </div>
    </Card>
  );
};

export default DataProvenancePanel;
