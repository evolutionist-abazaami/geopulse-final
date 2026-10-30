import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileUp, MapPin, Loader2, CheckCircle2, AlertCircle, X, FileType } from "lucide-react";
import { toast } from "sonner";
import { parseShapefile, readFileAsArrayBuffer, ShapefileImportResult } from "@/lib/shapefile-utils";
import { AnalysisFeature } from "@/lib/gis-export";
import type { ImportedGeoJSON } from "@/types/importedGeoJSON";

interface ShapefileImportProps {
  onImport: (
    features: AnalysisFeature[],
    bounds: ShapefileImportResult['bounds'],
    geoJSON: ImportedGeoJSON
  ) => void;
}

type ImportedFeature = ImportedGeoJSON["features"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImportedFeature(value: unknown): value is ImportedFeature {
  if (!isRecord(value) || value.type !== "Feature" || !isRecord(value.geometry)) return false;
  const geometryType = value.geometry.type;
  return (
    typeof geometryType === "string" &&
    ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(geometryType) &&
    Array.isArray(value.geometry.coordinates)
  );
}

function collectPositions(coordinates: unknown, positions: number[][]): void {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number" &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    positions.push([coordinates[0], coordinates[1]]);
    return;
  }
  coordinates.forEach(coordinate => collectPositions(coordinate, positions));
}

