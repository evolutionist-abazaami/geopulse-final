import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Layers, BarChart3, CheckCircle2, ArrowRight, MapPin, AlertTriangle } from "lucide-react";

interface ClassificationClass {
  id: number;
  name: string;
  area_km2: number;
  area_percent: number;
  spectral_signature?: Record<string, number>;
}

interface AccuracyMetrics {
  overall_accuracy: number;
  kappa_coefficient: number;
  producer_accuracy?: Record<string, number>;
  user_accuracy?: Record<string, number>;
}

interface ChangeMatrixEntry {
  from_class: string;
  to_class: string;
  area_km2: number;
  percent: number;
}

interface ChangeHotspot {
  location: string;
  confidence: number;
  change_magnitude: number;
}

interface MajorChange {
  type: string;
  area_km2: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ClassificationResultsProps {
  classificationResults?: {
    method: string;
    num_classes: number;
    classes: ClassificationClass[];
    accuracy_metrics: AccuracyMetrics;
    convergence_iterations?: number;
  } | null;
  changeDetection?: {
    method: string;
    total_changed_area_km2: number;
    change_percent: number;
    change_matrix: ChangeMatrixEntry[];
    major_changes: MajorChange[];
    change_hotspots: ChangeHotspot[];
    no_change_area_km2: number;
  } | null;
}

const classColors: Record<string, string> = {
  'Water': 'bg-blue-500',
  'Forest': 'bg-green-700',
  'Dense Forest': 'bg-green-800',
  'Agriculture': 'bg-lime-500',
  'Cropland': 'bg-lime-400',
  'Urban': 'bg-gray-500',
  'Built-up': 'bg-gray-600',
  'Bare Soil': 'bg-amber-600',
  'Grassland': 'bg-yellow-500',
  'Wetland': 'bg-teal-500',
  'Shrubland': 'bg-orange-500',
};

const getClassColor = (className: string): string => {
  const normalizedName = className.toLowerCase();
  for (const [key, color] of Object.entries(classColors)) {
    if (normalizedName.includes(key.toLowerCase())) {
      return color;
    }
  }
  return 'bg-primary';
};

const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-100';
    case 'high': return 'text-orange-600 bg-orange-100';
    case 'medium': return 'text-yellow-600 bg-yellow-100';
    default: return 'text-green-600 bg-green-100';
  }
};

const safeFixed = (val: any, decimals: number = 1): string => {
  const num = Number(val);
  return isNaN(num) ? "0" : num.toFixed(decimals);
};

const ClassificationResults = ({ classificationResults, changeDetection }: ClassificationResultsProps) => {
  if (!classificationResults && !changeDetection) return null;

  const classificationUnavailable = Boolean((classificationResults as any)?.unavailable);
  const changeDetectionUnavailable = Boolean((changeDetection as any)?.unavailable);

  return (
    <div className="space-y-4">
      {/* Classification Results */}
      {classificationResults && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <h4 className="font-semibold">Classification Results</h4>
            </div>
            <Badge variant="outline" className="capitalize">
              {classificationResults.method?.replace(/_/g, ' ') || "Supervised"}
            </Badge>
          </div>

          {classificationUnavailable ? (
            <p className="text-sm text-muted-foreground">Classification metrics are temporarily unavailable while the AI provider recovers.</p>
          ) : (
            <>

              {/* Accuracy Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span className="text-xs text-muted-foreground">Overall Accuracy</span>
                  </div>
                  <p className="text-xl font-bold text-green-700 dark:text-green-400">
                    {safeFixed(classificationResults.accuracy_metrics?.overall_accuracy, 1)}%
                  </p>
                </div>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <div className="flex items-center gap-1 mb-1">
                    <BarChart3 className="h-3 w-3 text-blue-600" />
                    <span className="text-xs text-muted-foreground">Kappa Coefficient</span>
                  </div>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                    {safeFixed(classificationResults.accuracy_metrics?.kappa_coefficient, 2)}
                  </p>
                </div>
              </div>

              {/* Class Breakdown */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Land Cover Classes ({classificationResults.num_classes || classificationResults.classes?.length || 0})
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {classificationResults.classes?.slice(0, 10).map((cls, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${getClassColor(cls.name || '')}`} />
                      <span className="text-sm flex-1 truncate">{cls.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {safeFixed(cls.area_km2, 1)} km²
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {safeFixed(cls.area_percent, 1)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual Class Distribution */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Class Distribution</p>
                <div className="h-4 rounded-full overflow-hidden flex">
                  {classificationResults.classes?.map((cls, i) => (
                    <div
                      key={i}
                      className={`${getClassColor(cls.name || '')} h-full`}
                      style={{ width: `${Math.max(0, Number(cls.area_percent) || 0)}%` }}
                      title={`${cls.name}: ${safeFixed(cls.area_percent, 1)}%`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Change Detection Results */}
      {changeDetection && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h4 className="font-semibold">Change Detection</h4>
            </div>
            <Badge variant="outline" className="capitalize">
              {changeDetection.method?.replace(/_/g, ' ') || "Detection"}
            </Badge>
          </div>

          {changeDetectionUnavailable ? (
            <p className="text-sm text-muted-foreground">Change detection details are temporarily unavailable while the AI provider recovers.</p>
          ) : (
            <>

              {/* Change Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
                  <span className="text-xs text-muted-foreground">Changed Area</span>
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-400">
                    {safeFixed(changeDetection.total_changed_area_km2, 1)} km²
                  </p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <span className="text-xs text-muted-foreground">Change Rate</span>
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">
                    {safeFixed(changeDetection.change_percent, 1)}%
                  </p>
                </div>
              </div>

              {/* Change Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Changed</span>
                  <span>No Change</span>
                </div>
                <Progress value={Number(changeDetection.change_percent) || 0} className="h-3" />
              </div>

              <Separator />

              {/* Major Changes */}
              {changeDetection.major_changes && changeDetection.major_changes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Major Changes Detected
                  </p>
                  <div className="space-y-2">
                    {changeDetection.major_changes.slice(0, 4).map((change, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                        <span className="text-sm truncate flex-1">{change.type}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {safeFixed(change.area_km2, 1)} km²
                          </span>
                          <Badge className={`text-xs ${getSeverityColor(change.severity)}`}>
                            {change.severity}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Change Matrix Transitions */}
              {changeDetection.change_matrix && changeDetection.change_matrix.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Top Transitions</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {changeDetection.change_matrix.slice(0, 5).map((entry, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-1.5 bg-muted/20 rounded">
                        <span className="truncate flex-1">{entry.from_class}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="truncate flex-1">{entry.to_class}</span>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {safeFixed(entry.percent, 1)}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Change Hotspots */}
              {changeDetection.change_hotspots?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Change Hotspots
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {changeDetection.change_hotspots.slice(0, 3).map((hotspot, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {hotspot.location} ({hotspot.confidence}%)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
};

export default ClassificationResults;
