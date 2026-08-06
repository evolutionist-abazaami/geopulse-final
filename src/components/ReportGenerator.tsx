import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, FileText, Loader2, Image, Check, Shield, AlertTriangle, TrendingUp, MapPin, Calendar, BarChart3, Eye, Mountain, Thermometer, Droplets, Flame, Layers, Target, Leaf, PieChart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

interface ReportGeneratorProps {
  analysisData: any;
  eventType?: string;
  region?: string;
  lat?: number;
  lng?: number;
  /** Captures the real, currently-displayed interactive map (OSM tiles + study-area polygon) as a PNG data URL. */
  onCaptureMap?: () => Promise<string | null> | string | null;
}

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

// Advanced visualization types available
const ADVANCED_VIZ_TYPES = [
  { id: 'terrain_3d', label: '3D Terrain', icon: Mountain, description: 'Dramatic 3D terrain with elevation' },
  { id: 'thermal_analysis', label: 'Thermal Map', icon: Thermometer, description: 'Temperature anomaly analysis' },
  { id: 'ndwi_water', label: 'Water Index', icon: Droplets, description: 'NDWI water body detection' },
  { id: 'nbr_fire', label: 'Burn Severity', icon: Flame, description: 'NBR fire damage assessment' },
  { id: 'temporal_animation', label: 'Time Series', icon: Layers, description: 'Multi-year change animation' },
  { id: 'risk_zones', label: 'Risk Zones', icon: Target, description: 'Priority intervention areas' },
  { id: 'ecosystem_health', label: 'Ecosystem Health', icon: Leaf, description: 'Comprehensive health dashboard' },
  { id: 'driver_analysis', label: 'Driver Analysis', icon: PieChart, description: 'Causal factors breakdown' },
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

  const generateVisualization = async (type: string): Promise<string | null> => {
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
            data: analysisData,
          }),
        }
      );

      if (!response.ok) {
        console.warn(`Visualization generation failed for ${type}: ${response.status}`);
        return null;
      }

      const data = await response.json();
      console.log(`Visualization response for ${type}:`, data.imageUrl ? 'Image received' : 'No image', data.description?.substring(0, 100));

      if (data.imageUrl) {
        lastDataSourcesRef.current[type] = data.dataSource || "AI illustration (Google Gemini)";
        return data.imageUrl;
      }
      
      console.warn(`No image URL returned for ${type}`);
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
    previews["satellite"] = sampleImage;
    
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

  // Helper to determine risk level based on change percent
  const getRiskLevel = (changePercent: number): { level: string; color: [number, number, number]; bgColor: [number, number, number]; description: string } => {
    const absChange = Math.abs(changePercent);
    if (absChange >= 25) return { level: "CRITICAL", color: [220, 38, 38], bgColor: [254, 226, 226], description: "Immediate intervention required" };
    if (absChange >= 15) return { level: "HIGH", color: [234, 88, 12], bgColor: [255, 237, 213], description: "Urgent attention recommended" };
    if (absChange >= 8) return { level: "MODERATE-TO-HIGH", color: [234, 179, 8], bgColor: [254, 249, 195], description: "Monitoring and assessment needed" };
    if (absChange >= 3) return { level: "LOW", color: [34, 197, 94], bgColor: [220, 252, 231], description: "Within acceptable parameters" };
    return { level: "MINIMAL", color: [59, 130, 246], bgColor: [219, 234, 254], description: "No significant concern" };
  };

  // Get event type display info
  const getEventTypeInfo = (type: string) => {
    const types: Record<string, { label: string; category: string; fullTitle: string }> = {
      deforestation: { label: "Forest Degradation Assessment", category: "Land Cover Change", fullTitle: "FOREST DEGRADATION ASSESSMENT REPORT" },
      flood: { label: "Flood Impact Assessment", category: "Natural Disaster", fullTitle: "FLOOD IMPACT ASSESSMENT REPORT" },
      urbanization: { label: "Urban Expansion Analysis", category: "Land Use Change", fullTitle: "URBAN EXPANSION ANALYSIS REPORT" },
      drought: { label: "Drought Conditions Analysis", category: "Climate Impact", fullTitle: "DROUGHT CONDITIONS ANALYSIS REPORT" },
      fire: { label: "Wildfire Damage Assessment", category: "Natural Disaster", fullTitle: "WILDFIRE DAMAGE ASSESSMENT REPORT" },
      landslide: { label: "Landslide Risk Analysis", category: "Geological Hazard", fullTitle: "LANDSLIDE RISK ANALYSIS REPORT" },
      mining: { label: "Mining Activity Detection", category: "Resource Extraction", fullTitle: "MINING ACTIVITY DETECTION REPORT" },
      agriculture: { label: "Agricultural Land Analysis", category: "Land Use Change", fullTitle: "AGRICULTURAL LAND ANALYSIS REPORT" },
      water_quality: { label: "Water Quality Assessment", category: "Environmental Health", fullTitle: "WATER QUALITY ASSESSMENT REPORT" },
      coastal_erosion: { label: "Coastal Erosion Analysis", category: "Geological Change", fullTitle: "COASTAL EROSION ANALYSIS REPORT" },
    };
    if (types[type?.toLowerCase()]) return types[type.toLowerCase()];

    // GeoWitness offers 40+ event types (reforestation, mangrove_loss, heatwave,
    // desertification, etc.) but only the handful above have a custom label -
    // everything else previously fell through to the raw snake_case value
    // (e.g. "forest_degradation") instead of a readable title.
    const humanized = type ? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "";
    return {
      label: humanized ? `${humanized} Assessment` : "Environmental Analysis",
      category: "General Assessment",
      fullTitle: `${humanized || "Environmental Analysis"} Report`.toUpperCase(),
    };
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
      // Generate Landsat visualizations if enabled
      let trueColorImage: string | null = null;
      let falseColorImage: string | null = null;
      let ndviImage: string | null = null;
      let classificationImage: string | null = null;
      let changeDetectionImage: string | null = null;
      let mapSnapshot: string | null = null;
      const advancedImages: Record<string, string | null> = {};

      if (includeImages) {
        // Every image below is an independent network call (map snapshot,
        // Sentinel Hub/AI visualizations), so they're fired concurrently
        // rather than awaited one-by-one - report generation time is then
        // bounded by the slowest single call instead of their sum.
        type VizTask = { key: string; type: string };
        const vizTasks: VizTask[] = [{ key: "trueColor", type: "landsat_truecolor" }];

        if (!isSimple) {
          vizTasks.push({ key: "falseColor", type: "landsat_falsecolor" });
          vizTasks.push({ key: "ndvi", type: "ndvi_map" });
          for (const vizId of selectedAdvancedViz) {
            if (ADVANCED_VIZ_TYPES.some((v) => v.id === vizId)) {
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
        vizTasks.forEach((t, i) => {
          const result = vizResults[i];
          if (t.key === "trueColor") trueColorImage = result;
          else if (t.key === "falseColor") falseColorImage = result;
          else if (t.key === "ndvi") ndviImage = result;
          else if (t.key === "classification") classificationImage = result;
          else if (t.key === "changeDetection") changeDetectionImage = result;
          else if (t.key.startsWith("advanced:")) advancedImages[t.key.slice("advanced:".length)] = result;
        });
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
      const hasChange = rawChange !== undefined && rawChange !== null && !isNaN(parseFloat(rawChange));
      const changePercent = hasChange ? parseFloat(rawChange) : 0;
      const risk = getRiskLevel(changePercent);
      const eventInfo = getEventTypeInfo(eventType || analysisData?.eventType);
      const reportDate = new Date();
      // Deterministic report ID derived from analysis content so identical inputs → identical IDs
      const idSeed = `${analysisData?.id || ''}|${analysisData?.region || region || ''}|${analysisData?.eventType || eventType || ''}|${analysisData?.startDate || analysisData?.start_date || ''}|${analysisData?.endDate || analysisData?.end_date || ''}|${rawChange ?? ''}`;
      let hash = 0;
      for (let i = 0; i < idSeed.length; i++) hash = ((hash << 5) - hash + idSeed.charCodeAt(i)) | 0;
      const reportId = `GP-${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}-${Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 8)}`;
      const startDate = analysisData?.startDate || analysisData?.start_date || new Date().toISOString().split('T')[0];
      const endDate = analysisData?.endDate || analysisData?.end_date || new Date().toISOString().split('T')[0];
      const regionName = region || analysisData?.region || "Study Region";
      const area = analysisData?.area || analysisData?.area_analyzed || "N/A";
      const confidence = analysisData?.confidenceLevel ?? analysisData?.confidence ?? analysisData?.analysisConfidence ?? null;

      // Only include Driver Analysis if there's real underlying data for it -
      // otherwise it would be pure filler (and previously WAS, in the
      // generate-visualization AI-illustration version of this section).
      const driverData = analysisData?.changeDetection?.change_drivers?.length
        ? analysisData.changeDetection.change_drivers
        : null;

      // Single source of truth for section numbering, used to render BOTH the
      // table of contents AND each section header - guarantees they can never
      // drift out of sync the way the old hardcoded TOC vs. body numbers did.
      const sectionPlan: { key: string; title: string }[] = isSimple
        ? [
            { key: "executive_summary", title: "Executive Summary" },
            { key: "key_findings", title: "Key Findings & Analysis" },
          ]
        : [
            { key: "executive_summary", title: "Executive Summary" },
            { key: "project_overview", title: "Project Overview & Objectives" },
            { key: "satellite_imagery", title: "Satellite Imagery Analysis" },
            { key: "key_findings", title: "Key Findings & Analysis" },
            ...(driverData ? [{ key: "driver_analysis", title: "Driver Analysis" }] : []),
            { key: "risk_assessment", title: "Risk Assessment" },
            { key: "recommendations", title: "Recommendations & Implementation Roadmap" },
            { key: "quality_assurance", title: "Quality Assurance & Limitations" },
            { key: "methodology", title: "Geospatial Analysis Methodology" },
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
        pdf.text("CONFIDENTIAL - For authorized use only | © 2026 GeoPulse Environmental Intelligence", pageWidth / 2, pageHeight - 8, { align: "center" });
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
      const titleLines = pdf.splitTextToSize(eventInfo.fullTitle, contentWidth);
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
      pdf.text("Analysis Type:", margin + 5, metaStartY + 10);
      pdf.text("Study Period:", margin + 5, metaStartY + 20);
      pdf.text("Report Date:", margin + 5, metaStartY + 30);
      
      pdf.setTextColor(17, 24, 39);
      pdf.setFont("helvetica", "bold");
      pdf.text(reportId, margin + 40, metaStartY);
      pdf.text(eventInfo.label, margin + 40, metaStartY + 10);
      pdf.text(`${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} – ${new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, margin + 40, metaStartY + 20);
      pdf.text(reportDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), margin + 40, metaStartY + 30);
      
      // Classification badges
      pdf.setFillColor(8, 145, 178);
      pdf.roundedRect(pageWidth - margin - 50, metaStartY - 5, 45, 8, 2, 2, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.text("PROFESSIONAL ANALYSIS", pageWidth - margin - 48, metaStartY);
      
      pdf.setFillColor(34, 197, 94);
      pdf.roundedRect(pageWidth - margin - 50, metaStartY + 8, 45, 8, 2, 2, "F");
      pdf.text(confidence !== null ? `Confidence Level: ${confidence}%` : `Confidence Level: N/A`, pageWidth - margin - 48, metaStartY + 13);

      yPos += 65;

      // Prepared for section
      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.text("Prepared for:", margin, yPos);
      yPos += 8;
      
      pdf.setTextColor(55, 65, 81);
      pdf.setFont("helvetica", "normal");
      pdf.text("Environmental Management Committee & Stakeholders", margin, yPos);
      yPos += 20;

      // Footer section on cover
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, pageHeight - 25, pageWidth, 25, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.text("GeoPulse Environmental Intelligence Platform", margin, pageHeight - 15);
      pdf.text("www.geopulse.ai | contact@geopulse.ai", margin, pageHeight - 8);
      
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
        pdf.text("B. Spectral Indices Maps", margin + 10, yPos);
        yPos += 8;
        pdf.text("C. Land Classification Results", margin + 10, yPos);
      }

      // ============= PAGE 3: EXECUTIVE SUMMARY =============
      pdf.addPage();
      addPageHeader();
      yPos = 28;

      yPos = addSectionTitle("EXECUTIVE SUMMARY", yPos, sectionNum("executive_summary"));

      // Purpose paragraph with citation references
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(55, 65, 81);
      const purposeText = `Purpose of Analysis: This assessment was conducted to evaluate environmental conditions, quantify changes, and inform evidence-based land management policy in ${regionName}. The analysis covers the period from ${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to ${new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.${!isSimple ? ` See Section ${sectionNum("references")} for the specific data sources used in this report.` : ""}`;
      yPos = addWrappedText(purposeText, margin, yPos, contentWidth, 5);
      yPos += 8;

      // Assessment Overview Title
      yPos = addSubsectionTitle("Assessment Overview", yPos);

      // Assessment metrics table
      const assessmentHeaders = ["METRIC", "VALUE", "STATUS"];
      const assessmentRows = [
        ["Total Analysis Area (Baseline)", area, ""],
        ["Change Detected", `${Math.abs(changePercent).toFixed(1)}%`, changePercent > 15 ? "CRITICAL" : changePercent > 8 ? "MODERATE" : "LOW"],
        ["Annual Change Rate", `${(Math.abs(changePercent) / 2).toFixed(1)}% per year`, changePercent > 10 ? "CONCERNING" : "ACCEPTABLE"],
        ["Confidence Level", confidence !== null ? `${confidence}%` : "N/A", confidence !== null ? (confidence >= 85 ? "HIGH" : "MODERATE") : "—"],
        ["Risk Classification", risk.level, risk.level],
      ];
      yPos = addTableWithBorders(assessmentHeaders, assessmentRows, yPos, [70, 50, 50]);
      yPos += 8;

      // Critical Findings section
      yPos = addSubsectionTitle("Critical Findings", yPos);

      // Splits a real narrative paragraph into distinct chunks, one per
      // sentence-group, so GeoWitness-sourced reports (analyze-satellite
      // returns detailed_analysis/summary but no separate "findings" array)
      // get real, specific findings here instead of duplicating the
      // Recommendations section verbatim under a different heading - that
      // previous fallback (`analysisData?.recommendations`) was the reason
      // exported reports still looked repetitive/unchanged.
      const splitIntoFindings = (text: string, maxCount: number): string[] =>
        text
          .replace(/\s+/g, " ")
          .split(/(?<=[.!?])\s+(?=[A-Z])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 20)
          .slice(0, maxCount);

      const narrativeFindings = splitIntoFindings(
        String(analysisData?.fullAnalysis || analysisData?.detailedAnalysis || analysisData?.summary || ""),
        4
      );

      const findings = analysisData?.findings?.length > 0
        ? analysisData.findings
        : narrativeFindings.length > 0
        ? narrativeFindings
        : [
            { num: "1", title: "Change Pattern Analysis", detail: `Analysis reveals significant environmental change patterns within the study area, with changes concentrated in specific hotspots that require targeted monitoring and intervention.` },
            { num: "2", title: "Primary Drivers Identified", detail: `Multi-spectral analysis indicates primary drivers including land use change, environmental stressors, and anthropogenic activities contributing to the observed changes.` },
            { num: "3", title: "Temporal Trends", detail: `Seasonal analysis shows variation in change rates, with peak activity observed during specific periods that correlate with regional patterns.` },
            { num: "4", title: "Impact Assessment", detail: `The detected changes represent significant implications for ecosystem health, requiring continued monitoring and potential intervention strategies.` },
          ];

      findings.slice(0, 4).forEach((finding: any, index: number) => {
        checkPageBreak(20);
        const text = typeof finding === "string" ? finding : finding.detail || finding.description || "";
        const title = finding.title || `Finding ${index + 1}`;
        
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(17, 24, 39);
        pdf.text(`${index + 1}. ${sanitizeForPdf(title)}:`, margin, yPos);
        yPos += 5;
        
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(75, 85, 99);
        yPos = addWrappedText(text, margin + 5, yPos, contentWidth - 5, 4.5);
        yPos += 6;
      });

      // Risk Classification Banner
      checkPageBreak(30);
      yPos += 5;
      pdf.setFillColor(risk.bgColor[0], risk.bgColor[1], risk.bgColor[2]);
      pdf.roundedRect(margin, yPos, contentWidth, 25, 3, 3, "F");
      pdf.setFillColor(risk.color[0], risk.color[1], risk.color[2]);
      pdf.rect(margin, yPos, 5, 25, "F");
      
      pdf.setTextColor(risk.color[0], risk.color[1], risk.color[2]);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(`RISK CLASSIFICATION: ${risk.level}`, margin + 10, yPos + 10);
      
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(75, 85, 99);
      const riskText = `${risk.description}. Continued monitoring recommended to track progression and inform intervention strategies.`;
      pdf.text(pdf.splitTextToSize(riskText, contentWidth - 20)[0], margin + 10, yPos + 18);
      yPos += 35;

      // ============= PROJECT OVERVIEW & OBJECTIVES =============
      if (!isSimple) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("PROJECT OVERVIEW & OBJECTIVES", yPos, sectionNum("project_overview"));

        yPos = addSubsectionTitle("Study Parameters", yPos);
        const overviewHeaders = ["PARAMETER", "VALUE"];
        const overviewRows: string[][] = [
          ["Region", regionName],
          ["Event / Analysis Type", eventInfo.label],
          ["Study Period", `${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`],
          ["Area Analyzed", String(area)],
        ];
        if (typeof lat === "number" && typeof lng === "number") {
          overviewRows.push(["Coordinates", `${lat.toFixed(4)}, ${lng.toFixed(4)}`]);
        }
        yPos = addTableWithBorders(overviewHeaders, overviewRows, yPos, [70, 100]);
        yPos += 8;

        yPos = addSubsectionTitle("Objectives", yPos);
        const objectives = [
          `Quantify the extent and rate of ${eventInfo.label.toLowerCase()} in ${regionName} over the study period.`,
          `Assess the associated environmental risk and likely trajectory if current patterns continue.`,
          `Provide specific, actionable recommendations for the responsible stakeholders identified in this report.`,
        ];
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(55, 65, 81);
        objectives.forEach((obj, i) => {
          checkPageBreak(15);
          pdf.text(`${i + 1}.`, margin, yPos);
          yPos = addWrappedText(obj, margin + 6, yPos, contentWidth - 6, 5);
          yPos += 3;
        });
        yPos += 5;

        yPos = addSubsectionTitle("Scope & Data Basis", yPos);
        const scopeText = typeof lat === "number" && typeof lng === "number"
          ? `This report's satellite imagery panels (Section ${sectionNum("satellite_imagery")}) use real Sentinel-2 imagery for the coordinates above. Numeric spectral/change statistics elsewhere in this report are AI-generated estimates rather than pixel-level measurements - see Section ${sectionNum("quality_assurance")} for a full accounting of what is real data versus modeled approximation in this specific report.`
          : `No specific coordinates were available for this analysis, so satellite imagery panels could not be sourced from real imagery and numeric spectral/change statistics are AI-generated estimates rather than pixel-level measurements - see Section ${sectionNum("quality_assurance")} for a full accounting of what is real data versus modeled approximation in this specific report.`;
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
        const anyRealImagery = Object.values(lastDataSourcesRef.current).some((s) => /sentinel/i.test(s));
        const imageryIntro = anyRealImagery
          ? `The following panels include real Sentinel-2 L2A satellite imagery retrieved for this study area, alongside AI-generated illustrations for panel types not covered by real imagery retrieval. See Section ${sectionNum("quality_assurance")} for exactly which panels below are real versus AI-illustrated.`
          : `Real satellite imagery could not be retrieved for this report (no verified location was available), so the panels below are AI-generated illustrations rather than actual imagery. See Section ${sectionNum("quality_assurance")} for details.`;
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
          pdf.text(`Figure: Study area location for ${regionName} (OpenStreetMap).`, margin, yPos);
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
            pdf.text("True-color Landsat composite visualization", margin + contentWidth / 2 - 45, yPos + 45);
          }
        } else {
          // Placeholder when no image available
          pdf.setFontSize(12);
          pdf.setTextColor(107, 114, 128);
          pdf.text("Satellite Imagery Panel", margin + contentWidth / 2 - 30, yPos + 30);
          pdf.setFontSize(9);
          pdf.text("True-color Landsat 8/9 OLI composite", margin + contentWidth / 2 - 38, yPos + 40);
          pdf.text(`Region: ${regionName}`, margin + contentWidth / 2 - 20, yPos + 50);
        }
        yPos += 80;
        
        pdf.setFontSize(9);
        pdf.setTextColor(107, 114, 128);
        pdf.setFont("helvetica", "italic");
        pdf.text(`Figure 1: True-color satellite composite of ${regionName} showing study area extent and environmental conditions.`, margin, yPos);
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
          pdf.text("False Color Composite", margin + gridImageWidth / 2 - 28, yPos + 25);
          pdf.setFontSize(8);
          pdf.text("NIR-Red-Green bands", margin + gridImageWidth / 2 - 22, yPos + 35);
        }
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.setFont("helvetica", "bold");
        pdf.text("False Color Composite", margin + 3, yPos + gridImageHeight + 8);
        
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
          pdf.text("NDVI Vegetation Index", ndviX + gridImageWidth / 2 - 28, yPos + 25);
          pdf.setFontSize(8);
          pdf.text("Vegetation health analysis", ndviX + gridImageWidth / 2 - 28, yPos + 35);
        }
        pdf.setFontSize(8);
        pdf.setTextColor(75, 85, 99);
        pdf.setFont("helvetica", "bold");
        pdf.text("NDVI Vegetation Index", ndviX + 3, yPos + gridImageHeight + 8);
        
        yPos += gridImageHeight + 18;
      }

      // ============= KEY FINDINGS & TEMPORAL ANALYSIS =============
      pdf.addPage();
      addPageHeader();
      yPos = 28;

      yPos = addSectionTitle("KEY FINDINGS & ANALYSIS", yPos, sectionNum("key_findings"));

      // Temporal Dynamics table — uses real per-period values from analysis when present,
      // otherwise reports only the validated study-period total (no fabricated quarterly splits).
      yPos = addSubsectionTitle("Temporal Dynamics", yPos);

      const temporalHeaders = ["PERIOD", "CHANGE DETECTED", "RATE", "TREND"];
      const periodsFromData = analysisData?.temporalBreakdown || analysisData?.temporal_breakdown;
      let temporalRows: string[][];
      if (Array.isArray(periodsFromData) && periodsFromData.length > 0) {
        temporalRows = periodsFromData.map((p: any) => [
          String(p.label || p.period || "Period"),
          p.changePercent !== undefined ? `${parseFloat(p.changePercent).toFixed(1)}%` : "N/A",
          p.rate || (p.changePercent !== undefined && p.months ? `${(parseFloat(p.changePercent) / parseFloat(p.months)).toFixed(2)}%/month` : "N/A"),
          p.trend || (parseFloat(p.changePercent) > 5 ? "UP" : parseFloat(p.changePercent) < -5 ? "DOWN" : "FLAT"),
        ]);
      } else {
        temporalRows = [
          ["Full Study Period", `${changePercent.toFixed(1)}%`, "Cumulative", changePercent > 10 ? "STRONG UP" : changePercent > 0 ? "UP" : changePercent < 0 ? "DOWN" : "FLAT"],
        ];
      }
      yPos = addTableWithBorders(temporalHeaders, temporalRows, yPos, [50, 45, 40, 35]);
      yPos += 5;

      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "italic");
      pdf.text(Array.isArray(periodsFromData) && periodsFromData.length > 0
        ? "Per-period values derived from satellite analysis output."
        : "Sub-period breakdown not provided by analysis; cumulative total shown.", margin, yPos);
      yPos += 12;

      // Trend chart - rendered directly from the report's own numbers (see
      // renderTrendChartPng), not an AI illustration, so it always succeeds
      // and always matches the table above.
      checkPageBreak(75);
      yPos = addSubsectionTitle("Trend Analysis Visualization", yPos);

      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos, contentWidth, 60, 3, 3, "F");

      const chartImgWidth = contentWidth - 10;
      const chartImgHeight = 50;

      const chartPeriods = Array.isArray(periodsFromData) && periodsFromData.length > 0
        ? periodsFromData.map((p: any) => ({
            label: String(p.label || p.period || "Period"),
            value: p.changePercent !== undefined ? parseFloat(p.changePercent) : 0,
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
      pdf.text("Figure 2: Environmental change trend analysis showing temporal patterns over the study period.", margin, yPos);
      yPos += 12;

      // ============= DRIVER ANALYSIS (only when the analysis actually returned driver data) =============
      if (!isSimple && driverData) {
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("DRIVER ANALYSIS", yPos, sectionNum("driver_analysis"));

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(75, 85, 99);
        yPos = addWrappedText(
          "Contributing drivers identified for the detected change, as estimated by the analysis. These figures are AI-generated estimates, not measured attributions.",
          margin, yPos, contentWidth, 5
        );
        yPos += 8;

        const driverHeaders = ["DRIVER", "ESTIMATED CONTRIBUTION"];
        const driverRows = driverData.map((d: any) => [
          String(d.driver || d.name || "Unspecified"),
          d.contribution_percent !== undefined ? `${parseFloat(d.contribution_percent).toFixed(1)}%` : "N/A",
        ]);
        yPos = addTableWithBorders(driverHeaders, driverRows, yPos, [110, 60]);
        yPos += 8;

        if (analysisData?.multiEventAnalysis?.interaction_effects) {
          yPos = addSubsectionTitle("Interaction Effects", yPos);
          pdf.setFontSize(9.5);
          yPos = addWrappedText(String(analysisData.multiEventAnalysis.interaction_effects), margin, yPos, contentWidth, 5);
          yPos += 8;
        }
      }

      // ============= PROFESSIONAL REPORT EXTRAS =============
      if (!isSimple) {
        // RISK ASSESSMENT PAGE
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("RISK ASSESSMENT", yPos, sectionNum("risk_assessment"));

        // Risk classification box
        pdf.setFillColor(risk.bgColor[0], risk.bgColor[1], risk.bgColor[2]);
        pdf.roundedRect(margin, yPos, contentWidth, 20, 3, 3, "F");
        pdf.setTextColor(risk.color[0], risk.color[1], risk.color[2]);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.text(`CLASSIFICATION: ${risk.level} RISK`, margin + 8, yPos + 8);
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        pdf.text(risk.description, margin + 8, yPos + 15);
        yPos += 28;

        // Risk Factor Matrix
        yPos = addSubsectionTitle("Risk Factor Matrix", yPos);
        
        const riskHeaders = ["RISK FACTOR", "CURRENT STATUS", "SEVERITY", "5-YEAR PROJECTION"];
        const riskRows = [
          ["Change Rate", `${(changePercent / 2).toFixed(1)}% annually`, changePercent > 10 ? "HIGH" : "MODERATE", changePercent > 10 ? "CRITICAL" : "HIGH"],
          ["Environmental Impact", "Detected in study area", changePercent > 15 ? "HIGH" : "MODERATE", "MODERATE-HIGH"],
          ["Ecosystem Health", "Requires monitoring", "MODERATE", changePercent > 8 ? "HIGH" : "MODERATE"],
          ["Resource Sustainability", "Under assessment", changePercent > 12 ? "HIGH" : "MODERATE", "MODERATE"],
          ["Community Impact", "Potential effects identified", "MODERATE", "MODERATE-HIGH"],
        ];
        yPos = addTableWithBorders(riskHeaders, riskRows, yPos, [45, 50, 35, 40]);
        yPos += 10;

        // RECOMMENDATIONS PAGE
        checkPageBreak(80);
        yPos = addSectionTitle("RECOMMENDATIONS & IMPLEMENTATION ROADMAP", yPos, sectionNum("recommendations"));

        // Real recommendations from the analysis, organized into a
        // roadmap (priority/timeline/responsible are derived scaffolding
        // around real content, not fabricated advice) - only falls back to
        // generic placeholders when the analysis returned none at all.
        const realRecommendationText: string[] = Array.isArray(analysisData?.recommendations)
          ? analysisData.recommendations
              .map((r: any) => (typeof r === "string" ? r : r?.detail || r?.action || null))
              .filter((r: unknown): r is string => typeof r === "string" && r.trim().length > 0)
          : [];

        const timelineByIndex = (i: number) => ["Immediate", "30 days", "45 days", "60 days", "90 days"][i] || `${(i + 1) * 30} days`;
        const responsibleRotation = ["Environmental Agency", "Field Operations", "Community Liaison", "Policy Team", "Analysis Team"];
        const priorityByIndex = (i: number, total: number) => {
          if (i < Math.ceil(total / 3)) return "HIGH";
          if (i < Math.ceil((total * 2) / 3)) return "MEDIUM";
          return "LOW";
        };

        const recommendations = realRecommendationText.length > 0
          ? realRecommendationText.map((action, i) => ({
              priority: priorityByIndex(i, realRecommendationText.length),
              action,
              timeline: timelineByIndex(i),
              responsible: responsibleRotation[i % responsibleRotation.length],
            }))
          : [
              { priority: "HIGH", action: "Establish continuous monitoring protocols for identified change hotspots", timeline: "Immediate", responsible: "Environmental Agency" },
              { priority: "HIGH", action: "Deploy ground-truth verification teams to validate satellite findings", timeline: "30 days", responsible: "Field Operations" },
              { priority: "MEDIUM", action: "Engage local stakeholders and authorities with preliminary findings", timeline: "45 days", responsible: "Community Liaison" },
              { priority: "MEDIUM", action: "Develop intervention strategies based on driver analysis results", timeline: "60 days", responsible: "Policy Team" },
              { priority: "LOW", action: "Schedule follow-up analysis to track progression of detected changes", timeline: "90 days", responsible: "Analysis Team" },
            ];

        recommendations.forEach((rec) => {
          const priorityColors: Record<string, { bg: [number, number, number]; fg: [number, number, number] }> = {
            HIGH: { bg: [254, 226, 226], fg: [220, 38, 38] },
            MEDIUM: { bg: [254, 249, 195], fg: [161, 98, 7] },
            LOW: { bg: [220, 252, 231], fg: [21, 128, 61] }
          };

          const colors = priorityColors[rec.priority];
          const actionLines = pdf.splitTextToSize(sanitizeForPdf(rec.action), contentWidth - 30);
          const boxHeight = 14 + actionLines.length * 4.5;
          checkPageBreak(boxHeight + 4);

          pdf.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
          pdf.roundedRect(margin, yPos, contentWidth, boxHeight, 2, 2, "F");

          // Priority badge
          pdf.setFillColor(colors.fg[0], colors.fg[1], colors.fg[2]);
          pdf.roundedRect(margin + 3, yPos + 3, 18, 6, 1, 1, "F");
          pdf.setTextColor(255, 255, 255);
          pdf.setFontSize(7);
          pdf.setFont("helvetica", "bold");
          pdf.text(rec.priority, margin + 5, yPos + 7);

          // Action text (wrapped, not truncated to one line)
          pdf.setTextColor(17, 24, 39);
          pdf.setFontSize(9);
          pdf.setFont("helvetica", "normal");
          pdf.text(actionLines, margin + 25, yPos + 8);

          // Timeline
          const metaY = yPos + 8 + actionLines.length * 4.5;
          pdf.setTextColor(107, 114, 128);
          pdf.setFontSize(8);
          pdf.text(`Timeline: ${rec.timeline}`, margin + 25, metaY);
          pdf.text(`Responsible: ${rec.responsible}`, pageWidth - margin - 50, metaY);

          yPos += boxHeight + 4;
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
          "This section states plainly which parts of this specific report are real, measured data versus AI-generated estimates, so findings can be weighted appropriately.",
          margin, yPos, contentWidth, 5
        );
        yPos += 8;

        yPos = addSubsectionTitle("Data Basis for This Report", yPos);
        const provenanceHeaders = ["REPORT ELEMENT", "BASIS"];
        const imageLabel = (key: string, label: string): string[] => {
          const source = lastDataSourcesRef.current[key];
          if (!source) return [label, "Not generated for this report"];
          const isReal = /sentinel/i.test(source);
          return [label, isReal ? "Real Sentinel-2 satellite imagery" : "AI illustration (not real imagery)"];
        };
        const provenanceRows: string[][] = [
          ["Study area map", mapSnapshot ? "Real map screenshot (OpenStreetMap)" : "Not captured for this report"],
          imageLabel("landsat_truecolor", "True-color imagery panel"),
          imageLabel("landsat_falsecolor", "False-color imagery panel"),
          imageLabel("ndvi_map", "NDVI imagery panel"),
          ["Trend chart", "Rendered directly from this report's own figures (not AI-generated)"],
          ["Spectral indices / change %", analysisData?.dataProvenance?.analysisMethod === "ai_estimated" || !analysisData?.dataProvenance
            ? "AI-estimated (Google Gemini) - not measured from pixel data"
            : "See analysis source"],
          ["Location coordinates", analysisData?.locations?.[0]?.verified === false ? "AI-estimated, not geocoder-verified" : "Geocoded (OpenStreetMap/Nominatim) or user-selected"],
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
          "AI-estimated figures are plausible approximations, not ground-truth measurements - validate against field data before acting on them.",
          "Real satellite imagery (where used) is subject to cloud cover and a multi-day revisit cycle, so the most recent clear scene may predate the report date.",
          "AI interpretations are probabilistic and can vary between runs of the same query.",
          confidence !== null
            ? `This report's reported confidence level is ${confidence}%, self-assessed by the analysis - treat it as a rough indicator, not a statistical guarantee.`
            : "No confidence level was reported for this analysis.",
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

        yPos = addSectionTitle("GEOSPATIAL ANALYSIS METHODOLOGY", yPos, sectionNum("methodology"));

        const methodology = [
          {
            title: "Imagery Data Basis",
            content: `Where coordinates are available, the true-color, false-color, and NDVI panels in this report use real Sentinel-2 L2A imagery retrieved via the Copernicus Data Space Ecosystem's Sentinel Hub API, least-cloud mosaicked over the preceding 90 days, with cloud pixels masked using the Sentinel-2 Scene Classification Layer. ${analysisData?.locations?.[0]?.verified === false || (typeof lat !== "number") ? "For this specific report, no verified location was available, so imagery panels could not be sourced from real satellite data - see the Quality Assurance section for confirmation of what was actually used." : "This applies to the imagery panels in this specific report."}`
          },
          {
            title: "Numeric Analysis Generation",
            content: "Spectral index values, change percentages, and classification statistics are generated by Google Gemini from a text prompt describing the region, event type, and the real formulas for standard indices (NDVI, NDWI, NBR, NDBI). The model produces plausible estimates based on patterns in its training data - it does not compute these values from actual pixel data, and no image differencing or classification algorithm is run against real imagery for these figures."
          },
          {
            title: "Map & Chart Rendering",
            content: "The study area map is a real screenshot of the interactive map (OpenStreetMap tiles plus the study-area marker/boundary), captured at report generation time. The trend chart is drawn directly from this report's own reported figures using on-device rendering - it is not AI-generated."
          },
          {
            title: "Validation Approach",
            content: "This system does not perform independent ground-truth validation. The self-reported confidence level reflects the AI model's own assessment, not a statistically validated accuracy metric. For decisions with real consequences, validate findings against field data or authoritative sources such as USGS Earth Explorer or the Copernicus Browser."
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
        const transparencyRange = analysisData?.methodologyTransparency?.uncertainty_range;
        if (transparencyRange && (transparencyRange.lower !== undefined || transparencyRange.upper !== undefined)) {
          uncertaintyRows.push(["AI-reported uncertainty range", `${transparencyRange.lower ?? "?"}% to ${transparencyRange.upper ?? "?"}% (self-assessed by the model, not independently verified)`]);
        }
        if (confidence !== null) {
          uncertaintyRows.push(["Self-reported confidence level", `${confidence}% (the model's own assessment, not a statistical accuracy metric)`]);
        }
        uncertaintyRows.push(["Real imagery geolocation (where used)", "Sentinel-2 L2A products are typically geolocated to within about 1 pixel (~10m) per ESA specifications"]);
        uncertaintyRows.push(["Numeric spectral/change analysis", "Not independently validated by this system - see Validation Approach above"]);
        yPos = addTableWithBorders(uncertaintyHeaders, uncertaintyRows, yPos, [75, 95]);

        // DATA SOURCES PAGE
        pdf.addPage();
        addPageHeader();
        yPos = 28;

        yPos = addSectionTitle("REFERENCES & DATA SOURCES", yPos, sectionNum("references"));

        yPos = addSubsectionTitle("Data Sources Used In This Report", yPos);

        const usedRealImagery = Object.values(lastDataSourcesRef.current).some((s) => /sentinel/i.test(s));
        const eeConfigured = !!analysisData?.dataProvenance?.earthEngine?.configured;
        const dataSources = [
          "[1] Google Gemini (Google DeepMind). Generated the narrative analysis, findings, and recommendations in this report, and any AI-illustrated (non-real) imagery panels. https://ai.google.dev",
          ...(usedRealImagery ? [
            "[2] European Space Agency (ESA) / Copernicus Data Space Ecosystem. Real Sentinel-2 L2A satellite imagery, used for this report's true-color, false-color, and/or NDVI panels. https://dataspace.copernicus.eu",
          ] : []),
          "[3] OpenStreetMap Contributors. Basemap tiles for the study area map, and/or place-name geocoding used to resolve this report's location. https://www.openstreetmap.org",
          ...(eeConfigured ? [
            "[4] Google Earth Engine. A service-account credential is configured for this project but was not used to source real pixel data for this specific report - see Quality Assurance & Limitations.",
          ] : []),
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

        yPos += 8;
        yPos = addSubsectionTitle("Software Used to Produce This Report", yPos);

        const tools = [
          "jsPDF - client-side PDF document generation",
          "MapLibre GL JS - interactive map rendering for the study area map panel",
          "Supabase Edge Functions (Deno) - backend APIs for AI analysis and imagery retrieval",
          ...(usedRealImagery ? ["Sentinel Hub Process API (Copernicus Data Space Ecosystem) - real satellite imagery retrieval"] : []),
          "Google Gemini API - AI-generated narrative analysis and, where real imagery was unavailable, illustrative visualizations",
        ];

        tools.forEach((tool) => {
          checkPageBreak(8);
          pdf.text(`• ${tool}`, margin, yPos);
          yPos += 6;
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
            pdf.text("Land cover classification showing different surface types within the study area.", margin, yPos);
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
            pdf.text("Change detection highlighting areas of significant environmental change between analysis periods.", margin, yPos);
          } catch (e) {
            console.warn("Could not add change detection image");
          }
        }
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
      const disclaimer = "This report is generated using AI-assisted satellite imagery analysis. While every effort is made to ensure accuracy, results should be validated with ground-truth data before making critical decisions. GeoPulse Environmental Intelligence Platform is not liable for decisions made based solely on this analysis. Confidence scores and uncertainty ranges are provided to support informed interpretation.";
      const disclaimerLines = pdf.splitTextToSize(disclaimer, contentWidth - 20);
      pdf.text(disclaimerLines, margin + 10, yPos + 18);

      // Footer
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, pageHeight - 20, pageWidth, 20, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.text("GeoPulse Environmental Intelligence Platform", margin, pageHeight - 10);
      pdf.text("www.geopulse.ai | contact@geopulse.ai", pageWidth / 2 - 25, pageHeight - 10);
      pdf.text(`© ${new Date().getFullYear()} All Rights Reserved`, pageWidth - margin - 40, pageHeight - 10);

      // Add page numbers to all pages
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        if (i > 1) {
          pdf.setFontSize(8);
          pdf.setTextColor(107, 114, 128);
          pdf.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, pageHeight - 25);
          pdf.text("CONFIDENTIAL - For authorized use only", margin, pageHeight - 25);
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
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Professional Report</div>
                  <div className="text-xs text-muted-foreground">Full 15+ page analysis with methodology & appendices</div>
                </div>
              </span>
            </SelectItem>
            <SelectItem value="simple">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div className="text-left">
                  <div className="font-medium">Summary Report</div>
                  <div className="text-xs text-muted-foreground">Key findings and metrics overview (5 pages)</div>
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
            <span className="text-sm font-medium">Include AI Visualizations</span>
            <p className="text-xs text-muted-foreground">Satellite imagery, NDVI maps & charts</p>
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
                        <p className="text-sm text-muted-foreground">Assessment overview, key findings, risk classification with citations [1-3]</p>
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
                            <h4 className="font-bold">Page 6: Risk Assessment</h4>
                            <p className="text-sm text-muted-foreground">Risk factor matrix, priority recommendations</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <h4 className="font-bold">Page 7: Methodology</h4>
                            <p className="text-sm text-muted-foreground">Data acquisition, processing pipeline, AI framework [6-10]</p>
                          </div>
                          <div className="p-3 bg-muted rounded-lg">
                            <h4 className="font-bold">Page 8: References</h4>
                            <p className="text-sm text-muted-foreground">Numbered citations [1-10] linked throughout document</p>
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
                        <p className="text-xs text-muted-foreground">Landsat Bands 4-3-2 RGB</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Layers className="h-4 w-4 text-orange-500" />
                          <span className="text-sm font-medium">False-Color Composite</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Bands 5-4-3 NIR-R-G</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <div className="flex items-center gap-2 mb-2">
                          <Leaf className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-medium">NDVI Vegetation Map</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Vegetation health index</p>
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
                        <p className="text-xs mt-1">This will show a Landsat satellite image of your region</p>
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
            <Check className="h-3 w-3 text-emerald-500" /> Executive summary & risk assessment
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-500" /> Key metrics tables & findings
          </li>
          {includeImages && (
            <li className="flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-500" /> Satellite imagery panels & NDVI maps
            </li>
          )}
          {reportType === "professional" && (
            <>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Table of contents with citations [1-10]
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-500" /> Risk factor matrix & recommendations
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
          className="flex-1 h-12 text-base font-medium"
          onClick={generatePDFReport}
          disabled={isGenerating || !analysisData}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-5 w-5 mr-2" />
              Download Report
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ReportGenerator;
