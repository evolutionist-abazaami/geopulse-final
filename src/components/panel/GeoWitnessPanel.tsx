import { useEffect, useState } from "react";
import {
  Play, GitCompare, Clock, FileType, Upload, Star, MousePointer, Loader2,
  AlertTriangle, ChevronDown, Satellite,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import LocationSearch from "@/components/LocationSearch";
import ReportGenerator from "@/components/ReportGenerator";
import FileUploadAnalysis from "@/components/FileUploadAnalysis";
import SavedLocations from "@/components/SavedLocations";
import ComparisonMode from "@/components/ComparisonMode";
import TimeLapseAnimation from "@/components/TimeLapseAnimation";
import GISExportButton from "@/components/GISExportButton";
import ShapefileImport from "@/components/ShapefileImport";
import CloudCoverageDisplay from "@/components/CloudCoverageDisplay";
import DataProvenancePanel from "@/components/DataProvenancePanel";
import ClassificationResults from "@/components/ClassificationResults";
import SpectralIndicesDisplay from "@/components/SpectralIndicesDisplay";
import RealTimeRegionalStatus from "@/components/RealTimeRegionalStatus";

import { useMapContext } from "@/contexts/MapContext";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import { AnalysisFeature } from "@/lib/gis-export";

// Ported verbatim from the old GeoWitness.tsx page.
const eventTypes = [
  { value: "deforestation", label: "Deforestation", icon: "🌳" },
  { value: "forest_degradation", label: "Forest Degradation", icon: "🌲" },
  { value: "reforestation", label: "Reforestation", icon: "🌱" },
  { value: "vegetation_loss", label: "Vegetation Loss", icon: "🍃" },
  { value: "mangrove_loss", label: "Mangrove Loss", icon: "🌿" },
  { value: "flood", label: "Flood", icon: "🌊" },
  { value: "drought", label: "Drought", icon: "🏜️" },
  { value: "rainfall", label: "Rainfall Patterns", icon: "🌧️" },
  { value: "water_scarcity", label: "Water Scarcity", icon: "💧" },
  { value: "lake_drying", label: "Lake Drying", icon: "🏞️" },
  { value: "river_changes", label: "River Changes", icon: "🏞️" },
  { value: "wetland_loss", label: "Wetland Loss", icon: "🦆" },
  { value: "coastal_erosion", label: "Coastal Erosion", icon: "🏖️" },
  { value: "wildfire", label: "Wildfire", icon: "🔥" },
  { value: "bushfire", label: "Bushfire", icon: "🔥" },
  { value: "agricultural_burning", label: "Agricultural Burning", icon: "🔥" },
  { value: "climate_change", label: "Climate Change Impact", icon: "🌡️" },
  { value: "temperature_anomaly", label: "Temperature Anomaly", icon: "🌡️" },
  { value: "heatwave", label: "Heatwave", icon: "☀️" },
  { value: "cyclone", label: "Cyclone/Hurricane", icon: "🌀" },
  { value: "storm", label: "Storm Activity", icon: "⛈️" },
  { value: "desertification", label: "Desertification", icon: "🏜️" },
  { value: "soil_erosion", label: "Soil Erosion", icon: "⛰️" },
  { value: "land_degradation", label: "Land Degradation", icon: "🪨" },
  { value: "salinization", label: "Soil Salinization", icon: "🧂" },
  { value: "agriculture", label: "Agricultural Change", icon: "🌾" },
  { value: "crop_health", label: "Crop Health", icon: "🌾" },
  { value: "irrigation_change", label: "Irrigation Change", icon: "💦" },
  { value: "livestock_impact", label: "Livestock Impact", icon: "🐄" },
  { value: "urbanization", label: "Urbanization", icon: "🏙️" },
  { value: "urban_sprawl", label: "Urban Sprawl", icon: "🏘️" },
  { value: "infrastructure", label: "Infrastructure Development", icon: "🛤️" },
  { value: "mining", label: "Mining Activity", icon: "⛏️" },
  { value: "habitat_loss", label: "Habitat Loss", icon: "🦁" },
  { value: "ecosystem_change", label: "Ecosystem Change", icon: "🌍" },
  { value: "wildlife_migration", label: "Wildlife Migration", icon: "🦓" },
  { value: "air_pollution", label: "Air Pollution", icon: "💨" },
  { value: "dust_storms", label: "Dust Storms", icon: "🌪️" },
  { value: "heavy_metal_pollution", label: "Heavy Metal Pollution", icon: "☢️" },
  { value: "water_contamination", label: "Water Contamination", icon: "🧪" },
  { value: "soil_contamination", label: "Soil Contamination", icon: "⚠️" },
  { value: "industrial_pollution", label: "Industrial Pollution", icon: "🏭" },
  { value: "oil_spill", label: "Oil Spill", icon: "🛢️" },
  { value: "acid_mine_drainage", label: "Acid Mine Drainage", icon: "⛏️" },
  { value: "snow_ice", label: "Snow & Ice Changes", icon: "❄️" },
  { value: "glacier_melt", label: "Glacier Melting", icon: "🏔️" },
  { value: "volcanic_activity", label: "Volcanic Activity", icon: "🌋" },
];

const isFallbackAnalysis = (data: any) => Boolean(data?.fallback);

// Return unavailable data rather than manufacturing a satellite result offline.
const generateLocalSatelliteAnalysis = (
  eventTypesToAnalyze: string[],
  regionName: string,
  startDate: string,
  endDate: string,
  coordinates: { lat: number; lng: number },
  failure?: { reason: string; status?: number; message: string },
) => {
  const mainEvent = eventTypesToAnalyze[0] || "environmental_change";
  const result = {
    fallback: true,
    fallbackReason: failure?.reason ?? "SERVICE_UNAVAILABLE",
    providerStatus: failure?.status ?? null,
    providerMessage: failure?.message ?? "The satellite analysis service could not be reached.",
    analysisMethod: "model_only",
    eventType: mainEvent,
    eventTypes: eventTypesToAnalyze,
    isMultiEvent: false,
    region: regionName,
    startDate,
    endDate,
    area: null,
    changePercent: null,
    summary: "No analysis data is available because the satellite analysis service could not be reached.",
    fullAnalysis: "No measured satellite values or model-generated narrative are available for this request.",
    severity: null,
    recommendations: [],
    dataSources: [],
    cloudCoverage: null,
    dataQuality: null,
    sensorInfo: {
      sensor: "Sentinel-2 MSI L2A",
      statistics_grid: "128x128",
      metres_per_cell: {
        x: 0.1 * 111_320 * Math.cos((coordinates.lat * Math.PI) / 180) / 128,
        y: 0.1 * 111_320 / 128,
      },
      center: coordinates,
      native_band_resolutions_m: { B02: 10, B03: 10, B04: 10, B08: 10, B11: 20, B12: 20 },
    },
    spectralIndices: null,
    classificationResults: null,
    classificationType: null,
    changeDetection: null,
    enableChangeDetection: false,
    multiEventAnalysis: null,
    temporalBreakdown: null,
    predictiveModeling: null,
    methodologyTransparency: null,
    dataProvenance: {
      analysisMethod: "model_only",
      disclaimer: "No measured values or generated narrative are available.",
      realDataSourcesUsed: [],
    },
    coordinates,
    timestamp: new Date().toISOString(),
  };
  const unavailable = {
    origin: "unavailable",
    source: "No data returned",
    sensor: "Not available",
    method: "model_only",
    dateRange: `${startDate}/${endDate}`,
  };
  return {
    ...result,
    fieldProvenance: Object.fromEntries(
      [...Object.keys(result), "fieldProvenance"].map((field) => [field, unavailable]),
    ),
  };
};

type Tool = "analysis" | "compare" | "timelapse" | "import" | "upload" | "watchlist";

const TOOLS: { id: Tool; label: string; icon: typeof Play }[] = [
  { id: "analysis", label: "Analysis", icon: Play },
  { id: "compare", label: "Compare", icon: GitCompare },
  { id: "timelapse", label: "Time-Lapse", icon: Clock },
  { id: "import", label: "GIS Import", icon: FileType },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "watchlist", label: "Watchlist", icon: Star },
];

