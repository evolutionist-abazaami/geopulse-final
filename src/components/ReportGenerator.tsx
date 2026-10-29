import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText, Loader2, Image, Check, Shield, AlertTriangle, TrendingUp, MapPin, Calendar, BarChart3, Eye, Mountain, Droplets, Flame, Layers, Target, Leaf } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import maplibregl from "maplibre-gl";
import type { MapOptions, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface ReportProvenance {
  origin: string;
  source?: string;
  sensor?: string;
  method?: string;
}

interface ReportAnalysisData {
  [key: string]: unknown;
  id?: string | number;
  region?: string;
  eventType?: string;
  analysisMethod?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  changePercent?: number | string | null;
  change_percent?: number | string | null;
  area?: string | number | null;
  severity?: string | null;
  sensorInfo?: { sensor?: string };
  landsatInfo?: { sensor?: string };
  locations?: { lat?: number; lng?: number }[];
  fieldProvenance?: Record<string, ReportProvenance | undefined>;
  dataProvenance?: { analysisMethod?: string; disclaimer?: string };
  spectralIndices?: {
    ndvi?: { mean?: number };
    ndwi?: { mean?: number };
    nbr?: { mean?: number };
  };
  temporalBreakdown?: unknown;
  temporal_breakdown?: unknown;
  changeDetection?: unknown;
  classificationResults?: unknown;
}

interface ReportGeneratorProps {
  analysisData: ReportAnalysisData | null;
  eventType?: string;
  region?: string;
  lat?: number;
  lng?: number;
  /** Captures the real, currently-displayed interactive map (OSM tiles + study-area polygon) as a PNG data URL. */
  onCaptureMap?: () => Promise<string | null> | string | null;
}

/** Real per-cell NDVI from generate-visualization's risk_zones grid endpoint. */
interface RiskGridData {
  rows: number;
  cols: number;
  cells: (number | null)[];
}

interface TemporalBreakdownEntry {
  label?: string;
  period?: string;
  changePercent: number;
}

const readTemporalBreakdown = (value: unknown): TemporalBreakdownEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is TemporalBreakdownEntry => {
    if (!entry || typeof entry !== "object") return false;
    const period = entry as Record<string, unknown>;
    return typeof period.changePercent === "number" &&
      Number.isFinite(period.changePercent) &&
      (period.label === undefined || typeof period.label === "string") &&
      (period.period === undefined || typeof period.period === "string");
  });
};

/**
 * jsPDF's built-in fonts (helvetica etc.) only support WinAnsi/Latin-1 glyphs.
 * Arrows and other symbols outside that range (which show up in AI-generated
 * findings/trend data, e.g. "↑↑", "→") render as garbled characters instead of
 * throwing, so they must be swapped for ASCII-safe equivalents before any
 * pdf.text()/splitTextToSize() call.
 */
const sanitizeForPdf = (text: unknown): string => {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/↑↑/g, "STRONG UP")
    .replace(/↑/g, "UP")
    .replace(/↓/g, "DOWN")
    .replace(/↔/g, "<->")
    .replace(/→/g, "FLAT")
    .replace(/[^ -ÿ\n\r\t]/g, "?"); // replace anything else outside Latin-1 (unsupported by jsPDF standard fonts)
};

/**
 * Draws the trend chart on a real <canvas> from the report's own numbers,
 * instead of asking an AI model to illustrate one. Deterministic, free,
 * and always available - no network call, no quota, no hallucinated values.
 */
const renderTrendChartPng = (periods: { label: string; value: number }[]): string => {
  const width = 900;
  const height = 300;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padding = { top: 20, right: 24, bottom: 50, left: 70 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = periods.map((p) => p.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values, 1);
  const range = maxVal - minVal || 1;
  const yForValue = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH;
  const zeroY = yForValue(0);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#6b7280";
  ctx.font = "20px Arial";
  ctx.textAlign = "right";
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const v = minVal + (range * i) / gridSteps;
    const y = yForValue(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartW, y);
    ctx.stroke();
    ctx.fillText(`${v.toFixed(0)}%`, padding.left - 10, y + 7);
  }

  const barGap = 24;
  const barWidth = Math.min(120, (chartW - barGap * (periods.length - 1)) / periods.length);
  const rowWidth = barWidth + barGap;
  const startX = padding.left + (chartW - (rowWidth * periods.length - barGap)) / 2;

  periods.forEach((p, i) => {
    const x = startX + i * rowWidth;
    const barTop = Math.min(yForValue(p.value), zeroY);
    const barHeight = Math.max(1, Math.abs(yForValue(p.value) - zeroY));
    ctx.fillStyle = p.value >= 0 ? "#0891b2" : "#ef4444";
    ctx.fillRect(x, barTop, barWidth, barHeight);

    ctx.fillStyle = "#374151";
    ctx.textAlign = "center";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`${p.value.toFixed(1)}%`, x + barWidth / 2, barTop - 8);

    ctx.fillStyle = "#6b7280";
    ctx.font = "16px Arial";
    const label = p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label;
    ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 26);
  });

  ctx.strokeStyle = "#9ca3af";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + chartW, zeroY);
  ctx.stroke();

  return canvas.toDataURL("image/png");
};

/**
 * Spectral index dashboard drawn from this report's measured satellite
 * spectral index measurements, instead of asking an AI model to illustrate
 * a dashboard. Deterministic, free, always available.
 */
const renderEcosystemHealthPng = (
  indices: { ndvi?: { mean?: number }; ndwi?: { mean?: number }; nbr?: { mean?: number } } | undefined,
  sensorName: string
): string => {
  const width = 900;
  const height = 420;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const gauges: { label: string; value: number | undefined; min: number; max: number; format: (v: number) => string; color: string }[] = [
    { label: "NDVI (Vegetation)", value: indices?.ndvi?.mean, min: -1, max: 1, format: (v) => v.toFixed(3), color: "#16a34a" },
    { label: "NDWI (Water)", value: indices?.ndwi?.mean, min: -1, max: 1, format: (v) => v.toFixed(3), color: "#0891b2" },
    { label: "NBR (Burn / Vegetation)", value: indices?.nbr?.mean, min: -1, max: 1, format: (v) => v.toFixed(3), color: "#ea580c" },
  ];

  const padding = 40;
  const gaugeGap = 30;
  let y = padding + 20;

  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Spectral Index Measurements", padding, y);
  y += 26;
  ctx.font = "14px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`Satellite-derived indices; sensor: ${sensorName}`, padding, y);
  y += 34;

  gauges.forEach((g) => {
    const hasValue = typeof g.value === "number" && !isNaN(g.value);
    ctx.fillStyle = "#374151";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(g.label, padding, y);
    ctx.textAlign = "right";
    ctx.fillText(hasValue ? g.format(g.value as number) : "No data", width - padding, y);
    y += 12;

    const barWidth = width - padding * 2;
    const barHeight = 18;
    ctx.fillStyle = "#e5e7eb";
    ctx.fillRect(padding, y, barWidth, barHeight);

    if (hasValue) {
      const frac = Math.max(0, Math.min(1, ((g.value as number) - g.min) / (g.max - g.min)));
      ctx.fillStyle = g.color;
      ctx.fillRect(padding, y, barWidth * frac, barHeight);
    }
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, y, barWidth, barHeight);

    y += barHeight + gaugeGap;
  });

  return canvas.toDataURL("image/png");
};

/**
 * Relative NDVI grid drawn from per-cell NDVI values returned by
 * generate-visualization's risk_zones grid endpoint. Color shading is relative
 * to the min/max within the displayed grid and is not a risk classification.
 */
