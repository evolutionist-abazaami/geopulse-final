import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FileUp, MapPin, Loader2, CheckCircle2, X, FileType } from "lucide-react";
import { toast } from "sonner";
import {
  extractKMLFromKMZ,
  extractShapefileArchive,
  parseShapefile,
  readFileAsArrayBuffer,
  ShapefileImportResult,
} from "@/lib/shapefile-utils";
import { AnalysisFeature } from "@/lib/gis-export";
import { parseCSVText, parseGeoJSONText, parseGeoTIFFFile, parseKMLText } from "@/lib/gis-import";
import type { ImportedGeoJSON, ImportedRasterOverlay } from "@/types/importedGeoJSON";

interface ShapefileImportProps {
  onImport: (
    features: AnalysisFeature[],
    bounds: ShapefileImportResult['bounds'],
    geoJSON: ImportedGeoJSON,
    raster?: ImportedRasterOverlay
  ) => void;
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
        extension === 'zip' ||
        extension === 'kmz' ||
        extension === 'geojson' ||
        extension === 'json' ||
        extension === 'kml' ||
        extension === 'csv' ||
        extension === 'tif' ||
        extension === 'tiff';
    }
    );
    
    if (validFiles.length === 0) {
      toast.error("Please select a supported GIS file: Shapefile, GeoJSON, KML/KMZ, CSV, or GeoTIFF");
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
      const archiveFile = selectedFiles.find(file => /\.zip$/i.test(file.name));
      const kmzFile = selectedFiles.find(file => /\.kmz$/i.test(file.name));
      const geoJsonFile = selectedFiles.find(f => /\.(geojson|json)$/i.test(f.name));
      const kmlFile = selectedFiles.find(file => /\.kml$/i.test(file.name));
      const csvFile = selectedFiles.find(file => /\.csv$/i.test(file.name));
      const tiffFile = selectedFiles.find(file => /\.tiff?$/i.test(file.name));

      if (archiveFile) {
        setProgress(30);
        const archive = extractShapefileArchive(await readFileAsArrayBuffer(archiveFile));
        setProgress(65);
        const result = await parseShapefile(archive.shpBuffer, archive.dbfBuffer, archive.prjText);
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from Shapefile archive`);
      } else if (kmzFile) {
        setProgress(30);
        const kmlText = extractKMLFromKMZ(await readFileAsArrayBuffer(kmzFile));
        const result = parseKMLText(kmlText);
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from KMZ`);
      } else if (geoJsonFile) {
        setProgress(30);
        const result = parseGeoJSONText(await geoJsonFile.text());
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from GeoJSON`);
      } else if (kmlFile) {
        setProgress(30);
        const result = parseKMLText(await kmlFile.text());
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from KML`);
      } else if (csvFile) {
        setProgress(30);
        const result = parseCSVText(await csvFile.text());
        setProgress(100);
        setImportResult(result);
        toast.success(`Imported ${result.features.length} features from CSV`);
      } else if (tiffFile) {
        setProgress(30);
        const raster = await parseGeoTIFFFile(tiffFile);
        const longitudes = raster.coordinates.map(([lng]) => lng);
        const latitudes = raster.coordinates.map(([, lat]) => lat);
        const result: ShapefileImportResult = {
          features: [],
          properties: [],
          geoJSON: { type: "FeatureCollection", features: [] },
          raster,
          bounds: {
            minLat: Math.min(...latitudes),
            maxLat: Math.max(...latitudes),
            minLng: Math.min(...longitudes),
            maxLng: Math.max(...longitudes),
          },
        };
        setProgress(100);
        setImportResult(result);
        toast.success(`Raster ready to display: ${raster.name}`);
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
      onImport(importResult.features, importResult.bounds, importResult.geoJSON, importResult.raster);
      toast.success(importResult.raster ? "Raster loaded to map" : "Features loaded to map");
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
        accept=".shp,.dbf,.shx,.prj,.zip,.geojson,.json,.kml,.kmz,.csv,.tif,.tiff"
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
          <span className="text-sm">Select GIS data</span>
          <span className="text-xs text-muted-foreground">Shapefile ZIP, GeoJSON, KML/KMZ, CSV, GeoTIFF</span>
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
                  <span className="text-muted-foreground">{importResult.raster ? "Layer:" : "Features:"}</span>{" "}
                  <span className="font-medium">
                    {importResult.raster ? "Raster overlay" : importResult.features.length}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{importResult.raster ? "Format:" : "Types:"}</span>{" "}
                  <span className="font-medium">
                    {importResult.raster
                      ? "GeoTIFF"
                      : [...new Set(importResult.features.map(f => f.eventType))].length}
                  </span>
                </div>
              </div>
              {importResult.raster && (
                <p className="text-xs text-muted-foreground truncate">{importResult.raster.name}</p>
              )}
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