export function GeoWitnessPanel() {
  const mapCtx = useMapContext();
  const { saveAnalysis } = useAnalysisHistory();
  const [tool, setTool] = useState<Tool>("analysis");

  const [eventType, setEventType] = useState("deforestation");
  const [region, setRegion] = useState("");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [importedFeatures, setImportedFeatures] = useState<AnalysisFeature[]>([]);

  const handleLocationSelect = (location: { name: string; lat: number; lng: number }) => {
    setRegion(location.name);
    setSelectedLocation({ lat: location.lat, lng: location.lng, name: location.name });
    mapCtx.setSelectedArea({ lat: location.lat, lng: location.lng });
    mapCtx.setView([location.lat, location.lng], 10);
    mapCtx.setSelectionMode(false);
  };

  // Arms the shared map's click-to-select while the Analysis tool is the
  // active tool, matching the old page's "Select on Map" behavior.
  useEffect(() => {
    if (tool !== "analysis") return;
    mapCtx.setOnLocationSelect((location) => {
      setSelectedLocation(location);
      setRegion(location.name);
      mapCtx.setSelectedArea({ lat: location.lat, lng: location.lng });
      mapCtx.setSelectionMode(false);
      toast.success(`Selected: ${location.name}`);
    });
    return () => mapCtx.setOnLocationSelect(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const handleShapefileImport = (
    features: AnalysisFeature[],
    bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ) => {
    setImportedFeatures(features);
    mapCtx.setMarkers(features.map((f) => ({ lat: f.coordinates.lat, lng: f.coordinates.lng, label: f.name, color: "#3b82f6" })));
    mapCtx.setView([(bounds.minLat + bounds.maxLat) / 2, (bounds.minLng + bounds.maxLng) / 2], 8);
    toast.success(`Loaded ${features.length} features from GIS file`);
  };

  const runAnalysis = async () => {
    if (!selectedLocation) {
      toast.error("Please select a location before running analysis - search for a place or click the map.");
      return;
    }

    const coordinates = selectedLocation;
    const targetRegionName = selectedLocation.name;
    const eventTypesToAnalyze = [eventType];

    setIsAnalyzing(true);
    setResults(null);
    toast.info(`Starting AI-powered satellite analysis for ${eventTypesToAnalyze.length} event type(s)...`);

    const applyResult = (data: any) => {
      setResults(data);
      mapCtx.setMarkers([{
        lat: coordinates.lat, lng: coordinates.lng,
        label: `${region || selectedLocation?.name} - ${eventType}`,
        color: data.changePercent > 50 ? "#ef4444" : "#f97316",
      }]);
      const boundarySize = 0.15;
      const changePercent = typeof data.changePercent === "number" ? data.changePercent : null;
      mapCtx.setPolygons([{
        coordinates: [
          [coordinates.lng - boundarySize, coordinates.lat + boundarySize],
          [coordinates.lng + boundarySize, coordinates.lat + boundarySize],
          [coordinates.lng + boundarySize, coordinates.lat - boundarySize],
          [coordinates.lng - boundarySize, coordinates.lat - boundarySize],
          [coordinates.lng - boundarySize, coordinates.lat + boundarySize],
        ],
        label: changePercent === null
          ? `${eventType.replace(/_/g, " ")} analysis — change not measured`
          : `${changePercent.toFixed(1)}% ${eventType.replace(/_/g, " ")} change measured`,
        color: changePercent === null ? "#6b7280" : changePercent > 50 ? "#ef4444" : changePercent > 25 ? "#f97316" : "#22c55e",
        fillOpacity: 0.3,
      }]);
      mapCtx.setView([coordinates.lat, coordinates.lng], 10);
      mapCtx.highlightRegion({
        north: coordinates.lat + boundarySize, south: coordinates.lat - boundarySize,
        east: coordinates.lng + boundarySize, west: coordinates.lng - boundarySize,
      });

      if (!data?.fallback) {
        saveAnalysis({
          type: "geowitness",
          eventType: eventTypesToAnalyze[0],
          regionName: targetRegionName,
          regionBounds: {
            north: coordinates.lat + boundarySize, south: coordinates.lat - boundarySize,
            east: coordinates.lng + boundarySize, west: coordinates.lng - boundarySize,
          },
          dateRange: { start: startDate, end: endDate },
          resultPayload: data,
        });
      }
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      let response: Response;
      try {
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-satellite`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim(),
              Authorization: `Bearer ${session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
            },
            body: JSON.stringify({
              eventTypes: eventTypesToAnalyze, eventType: eventTypesToAnalyze[0],
              region: targetRegionName, startDate, endDate, coordinates,
            }),
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      let data: unknown;
      if (response.ok) {
        data = await response.json();
      } else {
        const responseText = await response.text();
        let providerMessage = response.statusText || "The analysis request failed.";
        try {
          const errorBody = JSON.parse(responseText);
          if (typeof errorBody?.error === "string") providerMessage = errorBody.error;
          else if (typeof errorBody?.message === "string") providerMessage = errorBody.message;
        } catch {
          if (responseText.trim()) providerMessage = responseText.trim().slice(0, 240);
        }
        data = generateLocalSatelliteAnalysis(
          eventTypesToAnalyze,
          targetRegionName,
          startDate,
          endDate,
          coordinates,
          { reason: "FUNCTION_HTTP_ERROR", status: response.status, message: providerMessage },
        );
      }

      applyResult(data);
      if (isFallbackAnalysis(data)) {
        toast.warning("No measured values are available for this analysis.");
      } else {
        toast.success("Satellite analysis complete!");
      }
    } catch (error) {
      console.error("Analysis API request failed:", error);
      const fallbackData = generateLocalSatelliteAnalysis(
        eventTypesToAnalyze,
        targetRegionName,
        startDate,
        endDate,
        coordinates,
        {
          reason: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "The analysis request failed before a response was received.",
        },
      );
      applyResult(fallbackData);
      toast.error("Analysis service is unavailable. No measured values are shown.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sensorInfo = results?.sensorInfo ?? results?.landsatInfo;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap border-b border-gray-200 dark:border-border-subtle flex-shrink-0">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            className={cn(
              "flex items-center gap-1.5 text-[12px] py-2.5 px-3 border-b-2 transition-all duration-fast whitespace-nowrap",
              tool === t.id
                ? "text-brand border-brand"
                : "text-gray-400 dark:text-v2-muted border-transparent hover:text-gray-600 dark:hover:text-v2-secondary"
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin p-3.5 space-y-4">
        {tool === "analysis" && (
          <div className="space-y-4">
            <div>
              <label className="text-[13px] font-medium mb-2 block text-gray-900 dark:text-v2-primary">Event Type</label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {eventTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2"><span>{type.icon}</span>{type.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[13px] font-medium mb-2 block text-gray-900 dark:text-v2-primary">Search Location</label>
              <LocationSearch onLocationSelect={handleLocationSelect} onInputChange={(val) => setRegion(val)} placeholder="Search any place in Africa..." defaultValue={region} />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => mapCtx.setSelectionMode(!mapCtx.selectionMode)}
            >
              <MousePointer className="h-4 w-4 mr-2" />
              {mapCtx.selectionMode ? "Cancel Selection" : "Select on Map"}
            </Button>

            {selectedLocation && (
              <div className="p-3 bg-brand-dim border border-brand-border rounded-lg">
                <p className="text-[13px] font-medium text-brand">Selected Location:</p>
                <p className="text-[13px] truncate text-gray-700 dark:text-v2-secondary">{selectedLocation.name}</p>
                <p className="text-[11px] text-gray-400 dark:text-v2-muted">{selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[13px] font-medium mb-2 block text-gray-900 dark:text-v2-primary">Start Date</label>
                <DatePicker value={startDate} onChange={setStartDate} className="w-full" />
              </div>
              <div>
                <label className="text-[13px] font-medium mb-2 block text-gray-900 dark:text-v2-primary">End Date</label>
                <DatePicker value={endDate} onChange={setEndDate} className="w-full" />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Classification, change matrices, and multi-event analysis are disabled until they use measured inputs.
            </p>

            <Button className="w-full bg-gradient-ocean hover:opacity-90" onClick={runAnalysis} disabled={isAnalyzing}>
              {isAnalyzing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing with Sentinel-2...</>
              ) : (
                <><Satellite className="h-4 w-4 mr-2" />Run Sentinel-2 Analysis</>
              )}
            </Button>
            {isAnalyzing && (
              <p className="text-[11px] text-gray-400 dark:text-v2-muted text-center">This can take up to 20-25 seconds when the AI provider is under load.</p>
            )}

            {selectedLocation && (
              <RealTimeRegionalStatus regionName={selectedLocation.name} lat={selectedLocation.lat} lng={selectedLocation.lng} />
            )}

            {results && (
              <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-border-subtle">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[15px] text-gray-900 dark:text-v2-primary">Analysis Results</h4>
                </div>
                <DataProvenancePanel results={results} />

                {sensorInfo && (
                  <div className="p-3 bg-brand-dim border border-brand-border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Satellite className="h-4 w-4 text-brand" />
                      <span className="text-[13px] font-medium text-gray-900 dark:text-v2-primary">{sensorInfo.sensor || "Sentinel-2 MSI L2A"}</span>
                      {sensorInfo.statistics_grid && <Badge variant="outline" className="text-xs">{sensorInfo.statistics_grid} statistics grid</Badge>}
                    </div>
                    {sensorInfo.metres_per_cell && (
                      <p className="text-xs text-muted-foreground">
                        Grid cell: {sensorInfo.metres_per_cell.x.toFixed(1)} × {sensorInfo.metres_per_cell.y.toFixed(1)} m
                      </p>
                    )}
                  </div>
                )}

                <CloudCoverageDisplay
                  cloudCoverage={typeof results.cloudCoverage?.maskedPixelRatio === "number" ? results.cloudCoverage.maskedPixelRatio * 100 : null}
                  dataQuality={typeof results.dataQuality?.validPixelRatio === "number" ? results.dataQuality.validPixelRatio * 100 : null}
                  sensorType={sensorInfo?.sensor}
                  acquisitionDate={sensorInfo?.acquisition_dates?.[0]}
                />
                <SpectralIndicesDisplay spectralIndices={results.spectralIndices} sensorInfo={sensorInfo} landsatInfo={sensorInfo} />
                <ClassificationResults classificationResults={results.classificationResults} changeDetection={results.changeDetection} />

                <div className="p-3 rounded-lg bg-critical-dim border border-critical/20 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-critical mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-critical text-sm">
                      {results.fallback ? "Analysis Unavailable" : results.severity ? `${results.severity} impact` : "Severity unavailable"}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted">
                      {results.fallback
                        ? "No measured values or generated narrative are available. Retry when the service is available."
                        : results.fieldProvenance?.severity?.origin === "model_generated"
                          ? "Model-generated interpretation; not a measured result."
                          : "Severity is derived from measured NDVI change using documented thresholds."}
                    </p>
                    {results.fallback && results.providerMessage && (
                      <p className="text-[11px] text-gray-500 dark:text-v2-muted mt-1">
                        Service detail{results.providerStatus ? ` (HTTP ${results.providerStatus})` : ""}: {results.providerMessage}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 dark:bg-surface-2 rounded-lg">
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted">Event</p>
                    <p className="font-semibold text-[13px] capitalize text-gray-900 dark:text-v2-primary">
                      {results.isMultiEvent ? `${results.eventTypes?.length || 1} events` : results.eventType?.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-surface-2 rounded-lg">
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted">Change</p>
                    <p className="font-bold text-xl text-critical">
                      {typeof results.changePercent === "number" ? `${results.changePercent.toFixed(1)}%` : "Unavailable"}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {results.fieldProvenance?.changePercent?.origin === "measured" ? "Measured" : "Not measured"}
                    </Badge>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted">Summary</p>
                    <Badge variant="outline" className="text-[10px]">
                      {results.fieldProvenance?.summary?.origin === "model_generated" ? "Model-generated text" : "Unavailable"}
                    </Badge>
                  </div>
                  <p className="text-[13px] leading-relaxed text-gray-700 dark:text-v2-secondary">{results.summary}</p>
                </div>

                {results.fullAnalysis && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[11px] text-gray-400 dark:text-v2-muted">Detailed Analysis</p>
                      <Badge variant="outline" className="text-[10px]">Model-generated text</Badge>
                    </div>
                    <div className="text-[13px] leading-relaxed bg-gray-50 dark:bg-surface-2 p-3 rounded-lg text-gray-700 dark:text-v2-secondary">{results.fullAnalysis}</div>
                  </div>
                )}

                {results.recommendations?.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[11px] text-gray-400 dark:text-v2-muted font-medium">Recommendations</p>
                      <Badge variant="outline" className="text-[10px]">Model-generated text</Badge>
                    </div>
                    <div className="space-y-2">
                      {results.recommendations.map((rec: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-2 text-[13px] text-gray-700 dark:text-v2-secondary">
                          <span className="h-1.5 w-1.5 rounded-full bg-brand mt-1.5 flex-shrink-0" />
                          <p>{typeof rec === "string" ? rec : rec.detail || rec.action || JSON.stringify(rec)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <ReportGenerator
                    analysisData={results}
                    eventType={results.isMultiEvent ? results.eventTypes?.join(", ") : eventType}
                    region={region || selectedLocation?.name}
                    lat={results?.coordinates?.lat}
                    lng={results?.coordinates?.lng}
                    onCaptureMap={() => mapCtx.captureSnapshot()}
                  />
                  <GISExportButton
                    features={[{
                      id: results.id || crypto.randomUUID(),
                      name: region || selectedLocation?.name || "Unknown",
                      coordinates: selectedLocation || { lat: mapCtx.center[0], lng: mapCtx.center[1] },
                      eventType: results.eventType || eventType,
                      changePercent: results.changePercent,
                      startDate, endDate,
                      summary: results.summary,
                      areaAnalyzed: results.area,
                      createdAt: new Date().toISOString(),
                    } as AnalysisFeature]}
                    filename={`geopulse-${eventType}-${region?.replace(/[^a-zA-Z0-9]/g, "_") || "analysis"}`}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {tool === "compare" && (
          <ComparisonMode onComparisonComplete={(result) => { if (result?.location) toast.success("Comparison analysis displayed"); }} />
        )}

        {tool === "timelapse" && (
          <TimeLapseAnimation onFrameChange={() => {}} mapCenter={mapCtx.center} />
        )}

        {tool === "import" && (
          <div className="space-y-4">
            <p className="text-[13px] text-gray-500 dark:text-v2-muted">
              Import Shapefiles (.shp) or GeoJSON files for analysis. Compatible with QGIS, ArcGIS, and other GIS applications.
            </p>
            <ShapefileImport onImport={handleShapefileImport} />
            {importedFeatures.length > 0 && (
              <div className="p-3 bg-brand-dim border border-brand-border rounded-lg">
                <p className="text-[13px] font-medium text-brand mb-2">{importedFeatures.length} features loaded</p>
                <GISExportButton features={importedFeatures} filename="geopulse-imported" />
              </div>
            )}
          </div>
        )}

        {tool === "upload" && <FileUploadAnalysis />}

        {tool === "watchlist" && (
          <SavedLocations onLocationSelect={handleLocationSelect} currentLocation={selectedLocation} />
        )}
      </div>
    </div>
  );
}