const ShapefileImport = ({ onImport }: ShapefileImportProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ShapefileImportResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      const extension = f.name.split('.').pop()?.toLowerCase();
      return extension === 'shp' ||
        extension === 'dbf' ||
        extension === 'shx' ||
        extension === 'prj' ||
        extension === 'geojson' ||
        extension === 'json';
    }
    );
    
    if (validFiles.length === 0) {
      toast.error("Please select valid GIS files (.shp, .dbf, .geojson)");
      return;
    }
    
    setSelectedFiles(previousFiles => {
      const selectedByName = new Map(previousFiles.map(file => [file.name.toLowerCase(), file]));
      validFiles.forEach(file => selectedByName.set(file.name.toLowerCase(), file));
      return [...selectedByName.values()];
    });
    setImportResult(null);
    e.target.value = "";
  };

  const processFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setProgress(10);

    try {
      // Check for GeoJSON first
      const geoJsonFile = selectedFiles.find(f => /\.(geojson|json)$/i.test(f.name));
      
      if (geoJsonFile) {
        setProgress(30);
        const text = await geoJsonFile.text();
        const geoJSON: unknown = JSON.parse(text);
        
        setProgress(60);
        const features: AnalysisFeature[] = [];
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        
        let candidateFeatures: unknown[];
        if (isRecord(geoJSON) && geoJSON.type === "FeatureCollection" && Array.isArray(geoJSON.features)) {
          candidateFeatures = geoJSON.features;
        } else if (isImportedFeature(geoJSON)) {
          candidateFeatures = [geoJSON];
        } else {
          throw new Error("GeoJSON must be a FeatureCollection or Feature");
        }

        const validGeoFeatures: ImportedGeoJSON["features"] = [];
        const importedGeoJSON: ImportedGeoJSON = {
          type: 'FeatureCollection',
          features: validGeoFeatures,
        };
        candidateFeatures.forEach((candidate, index) => {
          if (!isImportedFeature(candidate) || candidate.geometry.type === "GeometryCollection") return;
          const positions: number[][] = [];
          collectPositions(candidate.geometry.coordinates, positions);
          if (positions.length === 0) return;
          validGeoFeatures.push(candidate);

          const lng = positions.reduce((sum, point) => sum + point[0], 0) / positions.length;
          const lat = positions.reduce((sum, point) => sum + point[1], 0) / positions.length;
          positions.forEach(([positionLng, positionLat]) => {
            minLat = Math.min(minLat, positionLat);
            maxLat = Math.max(maxLat, positionLat);
            minLng = Math.min(minLng, positionLng);
            maxLng = Math.max(maxLng, positionLng);
          });

          const props = candidate.properties ?? {};
          const eventType = props.event_type ?? props.type;
          const changePercent = Number(props.change_percent);
          features.push({
            id: `geo_${index}_${Date.now()}`,
            name: String(props.name ?? props.NAME ?? `Feature ${index + 1}`),
            coordinates: { lat, lng },
            eventType: String(eventType ?? 'environmental_change'),
            changePercent: Number.isFinite(changePercent) ? changePercent : undefined,
            startDate: String(props.start_date ?? new Date().toISOString().split('T')[0]),
            endDate: String(props.end_date ?? new Date().toISOString().split('T')[0]),
            summary: props.summary === undefined && props.description === undefined
              ? undefined
              : String(props.summary ?? props.description),
            areaAnalyzed: props.area === undefined ? undefined : String(props.area),
            createdAt: new Date().toISOString(),
          });
        });

        if (features.length === 0) {
          throw new Error("No valid geometries were found in the selected file");
        }
        setProgress(100);
        const result: ShapefileImportResult = {
          features,
          properties: validGeoFeatures.map(feature => feature.properties ?? {}),
          geoJSON: importedGeoJSON,
          bounds: { minLat, maxLat, minLng, maxLng },
        };
        
        setImportResult(result);
        toast.success(`Imported ${features.length} features from GeoJSON`);
      } else {
        // Process Shapefile
        const shpFile = selectedFiles.find(f => /\.shp$/i.test(f.name));
        const dbfFile = selectedFiles.find(f => /\.dbf$/i.test(f.name));
        const prjFile = selectedFiles.find(f => /\.prj$/i.test(f.name));
        
        if (!shpFile) {
          throw new Error("No .shp file found");
        }

        setProgress(30);
        const shpBuffer = await readFileAsArrayBuffer(shpFile);
        
        setProgress(50);
        let dbfBuffer: ArrayBuffer | undefined;
        if (dbfFile) {
          dbfBuffer = await readFileAsArrayBuffer(dbfFile);
        }
        const prjText = prjFile ? await prjFile.text() : undefined;

        setProgress(70);
        const result = await parseShapefile(shpBuffer, dbfBuffer, prjText);
        
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from Shapefile`);
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error(`Failed to import: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmImport = () => {
    if (importResult) {
      onImport(importResult.features, importResult.bounds, importResult.geoJSON);
      toast.success("Features loaded to map");
      setSelectedFiles([]);
      setImportResult(null);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileType className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Import GIS Data</h3>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".shp,.dbf,.shx,.prj,.geojson,.json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {selectedFiles.length === 0 ? (
        <Button
          variant="outline"
          className="w-full h-24 border-dashed flex flex-col gap-2"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-6 w-6" />
          <span className="text-sm">Select Shapefile or GeoJSON</span>
          <span className="text-xs text-muted-foreground">.shp, .dbf, .geojson supported</span>
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileType className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm truncate">{file.name}</span>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {(file.size / 1024).toFixed(1)} KB
                  </Badge>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Processing... {progress}%
              </p>
            </div>
          )}

          {importResult && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium text-sm">Import Preview</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Features:</span>{" "}
                  <span className="font-medium">{importResult.features.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Types:</span>{" "}
                  <span className="font-medium">
                    {[...new Set(importResult.features.map(f => f.eventType))].length}
                  </span>
                </div>
              </div>
              {importResult.features.slice(0, 3).map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
              {importResult.features.length > 3 && (
                <p className="text-xs text-muted-foreground">
                  +{importResult.features.length - 3} more features
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {!importResult ? (
              <Button 
                onClick={processFiles} 
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileUp className="h-4 w-4 mr-2" />
                    Process Files
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setImportResult(null)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={confirmImport} className="flex-1">
                  <MapPin className="h-4 w-4 mr-2" />
                  Load to Map
                </Button>
              </>
            )}
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            + Add more files
          </Button>
        </div>
      )}
    </Card>
  );
};

export default ShapefileImport;