const renderRiskZonesHeatmapPng = (grid: RiskGridData): string => {
  const width = 900;
  const height = 580;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Relative NDVI Grid", 40, 40);
  ctx.font = "14px Arial";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`${grid.rows}x${grid.cols} NDVI values; colors show this grid's relative range, not risk`, 40, 62);

  const gridTop = 90;
  const gridSize = 420;
  const gridLeft = (width - gridSize) / 2;
  const cellW = gridSize / grid.cols;
  const cellH = gridSize / grid.rows;

  const validValues = grid.cells.filter((v): v is number => v !== null);
  const minV = validValues.length ? Math.min(...validValues) : 0;
  const maxV = validValues.length ? Math.max(...validValues) : 1;
  const range = maxV - minV || 1;

  const colorFor = (v: number) => {
    const frac = Math.max(0, Math.min(1, (v - minV) / range));
    const r = Math.round(220 - frac * 180);
    const g = Math.round(60 + frac * 140);
    return `rgb(${r},${g},60)`;
  };

  grid.cells.forEach((value, i) => {
    const row = Math.floor(i / grid.cols);
    const col = i % grid.cols;
    const x = gridLeft + col * cellW;
    const y = gridTop + row * cellH;

    ctx.fillStyle = value === null ? "#e5e7eb" : colorFor(value);
    ctx.fillRect(x, y, cellW - 2, cellH - 2);

    ctx.fillStyle = value === null ? "#9ca3af" : "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(value === null ? "N/A" : value.toFixed(2), x + cellW / 2, y + cellH / 2 + 5);
  });

  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 2;
  ctx.strokeRect(gridLeft, gridTop, gridSize, gridSize);

  const legendY = gridTop + gridSize + 40;
  const legendWidth = 300;
  const legendLeft = (width - legendWidth) / 2;
  const legendGradient = ctx.createLinearGradient(legendLeft, 0, legendLeft + legendWidth, 0);
  legendGradient.addColorStop(0, colorFor(minV));
  legendGradient.addColorStop(1, colorFor(maxV));
  ctx.fillStyle = legendGradient;
  ctx.fillRect(legendLeft, legendY, legendWidth, 16);
  ctx.strokeStyle = "#9ca3af";
  ctx.strokeRect(legendLeft, legendY, legendWidth, 16);

  ctx.fillStyle = "#374151";
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Grid minimum (${minV.toFixed(2)})`, legendLeft, legendY + 32);
  ctx.textAlign = "right";
  ctx.fillText(`Grid maximum (${maxV.toFixed(2)})`, legendLeft + legendWidth, legendY + 32);

  return canvas.toDataURL("image/png");
};

/**
 * Contextual 3D terrain snapshot centered on the selected coordinates. It
 * does not display the selected AOI boundary. Returns null on failure so a
 * slow tile load or WebGL issue never breaks report generation.
 */
const capture3DTerrainSnapshot = async (
  lat: number | undefined,
  lng: number | undefined,
  sentinelTrueColorImage: string | null
): Promise<string | null> => {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-10000px";
  container.style.left = "-10000px";
  container.style.width = "800px";
  container.style.height = "450px";
  document.body.appendChild(container);

  let map: maplibregl.Map | null = null;

  try {
    // This is a fixed-size point context view, not a rendering of the AOI geometry.
    const half = 0.05;
    const sources: StyleSpecification["sources"] = {
      dem: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
      },
    };
    const layers: StyleSpecification["layers"] = [];

    if (sentinelTrueColorImage) {
      sources["sentinel-drape"] = {
        type: "image",
        url: sentinelTrueColorImage,
        coordinates: [
          [lng - half, lat + half],
          [lng + half, lat + half],
          [lng + half, lat - half],
          [lng - half, lat - half],
        ],
      };
      layers.push({ id: "sentinel-drape-layer", type: "raster", source: "sentinel-drape" });
    } else {
      sources["osm"] = {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      };
      layers.push({ id: "osm-layer", type: "raster", source: "osm" });
    }

    const options: MapOptions = {
      container,
      style: { version: 8, sources, layers },
      center: [lng, lat],
      zoom: 12.5,
      pitch: 65,
      bearing: -20,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    };
    map = new maplibregl.Map(options);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("3D terrain load timed out")), 12000);
      map!.on("load", () => {
        try {
          map!.setTerrain({ source: "dem", exaggeration: 1.6 });
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
          return;
        }
        map!.once("idle", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      map!.on("error", (e) => {
        clearTimeout(timeout);
        reject(e.error || new Error("MapLibre error during 3D terrain render"));
      });
    });

    return map.getCanvas().toDataURL("image/png");
  } catch (e) {
    console.warn("3D terrain capture failed, omitting from report:", e);
    return null;
  } finally {
    try {
      map?.remove();
    } catch {
      // ignore cleanup errors
    }
    container.remove();
  }
};

// Advanced visualization types available
const ADVANCED_VIZ_TYPES = [
  { id: 'terrain_3d', label: '3D Terrain Context', icon: Mountain, description: 'Point-centered terrain context; does not show the AOI boundary' },
  { id: 'ndwi_water', label: 'NDWI Index', icon: Droplets, description: 'Normalized Difference Water Index visualization' },
  { id: 'nbr_fire', label: 'NBR Index', icon: Flame, description: 'Normalized Burn Ratio index visualization' },
  { id: 'temporal_animation', label: 'Measured Time Series', icon: Layers, description: 'Per-period NDVI values when available' },
  { id: 'risk_zones', label: 'Relative NDVI Grid', icon: Target, description: 'Per-cell NDVI values with local min-max shading' },
  { id: 'ecosystem_health', label: 'Spectral Index Measurements', icon: Leaf, description: 'NDVI, NDWI, and NBR measurements when available' },
];

const ReportGenerator = ({ analysisData, eventType, region, lat, lng, onCaptureMap }: ReportGeneratorProps) => {
  const [reportType, setReportType] = useState<"professional" | "simple">("professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [includeImages, setIncludeImages] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedAdvancedViz, setSelectedAdvancedViz] = useState<string[]>(['terrain_3d', 'risk_zones']);
  const [previewImages, setPreviewImages] = useState<Record<string, string | null>>({});
  // Side-channel for the Quality Assurance / References sections: which
  // panels in the most recent generation actually came from real Sentinel
  // Hub imagery vs. an AI illustration, keyed by visualization type.
  const lastDataSourcesRef = useRef<Record<string, string>>({});

  const generateVisualization = async (type: string): Promise<{ imageUrl: string | null; gridData?: RiskGridData; dataSource?: string } | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      console.log(`Starting visualization generation for: ${type}`);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-visualization`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
          },
          body: JSON.stringify({
            visualizationType: type,
            region: region || analysisData?.region,
            eventType: eventType || analysisData?.eventType,
            lat: lat ?? analysisData?.locations?.[0]?.lat,
            lng: lng ?? analysisData?.locations?.[0]?.lng,
            endDate: analysisData?.endDate || analysisData?.end_date,
            data: analysisData,
          }),
        }
      );

      if (!response.ok) {
        console.warn(`Visualization generation failed for ${type}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      console.log(`Visualization response for ${type}:`, data.imageUrl ? 'Image received' : data.gridData ? 'Grid data received' : 'No image', data.description?.substring(0, 100));

      if (data.imageUrl || data.gridData) {
        lastDataSourcesRef.current[type] = data.dataSource || "Source not supplied by visualization service";
        return { imageUrl: data.imageUrl ?? null, gridData: data.gridData, dataSource: data.dataSource };
      }

      console.warn(`No image or grid data returned for ${type}`);
      return null;
    } catch (error) {
      console.error(`Error generating ${type} visualization:`, error);
      return null;
    }
  };

  // Generate preview thumbnails for selected visualization types
  const generatePreviewThumbnails = async () => {
    if (!analysisData) {
      toast.error("No analysis data available for preview");
      return;
    }

    setShowPreview(true);
    const previews: Record<string, string | null> = {};
    
    // Generate one preview image as a sample
    toast.info("Generating report preview...");
    const sampleImage = await generateVisualization("landsat_truecolor");
    previews["satellite"] = sampleImage?.imageUrl ?? null;
    
    setPreviewImages(previews);
  };

  const toggleAdvancedViz = (vizId: string) => {
    setSelectedAdvancedViz(prev => 
      prev.includes(vizId) 
        ? prev.filter(id => id !== vizId)
        : [...prev, vizId]
    );
  };

  const loadImageAsBase64 = async (dataUrl: string): Promise<{ data: string; width: number; height: number } | null> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        resolve({
          data: dataUrl,
          width: img.width,
          height: img.height
        });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  };

  const generatePDFReport = async () => {
    if (!analysisData) {
      toast.error("No analysis data available");
      return;
    }

    setIsGenerating(true);
    const isSimple = reportType === "simple";
    lastDataSourcesRef.current = {};

    try {
      // Generate optional satellite visualizations if enabled.
      let trueColorImage: string | null = null;
      let falseColorImage: string | null = null;
      let ndviImage: string | null = null;
      let classificationImage: string | null = null;
      let changeDetectionImage: string | null = null;
      let mapSnapshot: string | null = null;
      const advancedImages: Record<string, string | null> = {};
      const sensorName = analysisData?.sensorInfo?.sensor ||
        analysisData?.landsatInfo?.sensor ||
        analysisData?.fieldProvenance?.changePercent?.sensor ||
        "Unavailable";

      if (includeImages) {
        // Independent image requests and the map snapshot are captured concurrently
        // rather than awaited one-by-one - report generation time is then
        // bounded by the slowest single call instead of their sum.
        type VizTask = { key: string; type: string };
        const vizTasks: VizTask[] = [{ key: "trueColor", type: "landsat_truecolor" }];

        const NETWORK_ADVANCED_TYPES = new Set(["ndwi_water", "nbr_fire", "risk_zones"]);

        if (!isSimple) {
          vizTasks.push({ key: "falseColor", type: "landsat_falsecolor" });
          vizTasks.push({ key: "ndvi", type: "ndvi_map" });
          for (const vizId of selectedAdvancedViz) {
            if (NETWORK_ADVANCED_TYPES.has(vizId)) {
              vizTasks.push({ key: `advanced:${vizId}`, type: vizId });
            }
          }
        }
        if (analysisData?.classificationResults) {
          vizTasks.push({ key: "classification", type: "classification_map" });
        }
        if (analysisData?.changeDetection) {
          vizTasks.push({ key: "changeDetection", type: "change_detection_map" });
        }

        setGenerationStep(`Generating ${vizTasks.length} satellite imagery panel${vizTasks.length === 1 ? "" : "s"} and capturing study area map...`);

        const [mapResult, ...vizResults] = await Promise.all([
          Promise.resolve(onCaptureMap?.() ?? null),
          ...vizTasks.map((t) => generateVisualization(t.type)),
        ]);

        mapSnapshot = mapResult ?? null;
        let riskGridData: RiskGridData | null = null;
        vizTasks.forEach((t, i) => {
          const result = vizResults[i];
          if (t.key === "trueColor") trueColorImage = result?.imageUrl ?? null;
          else if (t.key === "falseColor") falseColorImage = result?.imageUrl ?? null;
          else if (t.key === "ndvi") ndviImage = result?.imageUrl ?? null;
          else if (t.key === "classification") classificationImage = result?.imageUrl ?? null;
          else if (t.key === "changeDetection") changeDetectionImage = result?.imageUrl ?? null;
          else if (t.key === "advanced:risk_zones") {
            if (result?.gridData) riskGridData = result.gridData;
          } else if (t.key.startsWith("advanced:")) {
            advancedImages[t.key.slice("advanced:".length)] = result?.imageUrl ?? null;
          }
        });

        // Locally-rendered advanced visualizations: real data this report
        // already has, drawn on-device (deterministic, free, no quota,
        // always available) instead of asking an AI model to illustrate one.
        if (!isSimple) {
          const rdSpectralIndices = analysisData?.spectralIndices;
          const rdTemporalBreakdown = analysisData?.fieldProvenance?.temporalBreakdown?.origin === "measured"
            ? readTemporalBreakdown(analysisData?.temporalBreakdown || analysisData?.temporal_breakdown)
            : [];

          if (selectedAdvancedViz.includes("temporal_animation") && Array.isArray(rdTemporalBreakdown) && rdTemporalBreakdown.length > 0) {
            const periods = rdTemporalBreakdown.map((p) => ({
              label: String(p.label || p.period || "Period"),
              value: p.changePercent,
            }));
            advancedImages.temporal_animation = renderTrendChartPng(periods);
            lastDataSourcesRef.current.temporal_animation = "Measured temporal NDVI change (rendered on-device)";
          }

          if (selectedAdvancedViz.includes("ecosystem_health") &&
            analysisData?.fieldProvenance?.spectralIndices?.origin === "measured" &&
            rdSpectralIndices) {
            advancedImages.ecosystem_health = renderEcosystemHealthPng(rdSpectralIndices, sensorName);
            lastDataSourcesRef.current.ecosystem_health = `Measured spectral indices from ${sensorName} (rendered on-device)`;
          }

          if (selectedAdvancedViz.includes("risk_zones") && riskGridData) {
            advancedImages.risk_zones = renderRiskZonesHeatmapPng(riskGridData);
            lastDataSourcesRef.current.risk_zones = `${lastDataSourcesRef.current.risk_zones || "Source unavailable"} (rendered locally)`;
          }



          if (selectedAdvancedViz.includes("terrain_3d")) {
            setGenerationStep("Rendering real 3D terrain from elevation data...");
            const terrainImg = await capture3DTerrainSnapshot(lat, lng, trueColorImage);
            if (terrainImg) {
              advancedImages.terrain_3d = terrainImg;
              lastDataSourcesRef.current.terrain_3d =
                `Terrarium DEM tiles (elevation-tiles-prod); center-point context, not AOI boundary` +
                (trueColorImage ? `; draped image source: ${lastDataSourcesRef.current.landsat_truecolor || "source unavailable"}` : "");
            }
          }
        }
      }

      setGenerationStep("Compiling professional report document...");

      // Create PDF with high quality settings
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;
      const contentWidth = pageWidth - margin * 2;

      // Extract data — use ONLY real values from the analysis. No synthetic fallbacks.
      const rawChange = analysisData?.changePercent ?? analysisData?.change_percent;
      const parsedChange = typeof rawChange === "number" ? rawChange : Number(rawChange);
      const hasChange = rawChange !== undefined && rawChange !== null && Number.isFinite(parsedChange);
      const analysisMethod = analysisData?.analysisMethod ??
        analysisData?.fieldProvenance?.changePercent?.method ??
        analysisData?.dataProvenance?.analysisMethod;
      const hasMeasuredBasis =
        analysisData?.fieldProvenance?.changePercent?.origin === "measured" &&
        (analysisMethod === "measured" || analysisMethod === "real_sentinel_statistics");
      if (!hasMeasuredBasis || !hasChange) {
        toast.error("A report requires measured satellite values. Model-only narratives cannot be used as measurements.");
        return;
      }
      const changePercent = parsedChange;
      const severity = analysisData?.fieldProvenance?.severity?.origin === "measured"
        ? String(analysisData.severity ?? "Unavailable")
        : "Unavailable";
      const eventValue = eventType || analysisData?.eventType;
      const requestedCategory = typeof eventValue === "string" && eventValue.trim()
        ? eventValue.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
        : "Unavailable";
      const reportDate = new Date();
      // Deterministic report ID derived from analysis content so identical inputs → identical IDs
      const idSeed = `${analysisData?.id || ''}|${analysisData?.region || region || ''}|${analysisData?.eventType || eventType || ''}|${analysisData?.startDate || analysisData?.start_date || ''}|${analysisData?.endDate || analysisData?.end_date || ''}|${rawChange ?? ''}`;
      let hash = 0;
      for (let i = 0; i < idSeed.length; i++) hash = ((hash << 5) - hash + idSeed.charCodeAt(i)) | 0;
      const reportId = `GP-${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}-${Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 8)}`;
      const startDate = analysisData?.startDate || analysisData?.start_date || "Unavailable";
      const endDate = analysisData?.endDate || analysisData?.end_date || "Unavailable";
      const regionName = region || analysisData?.region || "Unavailable";
      const area = analysisData?.fieldProvenance?.area?.origin === "measured" && analysisData?.area != null
        ? String(analysisData.area)
        : "Unavailable";
      const formatReportDate = (value: string) => {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
          ? "Unavailable"
          : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      };

      // Single source of truth for section numbering, used to render BOTH the
      // table of contents AND each section header - guarantees they can never
      // drift out of sync the way the old hardcoded TOC vs. body numbers did.
      const sectionPlan: { key: string; title: string }[] = isSimple
        ? [
            { key: "executive_summary", title: "Executive Summary" },
            { key: "key_findings", title: "Measured NDVI Values" },
          ]
        : [
            { key: "executive_summary", title: "Executive Summary" },
            { key: "project_overview", title: "Request Parameters" },
            { key: "satellite_imagery", title: "Satellite Imagery Analysis" },
            { key: "key_findings", title: "Measured NDVI Values" },
            { key: "risk_assessment", title: "Interpretation & Limitations" },
            { key: "quality_assurance", title: "Quality Assurance & Limitations" },
            { key: "methodology", title: "Analysis Method & Limitations" },
            { key: "references", title: "References & Data Sources" },
          ];
      const sectionNum = (key: string): string => String(sectionPlan.findIndex((s) => s.key === key) + 1);

      // Helper functions
      const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5): number => {
        const lines = pdf.splitTextToSize(sanitizeForPdf(text), maxWidth);
        const maxLines = Math.floor((pageHeight - y - 25) / lineHeight);
        const displayLines = lines.slice(0, Math.min(lines.length, maxLines));
        pdf.text(displayLines, x, y);
        return y + (displayLines.length * lineHeight);
      };

      const addSectionTitle = (title: string, y: number, sectionNumber?: string): number => {
        pdf.setFillColor(8, 145, 178);
        pdf.rect(margin, y, 3, 8, "F");
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        const displayTitle = sectionNumber ? `${sectionNumber}. ${title}` : title;
        pdf.text(displayTitle, margin + 6, y + 6);
        return y + 14;
      };

      const addSubsectionTitle = (title: string, y: number): number => {
        pdf.setTextColor(55, 65, 81);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text(title, margin, y);
        return y + 8;
      };

      const addTableWithBorders = (headers: string[], rows: string[][], y: number, colWidths: number[]): number => {
        const rowHeight = 8;
        const cellPadding = 2;
        let currentY = y;
        
        // Header row
        pdf.setFillColor(243, 244, 246);
        pdf.rect(margin, currentY, contentWidth, rowHeight, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8);
        pdf.setTextColor(55, 65, 81);
        
        let xPos = margin;
        headers.forEach((header, i) => {
          pdf.text(sanitizeForPdf(header), xPos + cellPadding, currentY + 5.5);
          xPos += colWidths[i];
        });
        
        // Draw header bottom border
        pdf.setDrawColor(209, 213, 219);
        pdf.setLineWidth(0.3);
        pdf.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);
        currentY += rowHeight;
        
        // Data rows
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        
        rows.forEach((row, rowIndex) => {
          // Alternate row background
          if (rowIndex % 2 === 1) {
            pdf.setFillColor(249, 250, 251);
            pdf.rect(margin, currentY, contentWidth, rowHeight, "F");
          }
          
          xPos = margin;
          row.forEach((cell, i) => {
            // Check if this is a status column (last column typically)
            const displayCell = sanitizeForPdf(cell);
            if (i === row.length - 1 && (displayCell.includes('UP') || displayCell.includes('DOWN') || displayCell === 'FLAT' || displayCell === 'MODERATE' || displayCell === 'HIGH' || displayCell === 'LOW' || displayCell === 'CRITICAL')) {
              if (displayCell.includes('STRONG UP') || displayCell === 'HIGH' || displayCell === 'CRITICAL') {
                pdf.setTextColor(220, 38, 38);
              } else if (displayCell.includes('UP') || displayCell === 'MODERATE') {
                pdf.setTextColor(234, 179, 8);
              } else if (displayCell.includes('DOWN') || displayCell === 'LOW') {
                pdf.setTextColor(34, 197, 94);
              } else {
                pdf.setTextColor(75, 85, 99);
              }
            } else {
              pdf.setTextColor(75, 85, 99);
            }
            
            const truncatedText = pdf.splitTextToSize(displayCell, colWidths[i] - cellPadding * 2)[0] || displayCell;
            pdf.text(truncatedText, xPos + cellPadding, currentY + 5.5);
            xPos += colWidths[i];
          });
          
          // Row border
          pdf.setDrawColor(229, 231, 235);
          pdf.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);
          currentY += rowHeight;
        });
        
        // Table outer border
        pdf.setDrawColor(209, 213, 219);
        pdf.rect(margin, y, contentWidth, currentY - y);
        
        return currentY + 5;
      };

      const checkPageBreak = (requiredSpace: number): void => {
        if (yPos > pageHeight - requiredSpace) {
          pdf.addPage();
          yPos = margin;
          addPageHeader();
          yPos = 22;
        }
      };

      const addPageHeader = (): void => {
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont("helvetica", "normal");
        pdf.text("GeoPulse Environmental Intelligence Platform", margin, 12);
        pdf.text(`Report ${reportId}`, pageWidth - margin - 40, 12);
      };

      const addPageFooter = (pageNum: number, totalPages: number): void => {
        pdf.setFontSize(8);
        pdf.setTextColor(107, 114, 128);
        pdf.text(`Page ${pageNum} of ${totalPages}`, margin, pageHeight - 8);
        pdf.text("GeoPulse — measured satellite analysis", pageWidth / 2, pageHeight - 8, { align: "center" });
      };

      // ============= PAGE 1: COVER PAGE =============
      // Full gradient header
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, 0, pageWidth, 100, "F");
      
      // Accent stripe
      pdf.setFillColor(6, 182, 212);
      pdf.rect(0, 95, pageWidth, 5, "F");

      // Main branding
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(36);
      pdf.setFont("helvetica", "bold");
      pdf.text("GEOPULSE", margin, 40);
      
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "normal");
      pdf.text("Environmental Intelligence Platform", margin, 52);
      
      yPos = 120;

      // Report Title
      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      const titleLines = pdf.splitTextToSize("MEASURED SATELLITE ANALYSIS REPORT", contentWidth);
      pdf.text(titleLines, margin, yPos);
      yPos += titleLines.length * 10 + 8;

      // Region subtitle
      pdf.setFontSize(16);
      pdf.setTextColor(55, 65, 81);
      pdf.text(regionName, margin, yPos);
      yPos += 20;

      // Metadata box
      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos, contentWidth, 50, 3, 3, "F");
      
      const metaStartY = yPos + 10;
      pdf.setFontSize(9);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "normal");
      
      pdf.text("Report ID:", margin + 5, metaStartY);
      pdf.text("Requested Category:", margin + 5, metaStartY + 10);
      pdf.text("Study Period:", margin + 5, metaStartY + 20);
      pdf.text("Report Date:", margin + 5, metaStartY + 30);
      
      pdf.setTextColor(17, 24, 39);
      pdf.setFont("helvetica", "bold");
      pdf.text(reportId, margin + 40, metaStartY);
      pdf.text(requestedCategory, margin + 40, metaStartY + 10);
      pdf.text(`${formatReportDate(startDate)} - ${formatReportDate(endDate)}`, margin + 40, metaStartY + 20);
      pdf.text(reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), margin + 40, metaStartY + 30);
      
      // Classification badges
      pdf.setFillColor(8, 145, 178);
      pdf.roundedRect(pageWidth - margin - 50, metaStartY - 5, 45, 8, 2, 2, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.text("MEASURED INPUTS", pageWidth - margin - 48, metaStartY);
      
      pdf.setFillColor(34, 197, 94);
      pdf.roundedRect(pageWidth - margin - 50, metaStartY + 8, 45, 8, 2, 2, "F");
      pdf.text("NDVI change percentage", pageWidth - margin - 48, metaStartY + 13);

      yPos += 65;

      // Prepared for section
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("Report basis:", margin, yPos);
      yPos += 8;
      
      pdf.setTextColor(55, 65, 81);
      pdf.setFont("helvetica", "normal");
      pdf.text("Values and provenance returned by the satellite analysis service", margin, yPos);
      yPos += 20;

      // Footer section on cover
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, pageHeight - 25, pageWidth, 25, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.text("GeoPulse Environmental Intelligence Platform", margin, pageHeight - 15);
      pdf.text("Requested category is not event attribution.", margin, pageHeight - 8);
      
      pdf.setFontSize(8);
      pdf.text("Page 1", pageWidth - margin - 12, pageHeight - 8);

      // ============= PAGE 2: TABLE OF CONTENTS =============
      if (!isSimple) {
        pdf.addPage();
        addPageHeader();
        yPos = 30;

        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(18);
        pdf.setFont("helvetica", "bold");
        pdf.text("TABLE OF CONTENTS", margin, yPos);
        yPos += 15;

        // Generated from sectionPlan (not a separate hardcoded list) so the
        // TOC's numbers/titles can never drift out of sync with the actual
        // section headers rendered below, page numbers are estimates.
        let tocPageEstimate = 3;
        const tocItems = sectionPlan.map((section) => {
          const item = { num: sectionNum(section.key), title: section.title, page: String(tocPageEstimate) };
          tocPageEstimate += section.key === "methodology" || section.key === "references" ? 2 : 1;
          return item;
        });

        pdf.setFontSize(11);
        tocItems.forEach((item) => {
          pdf.setTextColor(17, 24, 39);
          pdf.setFont("helvetica", "normal");
          pdf.text(`${item.num}.`, margin, yPos);
          pdf.text(item.title, margin + 10, yPos);
          
          // Dotted line
          const titleWidth = pdf.getTextWidth(item.title);
          const startX = margin + 10 + titleWidth + 3;
          const endX = pageWidth - margin - 15;
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineDashPattern([1, 2], 0);
          pdf.line(startX, yPos, endX, yPos);
          pdf.setLineDashPattern([], 0);
          
          pdf.text(item.page, pageWidth - margin - 5, yPos);
          yPos += 10;
        });

        yPos += 10;
        pdf.setFontSize(14);
        pdf.setFont("helvetica", "bold");
        pdf.text("Appendices", margin, yPos);
        yPos += 10;
        
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
        pdf.text("A. Satellite Imagery Panels", margin + 10, yPos);
        yPos += 8;
        pdf.text("B. Advanced Visualizations (if selected)", margin + 10, yPos);
      }

      // ============= PAGE 3: EXECUTIVE SUMMARY =============
      pdf.addPage();
      addPageHeader();
      yPos = 28;

      yPos = addSectionTitle("EXECUTIVE SUMMARY", yPos, sectionNum("executive_summary"));

      // Summary of measured values and requested-category metadata
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      const purposeText = `This report presents the measured NDVI change value returned for ${regionName} over ${formatReportDate(startDate)} to ${formatReportDate(endDate)}. The requested category (${requestedCategory}) is request metadata; the measurement alone does not establish that event or its cause.${!isSimple ? ` See Section ${sectionNum("references")} for the data source recorded for this result.` : ""}`;
      yPos = addWrappedText(purposeText, margin, yPos, contentWidth, 5);
      yPos += 8;

      // Assessment Overview Title
      yPos = addSubsectionTitle("Assessment Overview", yPos);

      // Assessment metrics table
      const assessmentHeaders = ["MEASUREMENT", "VALUE", "PROVENANCE"];
      const assessmentRows = [
        ["Area analyzed", area, "Satellite measurement"],
        ["NDVI change", `${changePercent.toFixed(1)}%`, "Measured"],
        ["Sensor", sensorName, "Analysis metadata"],
        ["Severity", severity, severity === "Unavailable" ? "Unavailable" : "Measured"],
      ];
      yPos = addTableWithBorders(assessmentHeaders, assessmentRows, yPos, [70, 50, 50]);
      yPos += 8;

      yPos = addSubsectionTitle("Measurement notes", yPos);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(75, 85, 99);
      yPos = addWrappedText(
        "NDVI change is a vegetation-index measurement. It does not by itself identify deforestation, severity, environmental impact, or cause. No annualized rate or forecast is inferred in this report.",
        margin,
        yPos,
        contentWidth,
        4.5
      );

      // ============= PROJECT OVERVIEW & OBJECTIVES =============
      if (!isSimple) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("REQUEST PARAMETERS", yPos, sectionNum("project_overview"));

        yPos = addSubsectionTitle("Study Parameters", yPos);
        const overviewHeaders = ["PARAMETER", "VALUE"];
        const overviewRows: string[][] = [
          ["Region", regionName],
          ["Requested category", requestedCategory],
          ["Study Period", `${formatReportDate(startDate)} - ${formatReportDate(endDate)}`],
          ["Area Analyzed", area],
        ];
        if (typeof lat === "number" && typeof lng === "number") {
          overviewRows.push(["Coordinates", `${lat.toFixed(4)}, ${lng.toFixed(4)}`]);
        }
        yPos = addTableWithBorders(overviewHeaders, overviewRows, yPos, [70, 100]);
        yPos += 8;

        yPos = addSubsectionTitle("Measurement and interpretation", yPos);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(55, 65, 81);
        yPos = addWrappedText(
          "The reported change value is an NDVI measurement from the selected study period. The requested category is not validated by this measurement, and this report does not infer a cause, risk level, or future trajectory.",
          margin,
          yPos,
          contentWidth,
          5
        );
        yPos += 5;

        yPos = addSubsectionTitle("Scope & Data Basis", yPos);
        const scopeText = `The measured NDVI change was returned by ${analysisData?.fieldProvenance?.changePercent?.source || "the satellite analysis service"} using ${sensorName}. Any visual panels are separately sourced and identified in this report.`;
        pdf.setFontSize(9.5);
        yPos = addWrappedText(scopeText, margin, yPos, contentWidth, 5);
        yPos += 10;
      }

      // ============= SATELLITE IMAGERY SECTION =============
      // Always show imagery section in professional reports
      if (!isSimple) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("SATELLITE IMAGERY ANALYSIS", yPos, sectionNum("satellite_imagery"));

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(55, 65, 81);
        const imageryIntro = `Images are visual context only and are not the source of the numeric NDVI measurement. The retrieval source is shown for each available panel; panels with no source are omitted or marked unavailable.`;
        yPos = addWrappedText(imageryIntro, margin, yPos, contentWidth, 5);
        yPos += 10;

        // Study area location map - a real screenshot of the interactive map
        // (actual OpenStreetMap tiles + study-area boundary), giving genuine
        // geographic context before the spectral imagery panels below.
        if (mapSnapshot) {
          const mapImgWidth = contentWidth - 10;
          const mapImgHeight = 55;
          pdf.setFillColor(243, 244, 246);
          pdf.roundedRect(margin, yPos, contentWidth, mapImgHeight + 10, 3, 3, "F");
          try {
            pdf.addImage(mapSnapshot, "PNG", margin + 5, yPos + 5, mapImgWidth, mapImgHeight);
          } catch (e) {
            console.warn("Could not add map snapshot to PDF:", e);
          }
          yPos += mapImgHeight + 15;
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          pdf.setFont("helvetica", "italic");
          pdf.text(`Map context for ${regionName}; this map is not the satellite measurement.`, margin, yPos);
          yPos += 10;
        }

        // Main satellite image
        const imgWidth = contentWidth - 10;
        const imgHeight = 65;
        
        pdf.setFillColor(243, 244, 246);
        pdf.roundedRect(margin, yPos, contentWidth, 75, 3, 3, "F");
        
        if (trueColorImage) {
          try {
            pdf.addImage(trueColorImage, "PNG", margin + 5, yPos + 5, imgWidth, imgHeight);
          } catch (e) {
            console.warn("Could not add satellite image to PDF:", e);
            // Show placeholder
            pdf.setFontSize(12);
            pdf.setTextColor(107, 114, 128);
            pdf.text("Satellite Imagery", margin + contentWidth / 2 - 25, yPos + 35);
            pdf.setFontSize(9);
            pdf.text(`Source: ${lastDataSourcesRef.current.landsat_truecolor || "Unavailable"}`, margin + 10, yPos + 45);
          }
        } else {
          // Placeholder when no image available
          pdf.setFontSize(12);
          pdf.setTextColor(107, 114, 128);
          pdf.text("No image retrieved", margin + contentWidth / 2 - 25, yPos + 30);
          pdf.setFontSize(9);
          pdf.text("This panel is unavailable.", margin + contentWidth / 2 - 25, yPos + 40);
        }
        yPos += 80;
        
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont("helvetica", "italic");
        pdf.text(`Image source: ${lastDataSourcesRef.current.landsat_truecolor || "Unavailable"}`, margin, yPos);
        yPos += 10;

        // Secondary images grid
        checkPageBreak(80);
        yPos += 5;
        
        const gridImageWidth = (contentWidth - 8) / 2;
        const gridImageHeight = 50;
        
        // False color panel
        pdf.setFillColor(243, 244, 246);
        pdf.roundedRect(margin, yPos, gridImageWidth, gridImageHeight + 10, 2, 2, "F");
        
        if (falseColorImage) {
          try {
            pdf.addImage(falseColorImage, "PNG", margin + 3, yPos + 3, gridImageWidth - 6, gridImageHeight);
          } catch (e) {
            console.warn("Could not add false color image:", e);
            pdf.setFontSize(10);
            pdf.setTextColor(107, 114, 128);
            pdf.text("False Color", margin + gridImageWidth / 2 - 15, yPos + 25);
          }
        } else {
          pdf.setFontSize(10);
          pdf.setTextColor(107, 114, 128);
          pdf.text("No image retrieved", margin + gridImageWidth / 2 - 25, yPos + 25);
        }
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.setFont("helvetica", "bold");
        pdf.text(`False-color source: ${lastDataSourcesRef.current.landsat_falsecolor || "Unavailable"}`, margin + 3, yPos + gridImageHeight + 8);
        
        // NDVI panel
        const ndviX = margin + gridImageWidth + 8;
        pdf.setFillColor(243, 244, 246);
        pdf.roundedRect(ndviX, yPos, gridImageWidth, gridImageHeight + 10, 2, 2, "F");
        
        if (ndviImage) {
          try {
            pdf.addImage(ndviImage, "PNG", ndviX + 3, yPos + 3, gridImageWidth - 6, gridImageHeight);
          } catch (e) {
            console.warn("Could not add NDVI image:", e);
            pdf.setFontSize(10);
            pdf.setTextColor(107, 114, 128);
            pdf.text("NDVI Map", ndviX + gridImageWidth / 2 - 15, yPos + 25);
          }
        } else {
          pdf.setFontSize(10);
          pdf.setTextColor(107, 114, 128);
          pdf.text("No image retrieved", ndviX + gridImageWidth / 2 - 25, yPos + 25);
        }
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.setFont("helvetica", "bold");
        pdf.text(`NDVI image source: ${lastDataSourcesRef.current.ndvi_map || "Unavailable"}`, ndviX + 3, yPos + gridImageHeight + 8);
        
        yPos += gridImageHeight + 18;
      }

      // ============= MEASURED VALUES =============
      pdf.addPage();
      addPageHeader();
      yPos = 28;

      yPos = addSectionTitle("MEASURED NDVI VALUES", yPos, sectionNum("key_findings"));

      yPos = addSubsectionTitle("Study-period result", yPos);
      const periodsFromData = analysisData?.fieldProvenance?.temporalBreakdown?.origin === "measured"
        ? readTemporalBreakdown(analysisData?.temporalBreakdown || analysisData?.temporal_breakdown)
        : [];
      const temporalRows = Array.isArray(periodsFromData) && periodsFromData.length > 0
        ? periodsFromData.map((p) => [
            String(p.label || p.period || "Period"),
            `${p.changePercent.toFixed(1)}%`,
          ])
        : [[`${formatReportDate(startDate)} - ${formatReportDate(endDate)}`, `${changePercent.toFixed(1)}%`]];
      yPos = addTableWithBorders(["PERIOD", "MEASURED NDVI CHANGE"], temporalRows, yPos, [85, 85]);
      yPos += 5;

      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "italic");
      pdf.text(Array.isArray(periodsFromData) && periodsFromData.length > 0
        ? "Measured period values returned by the analysis service."
        : "Only the measured study-period value is available; no sub-period breakdown was returned.", margin, yPos);
      yPos += 12;

      // This chart visualizes returned measurements; it is not a forecast.
      checkPageBreak(75);
      yPos = addSubsectionTitle("Measured values visualization", yPos);

      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos, contentWidth, 60, 3, 3, "F");

      const chartImgWidth = contentWidth - 10;
      const chartImgHeight = 50;

      const chartPeriods = Array.isArray(periodsFromData) && periodsFromData.length > 0
        ? periodsFromData.map((p) => ({
            label: String(p.label || p.period || "Period"),
            value: p.changePercent,
          }))
        : [{ label: "Full Study Period", value: changePercent }];
      const chartImage = renderTrendChartPng(chartPeriods);

      if (chartImage) {
        pdf.addImage(chartImage, "PNG", margin + 5, yPos + 5, chartImgWidth, chartImgHeight);
      } else {
        pdf.setFontSize(12);
        pdf.setTextColor(107, 114, 128);
        pdf.text("Trend Analysis Chart", margin + contentWidth / 2 - 30, yPos + 20);
        pdf.setFontSize(9);
        pdf.text(`${changePercent.toFixed(1)}% change detected over study period`, margin + contentWidth / 2 - 45, yPos + 32);
      }
      yPos += 65;
      
      pdf.setFontSize(9);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "italic");
      pdf.text("Reported NDVI change values; no trend or cause is inferred.", margin, yPos);
      yPos += 12;

      // ============= PROFESSIONAL REPORT EXTRAS =============
      if (!isSimple) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("INTERPRETATION & LIMITATIONS", yPos, sectionNum("risk_assessment"));
        const interpretationLimits = [
          `Requested category: ${requestedCategory}. NDVI change does not confirm this event.`,
          "NDVI change measures vegetation-index variation; it does not establish cause, risk, damage, or recovery.",
          `Sensor reported by the analysis service: ${sensorName}. Values from different sensors may not be directly comparable.`,
          "No annualized rate, forecast, attribution, or intervention priority is inferred by this report.",
        ];
        interpretationLimits.forEach((line) => {
          checkPageBreak(14);
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(75, 85, 99);
          yPos = addWrappedText(`- ${line}`, margin, yPos, contentWidth, 4.5);
          yPos += 4;
        });

        // ============= QUALITY ASSURANCE & LIMITATIONS =============
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("QUALITY ASSURANCE & LIMITATIONS", yPos, sectionNum("quality_assurance"));

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(75, 85, 99);
        yPos = addWrappedText(
          "The provenance below comes from the analysis response and visualization service. Unknown sources are reported as unavailable rather than inferred.",
          margin, yPos, contentWidth, 5
        );
        yPos += 8;

        yPos = addSubsectionTitle("Data Basis for This Report", yPos);
        const provenanceHeaders = ["REPORT ELEMENT", "BASIS"];
        const imageLabel = (key: string, label: string): string[] => {
          const source = lastDataSourcesRef.current[key];
          return [label, source || "Unavailable"];
        };
        const changeProvenance = analysisData?.fieldProvenance?.changePercent;
        const spectralProvenance = analysisData?.fieldProvenance?.spectralIndices;
        const coordinateProvenance = analysisData?.fieldProvenance?.coordinates;
        const provenanceRows: string[][] = [
          ["Study area map", mapSnapshot ? "Interactive map screenshot; visual context only" : "Not captured for this report"],
          imageLabel("landsat_truecolor", "True-color imagery panel"),
          imageLabel("landsat_falsecolor", "False-color imagery panel"),
          imageLabel("ndvi_map", "NDVI imagery panel"),
          ["NDVI change", hasMeasuredBasis ? `${changeProvenance?.source || "Measured"}; sensor: ${sensorName}` : "Unavailable"],
          ["Spectral indices", spectralProvenance?.origin === "measured" ? `${spectralProvenance.source}; sensor: ${spectralProvenance.sensor}` : "Unavailable"],
          ["Narrative and recommendations", "Not included; not measured by this report"],
          ["Location coordinates", coordinateProvenance?.source || "Unavailable"],
          ...selectedAdvancedViz
            .filter((id) => advancedImages[id])
            .map((id) => {
              const viz = ADVANCED_VIZ_TYPES.find((v) => v.id === id);
              return [viz?.label || id, lastDataSourcesRef.current[id] || "Source unavailable"];
            }),
        ];
        yPos = addTableWithBorders(provenanceHeaders, provenanceRows, yPos, [70, 100]);
        yPos += 8;

        if (analysisData?.dataProvenance?.disclaimer) {
          yPos = addSubsectionTitle("Analysis Disclaimer", yPos);
          pdf.setFontSize(9);
          yPos = addWrappedText(String(analysisData.dataProvenance.disclaimer), margin, yPos, contentWidth, 4.5);
          yPos += 8;
        }

        checkPageBreak(40);
        yPos = addSubsectionTitle("General Limitations", yPos);
        pdf.setFontSize(9);
        pdf.setTextColor(75, 85, 99);
        const limitations = [
          "The requested category is not validated by the NDVI measurement and must not be interpreted as event attribution.",
          "NDVI change does not independently establish severity, cause, damage, or future conditions.",
          "Model-generated text, where present, is interpretation and not an independent measurement.",
          "This report does not include independent ground-truth validation; verify high-impact decisions against authoritative records or field observations.",
        ];
        limitations.forEach((line) => {
          checkPageBreak(12);
          pdf.text("•", margin, yPos);
          yPos = addWrappedText(line, margin + 5, yPos, contentWidth - 5, 4.5);
          yPos += 3;
        });
        yPos += 5;

        // METHODOLOGY PAGE
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("ANALYSIS METHOD & LIMITATIONS", yPos, sectionNum("methodology"));

        const methodology = [
          {
            title: "Measured NDVI change",
            content: `The change value is marked measured by the analysis response. Recorded source: ${changeProvenance?.source || "Unavailable"}. Sensor: ${sensorName}.`,
          },
          {
            title: "Visual panels",
            content: "Optional imagery and map panels are context only. Their reported sources are listed in the provenance table; an image is not evidence that the requested event occurred.",
          },
          {
            title: "Interpretation",
            content: "NDVI change alone does not establish cause, event type, severity, or future conditions. The report does not calculate an annualized rate or forecast.",
          },
          {
            title: "Validation",
            content: "This report does not include independent ground-truth validation. Verify high-impact decisions against authoritative records or field observations.",
          }
        ];

        methodology.forEach((item) => {
          checkPageBreak(35);
          
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.setTextColor(17, 24, 39);
          pdf.text(item.title, margin, yPos);
          yPos += 6;
          
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9);
          pdf.setTextColor(75, 85, 99);
          yPos = addWrappedText(item.content, margin, yPos, contentWidth, 4.5);
          yPos += 8;
        });

        // Uncertainty Quantification table
        checkPageBreak(50);
        yPos += 5;
        yPos = addSubsectionTitle("Uncertainty Quantification", yPos);
        
        const uncertaintyHeaders = ["ASPECT", "NOTE"];
        const uncertaintyRows: string[][] = [];
        uncertaintyRows.push(["Measured NDVI change", `${changeProvenance?.source || "Analysis response"}; not independently validated by this report`]);
        uncertaintyRows.push(["Requested category", `${requestedCategory}; request metadata, not event attribution`]);
        uncertaintyRows.push(["Narrative and recommendations", "Not included; this report contains measured values and provenance only"]);
        yPos = addTableWithBorders(uncertaintyHeaders, uncertaintyRows, yPos, [75, 95]);

        // DATA SOURCES PAGE
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("REFERENCES & DATA SOURCES", yPos, sectionNum("references"));

        yPos = addSubsectionTitle("Data Sources Used In This Report", yPos);

        const dataSources = [
          `NDVI change: ${changeProvenance?.source || "Unavailable"}; sensor: ${sensorName}`,
          ...(spectralProvenance?.origin === "measured" ? [`Spectral indices: ${spectralProvenance.source}; sensor: ${spectralProvenance.sensor}`] : []),
          ...Object.entries(lastDataSourcesRef.current).map(([panel, source]) => `${panel} visual: ${source}`),
        ];

        pdf.setFontSize(9);
        pdf.setTextColor(55, 65, 81);
        pdf.setFont("helvetica", "normal");
        dataSources.forEach((source) => {
          checkPageBreak(12);
          const sourceLines = pdf.splitTextToSize(source, contentWidth);
          pdf.text(sourceLines, margin, yPos);
          yPos += sourceLines.length * 5 + 3;
        });

      }

      // ============= APPENDIX: IMAGERY PANELS =============
      if (includeImages && (classificationImage || changeDetectionImage)) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text("APPENDIX A: ADDITIONAL IMAGERY PANELS", margin, yPos);
        yPos += 15;

        if (classificationImage) {
          try {
            yPos = addSubsectionTitle("Land Cover Classification Map", yPos);
            pdf.setFillColor(243, 244, 246);
            pdf.roundedRect(margin, yPos, contentWidth, 70, 3, 3, "F");
            pdf.addImage(classificationImage, "PNG", margin + 5, yPos + 5, contentWidth - 10, 60);
            yPos += 75;
            
            pdf.setFontSize(8);
            pdf.setTextColor(107, 114, 128);
            pdf.setFont("helvetica", "italic");
            yPos = addWrappedText(
              `Visualization source: ${lastDataSourcesRef.current.classification_map || "Not supplied"}. Not independently validated.`,
              margin,
              yPos,
              contentWidth,
              4
            );
            yPos += 12;
          } catch (e) {
            console.warn("Could not add classification image");
          }
        }

        if (changeDetectionImage) {
          checkPageBreak(90);
          try {
            yPos = addSubsectionTitle("Change Detection Analysis", yPos);
            pdf.setFillColor(243, 244, 246);
            pdf.roundedRect(margin, yPos, contentWidth, 70, 3, 3, "F");
            pdf.addImage(changeDetectionImage, "PNG", margin + 5, yPos + 5, contentWidth - 10, 60);
            yPos += 75;
            
            pdf.setFontSize(8);
            pdf.setTextColor(107, 114, 128);
            pdf.setFont("helvetica", "italic");
            yPos = addWrappedText(
              `Visualization source: ${lastDataSourcesRef.current.change_detection_map || "Not supplied"}. Not independently validated.`,
              margin,
              yPos,
              contentWidth,
              4
            );
          } catch (e) {
            console.warn("Could not add change detection image");
          }
        }
      }

      // ============= APPENDIX: ADVANCED VISUALIZATIONS =============
      // Include only returned visualizations and report their supplied source.
      const selectedWithImages = selectedAdvancedViz.filter((id) => advancedImages[id]);
      if (includeImages && !isSimple && selectedWithImages.length > 0) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(16);
        pdf.setFont("helvetica", "bold");
        pdf.text("APPENDIX B: ADVANCED VISUALIZATIONS", margin, yPos);
        yPos += 15;

        selectedWithImages.forEach((vizId) => {
          const viz = ADVANCED_VIZ_TYPES.find((v) => v.id === vizId);
          const image = advancedImages[vizId];
          if (!image) return;

          checkPageBreak(95);
          try {
            yPos = addSubsectionTitle(viz?.label || vizId, yPos);
            pdf.setFillColor(243, 244, 246);
            pdf.roundedRect(margin, yPos, contentWidth, 70, 3, 3, "F");
            pdf.addImage(image, "PNG", margin + 5, yPos + 5, contentWidth - 10, 60);
            yPos += 75;

            pdf.setFontSize(8);
            pdf.setTextColor(107, 114, 128);
            pdf.setFont("helvetica", "italic");
            yPos = addWrappedText(
              `Source: ${lastDataSourcesRef.current[vizId] || "Not supplied by visualization service"}. Context only; not event attribution.`,
              margin,
              yPos,
              contentWidth,
              4
            );
            yPos += 8;
          } catch (e) {
            console.warn(`Could not add ${vizId} image:`, e);
          }
        });
      }

      // ============= FINAL PAGE - DISCLAIMER =============
      pdf.addPage();
      addPageHeader();
      yPos = pageHeight - 80;

      // Disclaimer box
      pdf.setFillColor(254, 249, 195);
      pdf.roundedRect(margin, yPos, contentWidth, 35, 3, 3, "F");
      pdf.setFillColor(234, 179, 8);
      pdf.rect(margin, yPos, 4, 35, "F");
      
      pdf.setTextColor(113, 63, 18);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text("DISCLAIMER", margin + 10, yPos + 10);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      const disclaimer = "NDVI change is a vegetation-index measurement and does not establish event occurrence, cause, severity, or future conditions. The requested category is metadata. This report does not include independent ground-truth validation.";
      const disclaimerLines = pdf.splitTextToSize(disclaimer, contentWidth - 20);
      pdf.text(disclaimerLines, margin + 10, yPos + 18);

      // Footer
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, pageHeight - 20, pageWidth, 20, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.text("GeoPulse Satellite Measurement Report", margin, pageHeight - 10);
      pdf.text("NDVI change measurement; no event attribution", pageWidth / 2 - 25, pageHeight - 10);

      // Add page numbers to all pages
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        if (i > 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(107, 114, 128);
          pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 25);
        }
      }

      // Save PDF
      const filename = `GeoPulse_${reportType === "professional" ? "Professional" : "Summary"}_Report_${reportId}.pdf`;
      pdf.save(filename);

      toast.success(`${reportType === "professional" ? "Professional" : "Summary"} report downloaded successfully!`);
    } catch (error) {
      console.error("Report generation error:", error);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
      setGenerationStep("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-2 block">Report Format</Label>
        <Select value={reportType} onValueChange={(v) => setReportType(v as "professional" | "simple")}>
          <SelectTrigger className="bg-card">
            <SelectValue>
              <span className="flex items-center gap-2">
                {reportType === "professional" ? (
                  <BarChart3 className="h-4 w-4 text-primary" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium">
                  {reportType === "professional" ? "Professional Report" : "Summary Report"}
                </span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Professional Report</div>
                  <div className="text-xs text-muted-foreground">Detailed report with measurements, provenance, and optional visuals</div>
                </div>
              </span>
            </SelectItem>
            <SelectItem value="simple">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Summary Report</div>
                  <div className="text-xs text-muted-foreground">Concise measured-values summary</div>
                </div>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-sm font-medium">Include Visual Panels</span>
              <p className="text-xs text-muted-foreground">Optional imagery, index grids, and map context</p>
          </div>
        </div>
        <Button
          variant={includeImages ? "default" : "outline"}
          size="sm"
          onClick={() => setIncludeImages(!includeImages)}
        >
          {includeImages ? <Check className="h-4 w-4" /> : "Off"}
        </Button>
      </div>

      {/* Advanced Visualization Types - Only show for Professional reports with images */}
      {reportType === "professional" && includeImages && (
        <div className="p-4 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Advanced Visualizations</Label>
            <span className="text-xs text-muted-foreground">{selectedAdvancedViz.length} selected</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ADVANCED_VIZ_TYPES.map((viz) => {
              const Icon = viz.icon;
              const isSelected = selectedAdvancedViz.includes(viz.id);
              return (
                <button
                  key={viz.id}
                  onClick={() => toggleAdvancedViz(viz.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/10 text-primary' 
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{viz.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{viz.description}</div>
                  </div>
                  {isSelected && <Check className="h-3 w-3 flex-shrink-0 ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Report Preview Info */}
      <div className="p-4 bg-gradient-to-r from-primary/5 to-cyan-500/5 border border-primary/20 rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" />
            Report Contents
          </div>
          <Dialog open={showPreview} onOpenChange={setShowPreview}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" onClick={generatePreviewThumbnails} disabled={!analysisData}>
                <Eye className="h-4 w-4 mr-1" />
                Preview
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Report Preview
                </DialogTitle>
                <DialogDescription>
                  Preview of your {reportType === "professional" ? "Professional" : "Summary"} Environmental Analysis Report
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="structure" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="structure">Structure</TabsTrigger>
                  <TabsTrigger value="visualizations">Visualizations</TabsTrigger>
                  <TabsTrigger value="sample">Sample Image</TabsTrigger>
                </TabsList>
                <TabsContent value="structure">
                  <ScrollArea className="h-[400px] rounded-md border p-4">
                    <div className="space-y-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <h4 className="font-bold text-primary">Page 1: Cover</h4>
                        <p className="text-sm text-muted-foreground">GeoPulse branding, report metadata, classification badge</p>
                      </div>
                      {reportType === "professional" && (
                        <div className="p-3 bg-muted rounded-lg">
                          <h4 className="font-bold">Page 2: Table of Contents</h4>
                          <p className="text-sm text-muted-foreground">Navigational guide with page numbers</p>
                        </div>
                      )}
                      <div className="p-3 bg-muted rounded-lg">
                        <h4 className="font-bold">Page 3: Executive Summary</h4>
                        <p className="text-sm text-muted-foreground">Measured NDVI change, sensor, area, and interpretation limits</p>
                      </div>
                      {includeImages && (
                        <div className="p-3 bg-muted rounded-lg">
                          <h4 className="font-bold">Page 4-5: Satellite Imagery</h4>
                          <p className="text-sm text-muted-foreground">True-color, false-color, NDVI panels with captions</p>
                        </div>
                      )}
                      {reportType === "professional" && (
                        <>
                          <div className="p-3 bg-muted rounded-lg">
                            <h4 className="font-bold">Interpretation & Limitations</h4>
                            <p className="text-sm text-muted-foreground">Measurement caveats and event-attribution limits</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <h4 className="font-bold">Page 7: Methodology</h4>
                            <p className="text-sm text-muted-foreground">Analysis source and measurement limitations</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <h4 className="font-bold">Page 8: References</h4>
                            <p className="text-sm text-muted-foreground">Data provenance reported by the analysis and visualization services</p>
                          </div>
                          {selectedAdvancedViz.length > 0 && (
                            <div className="p-3 bg-cyan-500/10 rounded-lg">
                              <h4 className="font-bold text-cyan-700">Appendix: Advanced Visualizations</h4>
                              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                                {selectedAdvancedViz.map(vizId => {
                                  const viz = ADVANCED_VIZ_TYPES.find(v => v.id === vizId);
                                  return viz ? <li key={vizId}>• {viz.label}: {viz.description}</li> : null;
                                })}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="visualizations">
                  <ScrollArea className="h-[400px] rounded-md border p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Standard visualizations */}
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Image className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">True-Color Composite</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Source provided with the retrieved visualization</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Layers className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-medium">False-Color Composite</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Source provided with the retrieved visualization</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Leaf className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-medium">NDVI Vegetation Map</span>
                        </div>
                        <p className="text-xs text-muted-foreground">NDVI visualization; not event attribution</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium">Trend Chart</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Temporal analysis graph</p>
                      </div>
                      {/* Selected advanced visualizations */}
                      {selectedAdvancedViz.map(vizId => {
                        const viz = ADVANCED_VIZ_TYPES.find(v => v.id === vizId);
                        if (!viz) return null;
                        const Icon = viz.icon;
                        return (
                          <div key={vizId} className="p-3 rounded-lg border border-primary/30 bg-primary/5">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">{viz.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{viz.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </TabsContent>
                <TabsContent value="sample">
                  <div className="h-[400px] rounded-md border p-4 flex items-center justify-center bg-muted/20">
                    {previewImages["satellite"] ? (
                      <img 
                        src={previewImages["satellite"]} 
                        alt="Sample satellite visualization" 
                        className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                      />
                    ) : (
                      <div className="text-center text-muted-foreground">
                        <Image className="h-16 w-16 mx-auto mb-4 opacity-30" />
                        <p className="text-sm">Click Preview to generate a sample visualization</p>
                        <p className="text-xs mt-1">A sample visualization may be available from the configured data service</p>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowPreview(false)}>
                  Close
                </Button>
                <Button onClick={() => { setShowPreview(false); generatePDFReport(); }}>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Full Report
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-6">
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-500" /> Cover page with branding & metadata
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-500" /> Measured values & interpretation limits
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-500" /> Provenance-backed metrics
          </li>
          {includeImages && (
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" /> Satellite imagery panels & NDVI maps
            </li>
          )}
          {reportType === "professional" && (
            <>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Table of contents and provenance
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Analysis limitations
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Methodology & data sources
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Appendices with additional imagery
              </li>
              {selectedAdvancedViz.length > 0 && (
                <li className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-cyan-500" /> {selectedAdvancedViz.length} advanced visualizations
                </li>
              )}
            </>
          )}
        </ul>
      </div>

      {isGenerating && generationStep && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="absolute inset-0 h-5 w-5 animate-ping opacity-20 rounded-full bg-primary" />
            </div>
            <div>
              <span className="text-sm font-medium text-primary">{generationStep}</span>
              <p className="text-xs text-muted-foreground">This may take a moment...</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={generatePreviewThumbnails}
          disabled={isGenerating || !analysisData}
        >
          <Eye className="h-4 w-4 mr-2" />
          Preview Report
        </Button>
        <Button
          className="flex-1"
          onClick={generatePDFReport}
          disabled={isGenerating || !analysisData}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download Report
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ReportGenerator;
