import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileJson, Map, Loader2, FileArchive, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  AnalysisFeature,
  exportAsCSV,
  exportAsGeoJSON,
  exportAsKML,
  exportAsShapefileZip,
} from "@/lib/gis-export";
import type { ImportedGeoJSON } from "@/types/importedGeoJSON";

interface GISExportButtonProps {
  features: AnalysisFeature[];
  filename?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
  importedGeoJSON?: ImportedGeoJSON | null;
}

export const GISExportButton = ({
  features,
  filename = "geopulse-export",
  variant = "outline",
  size = "sm",
  className = "",
  disabled = false,
  importedGeoJSON,
}: GISExportButtonProps) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format: "geojson" | "kml" | "shapefile" | "csv") => {
    if (features.length === 0 && !importedGeoJSON?.features.length) {
      toast.error("No data to export");
      return;
    }

    setExporting(true);
    try {
      if (format === "geojson") {
        exportAsGeoJSON(features, filename, importedGeoJSON ?? undefined);
        toast.success(`Exported ${importedGeoJSON?.features.length ?? features.length} feature(s) as GeoJSON`);
      } else if (format === "kml") {
        exportAsKML(features, filename, importedGeoJSON ?? undefined);
        toast.success(`Exported ${importedGeoJSON?.features.length ?? features.length} feature(s) as KML`);
      } else if (format === "csv") {
        exportAsCSV(features, filename, importedGeoJSON ?? undefined);
        toast.success(`Exported ${importedGeoJSON?.features.length ?? features.length} feature(s) as CSV`);
      } else {
        await exportAsShapefileZip(features, filename, importedGeoJSON ?? undefined);
        toast.success(`Exported ${importedGeoJSON?.features.length ?? features.length} feature(s) as Shapefile (.zip)`);
      }
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          disabled={disabled || exporting || (features.length === 0 && !importedGeoJSON?.features.length)}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export GIS
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("shapefile")}>
          <FileArchive className="h-4 w-4 mr-2" />
          Shapefile (.zip)
          <span className="ml-auto text-xs text-muted-foreground">ArcGIS / QGIS</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("geojson")}>
          <FileJson className="h-4 w-4 mr-2" />
          GeoJSON (.geojson)
          <span className="ml-auto text-xs text-muted-foreground">QGIS / GDAL</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("kml")}>
          <Map className="h-4 w-4 mr-2" />
          KML (.kml)
          <span className="ml-auto text-xs text-muted-foreground">Google Earth</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          CSV (.csv)
          <span className="ml-auto text-xs text-muted-foreground">Coordinates / WKT</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default GISExportButton;
