import { useEffect, useState } from "react";
import {
  Play, GitCompare, Clock, FileType, Upload, Star, MousePointer, Loader2,
  AlertTriangle, Layers, ChevronDown, Satellite,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import LocationSearch from "@/components/LocationSearch";
import ReportGenerator from "@/components/ReportGenerator";
import FileUploadAnalysis from "@/components/FileUploadAnalysis";
import SavedLocations from "@/components/SavedLocations";
import ComparisonMode from "@/components/ComparisonMode";
import TimeLapseAnimation from "@/components/TimeLapseAnimation";
import GISExportButton from "@/components/GISExportButton";
import MultiEventSelector from "@/components/MultiEventSelector";
import ShapefileImport from "@/components/ShapefileImport";
import CloudCoverageDisplay from "@/components/CloudCoverageDisplay";
import ClassificationControls, { ClassificationType } from "@/components/ClassificationControls";
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

const isFallbackAnalysis = (data: any) => Boolean(data?.fallback || data?.fallbackReason === "SERVICE_UNAVAILABLE");

// Ported verbatim from the old GeoWitness.tsx page - offline fallback used
// when the analyze-satellite edge function is unreachable.
const generateLocalSatelliteAnalysis = (
  eventTypesToAnalyze: string[],
  regionName: string,
  startDate: string,
  endDate: string,
  coordinates: { lat: number; lng: number },
  classificationType: ClassificationType,
  enableChangeDetection: boolean,
  numClasses: number
) => {
  const mainEvent = eventTypesToAnalyze[0] || "environmental_change";
  const formattedEvent = mainEvent.replace(/_/g, " ");
  const hash = Math.abs(Math.sin(coordinates.lat * 12.9898 + coordinates.lng * 78.233)) * 100;
  const changePercent = Number((12.4 + (hash % 28.5)).toFixed(1));
  const areaKm2 = Math.round(180 + (hash * 3.5));
  const isMultiEvent = eventTypesToAnalyze.length > 1;
  const severity = changePercent > 30 ? "high" : changePercent > 18 ? "medium" : "low";

  const summaryText = `Sentinel-2 satellite imagery analysis for ${regionName} reveals a ${changePercent}% change associated with ${formattedEvent} between ${startDate} and ${endDate}.`;
  const fullAnalysisText = `Multi-spectral analysis of Sentinel-2 MSI imagery over ${regionName} shows significant spectral variance across SWIR and NIR bands. ${formattedEvent.toUpperCase()} indicators confirm active spatial transformation across ${areaKm2} km². Vegetation health metrics (NDVI) and moisture indices (NDWI) exhibit a calculated deviation from baseline conditions.`;
  const recommendationsList = [
    `Deploy localized ground monitoring teams across primary ${formattedEvent} hotspots in ${regionName}.`,
    `Establish automated satellite surveillance alerts for the upcoming 6-month period.`,
    `Integrate regional conservation measures and engage local stakeholders for rapid intervention.`,
  ];

  return {
    // Not a real analysis - no imagery was fetched or processed. These
    // numbers are deterministically generated from the coordinates so the
    // UI has something to show when the edge function is unreachable. The
    // existing `results.fallback` banner (see the results panel below)
    // already exists for this; without this flag it was being shown as a
    // normal successful result.
    fallback: true,
    fallbackReason: "LOCAL_SIMULATION",
    eventType: mainEvent,
    eventTypes: eventTypesToAnalyze,
    isMultiEvent,
    region: regionName,
    startDate,
    endDate,
    area: `${areaKm2} km²`,
    changePercent,
    summary: summaryText,
    fullAnalysis: fullAnalysisText,
    severity,
    recommendations: recommendationsList,
    dataSources: ["Sentinel-2 MSI (Multi-Spectral Instrument)"],
    cloudCoverage: {
      percentage: Number((2.1 + (hash % 4)).toFixed(1)),
      detection_accuracy: 94.2,
      impact: "minimal",
      affected_areas: "Minor cloud masking in northern sector",
      qa_band_quality: "good",
    },
    dataQuality: {
      overall_score: 91, radiometric_quality: 94, geometric_accuracy: 92,
      temporal_coverage: 88, atmospheric_correction: "applied", reflectance_type: "SR",
    },
    analysisConfidence: 91,
    landsatInfo: {
      sensor: "Sentinel-2 MSI", spatial_resolution: "10m",
      acquisition_dates: [startDate, endDate], processing_level: "Level-2A Surface Reflectance",
      bands_used: ["B02", "B03", "B04", "B08", "B11", "B12"],
    },
    spectralIndices: {
      ndvi: { min: 0.12, max: 0.84, mean: Number((0.48 - (changePercent / 200)).toFixed(2)), std: 0.14 },
      ndwi: { min: -0.35, max: 0.42, mean: -0.08 },
      nbr: { min: -0.15, max: 0.65, mean: 0.28 },
      ndbi: { min: -0.42, max: 0.38, mean: -0.12 },
    },
    classificationResults: classificationType ? {
      method: classificationType,
      num_classes: numClasses,
      classes: [
        { id: 1, name: "Dense Forest / Vegetation", area_km2: Math.round(areaKm2 * 0.4), area_percent: 40 },
        { id: 2, name: "Open Vegetation / Agriculture", area_km2: Math.round(areaKm2 * 0.25), area_percent: 25 },
        { id: 3, name: "Bare Soil / Degraded Land", area_km2: Math.round(areaKm2 * 0.20), area_percent: 20 },
        { id: 4, name: "Water Bodies", area_km2: Math.round(areaKm2 * 0.10), area_percent: 10 },
        { id: 5, name: "Urban / Built-up", area_km2: Math.round(areaKm2 * 0.05), area_percent: 5 },
      ],
      accuracy_metrics: { overall_accuracy: 92.4, kappa_coefficient: 0.89 },
    } : null,
    classificationType,
    changeDetection: enableChangeDetection ? {
      method: "post_classification",
      total_changed_area_km2: Math.round(areaKm2 * (changePercent / 100)),
      change_percent: changePercent,
      major_changes: [{ type: `${formattedEvent} transition zone`, area_km2: Math.round(areaKm2 * 0.12), severity }],
      change_hotspots: [{ location: `${regionName} Central Sector`, confidence: 93, change_magnitude: changePercent }],
    } : null,
    enableChangeDetection,
    multiEventAnalysis: isMultiEvent ? {
      events: eventTypesToAnalyze.map(evt => ({
        event_type: evt,
        change_percent: Number((changePercent * (0.7 + Math.random() * 0.5)).toFixed(1)),
        severity,
        key_findings: `Significant activity observed for ${evt.replace(/_/g, " ")} in target area.`,
      })),
      combined_impact: `Compounding environmental impacts detected across ${eventTypesToAnalyze.length} categories.`,
    } : null,
    predictiveModeling: {
      trend_direction: changePercent > 20 ? "declining" : "stable",
      projected_change_6mo: Number((changePercent * 1.15).toFixed(1)),
      projected_change_12mo: Number((changePercent * 1.32).toFixed(1)),
      confidence: 88,
      methodology: "machine_learning_time_series",
    },
    methodologyTransparency: {
      percentage_derivation: `Calculated from pixel-level Sentinel-2 band differencing across ${startDate} to ${endDate}.`,
      uncertainty_range: { lower: Number((changePercent * 0.9).toFixed(1)), upper: Number((changePercent * 1.1).toFixed(1)) },
      confidence_interval: "95%",
      validation_notes: "Validated against Sentinel-2 Level-2A Surface Reflectance standard data models.",
      known_limitations: ["Resolution constrained to 10m Sentinel-2 grid size."],
    },
    coordinates,
    timestamp: new Date().toISOString(),
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
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [isMultiEventMode, setIsMultiEventMode] = useState(false);
  const [region, setRegion] = useState("");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState("2024-01-01");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; name: string } | null>(null);
  const [classificationType, setClassificationType] = useState<ClassificationType>(null);
  const [enableChangeDetection, setEnableChangeDetection] = useState(false);
  const [numClasses, setNumClasses] = useState(6);
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
    const eventTypesToAnalyze = isMultiEventMode && selectedEventTypes.length > 0 ? selectedEventTypes : [eventType];

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
      const changePercent = data.changePercent || 0;
      mapCtx.setPolygons([{
        coordinates: [
          [coordinates.lng - boundarySize, coordinates.lat + boundarySize],
          [coordinates.lng + boundarySize, coordinates.lat + boundarySize],
          [coordinates.lng + boundarySize, coordinates.lat - boundarySize],
          [coordinates.lng - boundarySize, coordinates.lat - boundarySize],
          [coordinates.lng - boundarySize, coordinates.lat + boundarySize],
        ],
        label: `${changePercent.toFixed(1)}% ${eventType.replace(/_/g, " ")} detected`,
        color: changePercent > 50 ? "#ef4444" : changePercent > 25 ? "#f97316" : "#22c55e",
        fillOpacity: 0.3,
      }]);
      mapCtx.setView([coordinates.lat, coordinates.lng], 10);
      mapCtx.highlightRegion({
        north: coordinates.lat + boundarySize, south: coordinates.lat - boundarySize,
        east: coordinates.lng + boundarySize, west: coordinates.lng - boundarySize,
      });

      // Don't persist locally-simulated results into history - they're not
      // a real analysis, and every future reader of analysis_history
      // (Reports, GeoSearch grounding, etc.) would otherwise have to
      // remember to filter them back out.
      if (data?.fallbackReason !== "LOCAL_SIMULATION") {
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
              Authorization: `Bearer ${session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
            },
            body: JSON.stringify({
              eventTypes: eventTypesToAnalyze, eventType: eventTypesToAnalyze[0],
              region: targetRegionName, startDate, endDate, coordinates,
              classificationType, enableChangeDetection, numClasses,
            }),
            signal: controller.signal,
          }
        );
      } finally {
        clearTimeout(timeoutId);
      }

      const data = response.ok
        ? await response.json()
        : generateLocalSatelliteAnalysis(eventTypesToAnalyze, targetRegionName, startDate, endDate, coordinates, classificationType, enableChangeDetection, numClasses);

      applyResult(data);
      if (data?.fallbackReason === "LOCAL_SIMULATION") {
        toast.warning("Analysis service unreachable - showing a simulated preview, not real satellite data.");
      } else if (isFallbackAnalysis(data)) {
        toast.warning("AI analysis is temporarily delayed due to provider load. Showing a fallback result.");
      } else {
        toast.success("Satellite analysis complete!");
      }
    } catch (error) {
      console.warn("Analysis API unreachable, showing a local simulated preview:", error);
      const fallbackData = generateLocalSatelliteAnalysis(eventTypesToAnalyze, targetRegionName, startDate, endDate, coordinates, classificationType, enableChangeDetection, numClasses);
      applyResult(fallbackData);
      toast.warning("Analysis service unreachable - showing a simulated preview, not real satellite data.");
    } finally {
      setIsAnalyzing(false);
    }
  };

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
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-surface-2 rounded-lg">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-500 dark:text-v2-secondary" />
                <Label htmlFor="multi-event" className="text-[13px] font-medium text-gray-900 dark:text-v2-primary">Multi-Event Analysis</Label>
              </div>
              <Switch id="multi-event" checked={isMultiEventMode} onCheckedChange={setIsMultiEventMode} />
            </div>

            {isMultiEventMode ? (
              <MultiEventSelector selectedEvents={selectedEventTypes} onSelectionChange={setSelectedEventTypes} maxSelection={5} />
            ) : (
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
            )}

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

            <ClassificationControls
              classificationType={classificationType}
              onClassificationTypeChange={setClassificationType}
              enableChangeDetection={enableChangeDetection}
              onChangeDetectionToggle={setEnableChangeDetection}
              numClasses={numClasses}
              onNumClassesChange={setNumClasses}
            />

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
                  {results.isMultiEvent && <Badge variant="secondary" className="text-xs"><Layers className="h-3 w-3 mr-1" />Multi-Event</Badge>}
                </div>

                {results.landsatInfo && (
                  <div className="p-3 bg-brand-dim border border-brand-border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Satellite className="h-4 w-4 text-brand" />
                      <span className="text-[13px] font-medium text-gray-900 dark:text-v2-primary">{results.landsatInfo.sensor || "Sentinel-2 MSI"}</span>
                      <Badge variant="outline" className="text-xs">{results.landsatInfo.spatial_resolution || "10m"}</Badge>
                    </div>
                  </div>
                )}

                <CloudCoverageDisplay
                  cloudCoverage={results.cloudCoverage?.percentage}
                  dataQuality={results.dataQuality?.overall_score}
                  analysisConfidence={results.analysisConfidence}
                  sensorType={results.landsatInfo?.sensor}
                  acquisitionDate={results.landsatInfo?.acquisition_dates?.[0]}
                />
                <SpectralIndicesDisplay spectralIndices={results.spectralIndices} landsatInfo={results.landsatInfo} />
                <ClassificationResults classificationResults={results.classificationResults} changeDetection={results.changeDetection} />

                <div className="p-3 rounded-lg bg-critical-dim border border-critical/20 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-critical mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-critical text-sm">
                      {results.fallback ? (results.fallbackReason === "LOCAL_SIMULATION" ? "Simulated Result - Not Real Data" : "Analysis Delayed") : results.severity === "critical" ? "Critical Impact" : results.severity === "high" ? "High Impact" : results.severity === "medium" ? "Moderate Impact" : "Low Impact"} Detected
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted">
                      {results.fallback
                        ? (results.fallbackReason === "LOCAL_SIMULATION"
                            ? "The analysis service is unreachable. These numbers are generated on your device for preview only - no satellite imagery was processed. Retry once you're back online for a real result."
                            : "The AI provider is temporarily overloaded. Retry shortly for full results.")
                        : "Attention recommended"}
                    </p>
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
                    <p className="font-bold text-xl text-critical">{Number(results.changePercent).toFixed(1)}%</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-gray-400 dark:text-v2-muted mb-1">Summary</p>
                  <p className="text-[13px] leading-relaxed text-gray-700 dark:text-v2-secondary">{results.summary}</p>
                </div>

                {results.fullAnalysis && (
                  <div>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted mb-1">Detailed Analysis</p>
                    <div className="text-[13px] leading-relaxed bg-gray-50 dark:bg-surface-2 p-3 rounded-lg text-gray-700 dark:text-v2-secondary">{results.fullAnalysis}</div>
                  </div>
                )}

                {results.recommendations?.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted mb-2 font-medium">Recommendations</p>
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
