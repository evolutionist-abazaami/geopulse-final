import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_VISUALIZATION_TYPES = [
  'map', 'chart', 'heatmap', 'comparison', 'infographic', 
  'satellite_2d', 'satellite_3d', 'satellite_4d', 'predictive', 'timeline',
  'landsat_truecolor', 'landsat_falsecolor', 'landsat_ndvi', 'landsat_change',
  'classification_map', 'change_detection_map', 'ndvi_map',
  // Advanced visualization types
  'terrain_3d', 'thermal_analysis', 'ndwi_water', 'nbr_fire', 
  'temporal_animation', 'risk_zones', 'ecosystem_health', 'driver_analysis'
];

function validateString(value: unknown, fieldName: string, maxLength: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${fieldName} is required`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`${fieldName} must be a string`);
  if (value.length > maxLength) throw new Error(`${fieldName} must be ${maxLength} characters or less`);
  return value.trim();
}

function validateVisualizationType(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Visualization type is required');
  }
  const normalized = value.toLowerCase().trim();
  if (!ALLOWED_VISUALIZATION_TYPES.includes(normalized)) {
    throw new Error(`Visualization type must be one of: ${ALLOWED_VISUALIZATION_TYPES.join(', ')}`);
  }
  return normalized;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Database configuration missing");
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Require authentication for visualization generation
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required. Please sign in to generate visualizations." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token. Please sign in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    const visualizationType = validateVisualizationType(body.visualizationType);
    const region = validateString(body.region, 'region', 200) || 'Africa';
    const eventType = validateString(body.eventType, 'eventType', 100) || 'environmental changes';
    const changePercent = body.changePercent || body.data?.changePercent || 0;
    const severity = body.severity || body.data?.severity || 'medium';
    const spectralIndices = body.spectralIndices || body.data?.spectralIndices;
    const classificationResults = body.classificationResults || body.data?.classificationResults;
    const changeDetection = body.changeDetection || body.data?.changeDetection;
    const landsatInfo = body.landsatInfo || body.data?.landsatInfo;
    const predictiveData = body.predictiveModeling || body.data?.predictiveModeling;
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Generating ${visualizationType} visualization for ${region} - User: ${user?.id || 'anonymous'}`);

    let prompt = "";
    switch (visualizationType) {
      // === LANDSAT MULTISPECTRAL IMAGERY ===
      case "landsat_truecolor":
        prompt = `Create a hyper-realistic Landsat 8/9 OLI true-color satellite image of ${region}, Africa.
Bands 4-3-2 (Red-Green-Blue) composite at 30m resolution.
REQUIREMENTS:
- Photorealistic appearance matching actual Landsat imagery
- Clear visibility of terrain features: rivers, forests, urban areas, agricultural fields
- Accurate color representation: green vegetation, blue water, gray urban, brown bare soil
- Include natural atmospheric haze for realism
- Cloud-free or minimal cloud coverage
- Show ${Math.abs(changePercent)}% ${eventType} change indicators if applicable
Technical specifications: Path/Row overlay, scale bar, north arrow, coordinate grid.
${landsatInfo ? `Sensor: ${landsatInfo.sensor}, Acquisition: ${landsatInfo.acquisition_dates?.join(', ')}` : 'Landsat 8 OLI, 30m resolution'}
Ultra high resolution, 16:9 aspect ratio, professional remote sensing quality.`;
        break;

      case "landsat_falsecolor":
        prompt = `Create a Landsat 8/9 OLI false-color composite satellite image of ${region}, Africa.
Bands 5-4-3 (NIR-Red-Green) for vegetation analysis OR Bands 7-6-4 (SWIR2-SWIR1-Red) for geology.
REQUIREMENTS:
- Vegetation appears bright red/pink (healthy) to dark red (stressed)
- Water appears dark blue to black
- Urban areas appear cyan/gray
- Bare soil appears brown/tan
- Fire scars appear dark brown/black
- Clearly shows ${eventType} patterns
${spectralIndices ? `NDVI range: ${spectralIndices.ndvi?.min?.toFixed(2)} to ${spectralIndices.ndvi?.max?.toFixed(2)}` : ''}
Include legend explaining color interpretation.
Professional remote sensing visualization, 16:9 aspect ratio.`;
        break;

      case "ndvi_map":
      case "landsat_ndvi":
        prompt = `Create a Landsat-derived NDVI (Normalized Difference Vegetation Index) map of ${region}, Africa.
NDVI = (NIR - Red) / (NIR + Red) visualization.
COLOR SCHEME:
- Dark red/brown (-1 to 0): Water, bare soil, urban
- Yellow/light green (0 to 0.3): Sparse vegetation, stressed crops
- Green (0.3 to 0.6): Moderate vegetation, agriculture
- Dark green (0.6 to 1.0): Dense healthy vegetation, forests
${spectralIndices?.ndvi ? `
Data: Min ${spectralIndices.ndvi.min?.toFixed(2)}, Max ${spectralIndices.ndvi.max?.toFixed(2)}, Mean ${spectralIndices.ndvi.mean?.toFixed(2)}` : ''}
Include continuous color bar legend with NDVI values.
Show ${Math.abs(changePercent)}% vegetation change related to ${eventType}.
Scientific vegetation health map, 30m Landsat resolution, 16:9 aspect ratio.`;
        break;

      case "landsat_change":
        prompt = `Create a Landsat-based temporal change detection map for ${region}, Africa.
Multi-date composite showing ${eventType} changes.
VISUALIZATION:
- Use bi-temporal RGB: Red=Before, Green=After, Blue=After
- Magenta areas = loss/decrease
- Cyan areas = gain/increase  
- Gray/white = no change
${changeDetection ? `
Change Statistics:
- Total changed: ${changeDetection.total_changed_area_km2} km²
- ${changeDetection.change_percent}% of study area changed
Major transitions: ${changeDetection.major_changes?.map((c: any) => c.type).join(', ')}` : `Change: ${Math.abs(changePercent)}%`}
Include change legend, timeline indicator (${landsatInfo?.acquisition_dates?.join(' → ') || 'Before → After'}).
Professional change detection map, 16:9 aspect ratio.`;
        break;

      case "classification_map":
        prompt = `Create a land cover classification map of ${region}, Africa derived from Landsat multispectral analysis.
${classificationResults ? `
CLASSIFICATION METHOD: ${classificationResults.method?.toUpperCase()}
CLASSES (${classificationResults.num_classes} total):
${classificationResults.classes?.slice(0, 8).map((c: any) => `- ${c.name}: ${c.area_percent?.toFixed(1)}%`).join('\n')}
ACCURACY: ${classificationResults.accuracy_metrics?.overall_accuracy?.toFixed(1)}% (Kappa: ${classificationResults.accuracy_metrics?.kappa_coefficient?.toFixed(2)})
` : `
Standard land cover classes:
- Water (Blue): Rivers, lakes, reservoirs
- Forest (Dark Green): Dense tree cover
- Agriculture (Light Green): Cropland, farms
- Grassland (Yellow-Green): Pastures, savannas
- Urban (Gray/Pink): Built-up areas
- Bare Soil (Brown): Exposed earth, deserts
`}
Use distinct, professional colors for each class.
Include legend with class names, areas, and percentages.
30m Landsat resolution, classified thematic map style, 16:9 aspect ratio.`;
        break;

      case "change_detection_map":
        prompt = `Create a post-classification change detection map for ${region}, Africa.
FROM-TO CHANGE MATRIX VISUALIZATION:
${changeDetection?.change_matrix ? `
Major Transitions:
${changeDetection.change_matrix.slice(0, 6).map((c: any) => `- ${c.from_class} → ${c.to_class}: ${c.area_km2?.toFixed(1)} km² (${c.percent?.toFixed(1)}%)`).join('\n')}
` : `
Show typical environmental changes:
- Forest → Agriculture (Green → Yellow)
- Agriculture → Urban (Yellow → Gray)
- Vegetation → Bare (Green → Brown)
- Water → Land (Blue → Brown)
`}
${changeDetection?.change_hotspots ? `
HOTSPOTS: ${changeDetection.change_hotspots.slice(0, 3).map((h: any) => h.location).join(', ')}` : ''}
No-change areas in transparent overlay.
Changed areas with distinct from-to color coding.
Include transition legend, change statistics panel.
Professional GIS change analysis map, 16:9 aspect ratio.`;
        break;

      // === ENHANCED SATELLITE VISUALIZATIONS ===
      case "satellite_2d":
        prompt = `Create a hyper-realistic 2D Landsat satellite imagery view of ${region}, Africa showing ${eventType}. 
Authentic Landsat 8/9 OLI true-color composite (Bands 4-3-2) at 30m resolution.
Show affected areas with scientifically accurate color differences indicating ${Math.abs(changePercent)}% ${eventType} change.
Include: Cloud-free imagery, sharp terrain features, visible infrastructure, river systems, vegetation patterns.
${severity === 'critical' ? 'Show dramatic visible damage/change in affected zones.' : ''}
${spectralIndices?.ndvi ? `Vegetation health (NDVI mean): ${spectralIndices.ndvi.mean?.toFixed(2)}` : ''}
Professional cartographic quality with north arrow, scale bar, coordinate reference. 
Ultra high resolution, 16:9 aspect ratio, photorealistic Landsat satellite imagery style.`;
        break;
        
      case "satellite_3d":
        prompt = `Create a stunning 3D terrain visualization of ${region}, Africa using Landsat imagery draped over SRTM DEM.
Oblique 3D perspective view with realistic terrain elevation (30m SRTM).
Landsat true-color or false-color composite draped on topography.
Show topographic features: mountains, valleys, river basins, coastlines with dramatic shadows.
Overlay ${eventType} impact data as semi-transparent color gradation.
${changePercent > 20 ? 'Highlight critical change areas with glowing boundaries.' : ''}
${classificationResults ? `Show ${classificationResults.num_classes}-class land cover overlay.` : ''}
Include: 3D vegetation representation, atmospheric haze for depth, realistic lighting.
Professional 3D GIS visualization style, ultra high resolution, 16:9 aspect ratio.`;
        break;
        
      case "satellite_4d":
        prompt = `Create a temporal 4D visualization showing ${eventType} change over time in ${region}, Africa using Landsat time series.
Split-panel or animated sequence style showing BEFORE and AFTER Landsat imagery.
Left panel: Start date imagery with original conditions.
Right panel: End date imagery with ${Math.abs(changePercent)}% ${eventType} change visible.
${changeDetection ? `
Total changed area: ${changeDetection.total_changed_area_km2} km²
Major changes: ${changeDetection.major_changes?.slice(0, 2).map((c: any) => c.type).join(', ')}` : ''}
Add temporal annotations, timeline indicator, and change detection overlay.
${predictiveData ? `Show projected future state with ${predictiveData.projected_change_12mo}% additional change.` : ''}
Professional Landsat time-series analysis style, photorealistic, 16:9 aspect ratio.`;
        break;
        
      case "predictive":
        prompt = `Create a predictive modeling visualization for ${eventType} in ${region}, Africa based on Landsat trend analysis.
Show projected environmental changes over the next 12 months.
Include: Current state indicator, trend arrows, confidence bands, projection zones.
Use gradient colors from current (blue) through projected (orange/red for decline, green for improvement).
${predictiveData ? `
Trend: ${predictiveData.trend_direction}
6-month projection: ${predictiveData.projected_change_6mo}%
12-month projection: ${predictiveData.projected_change_12mo}%
Confidence: ${predictiveData.confidence}%
Method: ${predictiveData.methodology}` : ''}
Add predictive heat zones showing high-probability change areas.
Professional scientific forecasting visualization, 16:9 aspect ratio.`;
        break;
        
      case "timeline":
        prompt = `Create an animated timeline visualization showing ${eventType} progression in ${region}, Africa using Landsat archive.
Circular or linear timeline design showing yearly changes from 2020-2025.
Each time point shows Landsat snapshot with change percentage overlay.
Progressive color shift from green (healthy) through yellow to red (critical) based on degradation.
${spectralIndices?.ndvi ? `Track NDVI trends: current mean ${spectralIndices.ndvi.mean?.toFixed(2)}` : ''}
Include: Timeline markers, percentage annotations, trend line, key event callouts.
Professional animated infographic style, 16:9 aspect ratio.`;
        break;

      case "map":
        prompt = `Create a professional Landsat satellite map visualization showing ${eventType} in ${region}, Africa. 
Photorealistic Landsat 8/9 basemap with affected areas highlighted in heat overlay.
Include: Clean legend, scale bar, north arrow, coordinate grid (WGS84).
${landsatInfo ? `Data source: ${landsatInfo.sensor}, ${landsatInfo.spatial_resolution} resolution` : 'Landsat 8 OLI, 30m resolution'}
Show ${Math.abs(changePercent)}% change with intensity-based coloring.
Ultra high resolution, professional cartographic style, 16:9 aspect ratio.`;
        break;
        
      case "chart":
        prompt = `Create a professional data visualization chart showing ${eventType} trends over time for ${region}.
Modern line graph with percentage change on Y-axis (-50% to +50%) and years 2020-2025 on X-axis.
${spectralIndices ? `
Include spectral index panel:
- NDVI trend line (vegetation health)
${spectralIndices.ndwi ? '- NDWI trend (water content)' : ''}
${spectralIndices.nbr ? '- NBR trend (burn severity)' : ''}` : ''}
Use gradient blue-to-red color scheme based on severity.
Include: Clean gridlines, proper axis labels, data points with values, trend line, projection zone.
Add confidence interval shading and annotation for key events.
Professional scientific chart style, 16:9 aspect ratio.`;
        break;
        
      case "heatmap":
        prompt = `Create a professional heatmap visualization showing intensity of ${eventType} across ${region}, Africa.
Geographic heatmap with gradient: Dark green (low impact) → Yellow → Orange → Dark red (high impact).
${classificationResults ? `Overlay on ${classificationResults.num_classes}-class land cover base map.` : 'Overlay on subtle Landsat basemap for geographic context.'}
Include: Clear legend showing intensity scale (0-100%), geographic labels, regional boundaries.
${changeDetection?.change_hotspots ? `Highlight hotspots: ${changeDetection.change_hotspots.slice(0, 3).map((h: any) => h.location).join(', ')}` : ''}
Show clusters of ${eventType} activity.
Scientific visualization style, 16:9 aspect ratio.`;
        break;
        
      case "comparison":
        prompt = `Create a professional before/after Landsat satellite comparison for ${region} showing ${eventType}.
Clean split-view with Landsat imagery: Start date on left, End date on right.
Photorealistic Landsat imagery style for both panels.
Highlight changed areas with subtle boundary outlines.
${changeDetection ? `
Total change: ${changeDetection.total_changed_area_km2} km² (${changeDetection.change_percent}%)` : `Change: ${Math.abs(changePercent)}%`}
Include: Date labels, change percentage overlay, scale bar.
${severity === 'critical' ? 'Dramatic visible transformation between panels.' : 'Subtle but detectable differences.'}
Professional remote sensing visualization, 16:9 aspect ratio.`;
        break;

      // === ADVANCED VISUALIZATION TYPES ===
      case "terrain_3d":
        prompt = `Create an ultra-realistic 3D terrain visualization of ${region}, Africa using SRTM DEM elevation data.
REQUIREMENTS:
- Dramatic oblique 3D perspective view at 45-60 degree angle
- Realistic terrain shadowing with sun angle from northwest
- Landsat imagery draped on 3D topography
- Clear visibility of: mountain ridges, valleys, river channels, escarpments
- Vertical exaggeration 2x for dramatic effect
- Overlay ${eventType} impact zones as semi-transparent colored regions
- Show elevation color gradient: blue (lowlands) → green → yellow → brown → white (peaks)
${changePercent > 15 ? 'Highlight critical change areas with pulsing boundaries.' : ''}
Include: Elevation legend (meters), scale bar, viewing angle indicator.
Professional 3D GIS terrain visualization, photorealistic, 16:9 aspect ratio.`;
        break;

      case "thermal_analysis":
        prompt = `Create a Landsat thermal infrared analysis map of ${region}, Africa.
Using Landsat 8/9 TIRS Band 10 (10.6-11.2 μm) thermal data.
COLOR SCHEME:
- Deep blue (< 15°C): Cool areas, water bodies, high altitude
- Light blue/cyan (15-25°C): Moderate temperature zones
- Green/yellow (25-35°C): Warm vegetation, agricultural areas
- Orange (35-45°C): Hot bare soil, urban heat islands
- Red/dark red (> 45°C): Extreme heat, fire scars, exposed rock
Show thermal anomalies related to ${eventType}.
${changePercent > 10 ? `Highlight temperature anomaly zones with ${Math.abs(changePercent)}% deviation.` : ''}
Include: Temperature scale legend (°C), urban heat island indicators, cool spots.
Scientific thermal remote sensing visualization, 100m resolution, 16:9 aspect ratio.`;
        break;

      case "ndwi_water":
        prompt = `Create a Landsat-derived NDWI (Normalized Difference Water Index) map of ${region}, Africa.
NDWI = (Green - NIR) / (Green + NIR) for water body detection.
COLOR SCHEME:
- Deep blue (0.3 to 1.0): Open water, rivers, lakes
- Light blue (0.1 to 0.3): Shallow water, wetlands, flooded areas
- Cyan (0 to 0.1): Saturated soil, water-logged terrain
- Gray/tan (-0.3 to 0): Dry land, urban areas
- Brown (-1 to -0.3): Bare soil, desert
${spectralIndices?.ndwi ? `
Data: Min ${spectralIndices.ndwi.min?.toFixed(2)}, Max ${spectralIndices.ndwi.max?.toFixed(2)}, Mean ${spectralIndices.ndwi.mean?.toFixed(2)}` : ''}
Show water extent changes related to ${eventType} (${Math.abs(changePercent)}% change).
Include: Water body boundaries, drainage networks, flood extent.
Hydrological analysis map, Landsat 30m resolution, 16:9 aspect ratio.`;
        break;

      case "nbr_fire":
        prompt = `Create a Landsat-derived NBR (Normalized Burn Ratio) map of ${region}, Africa.
NBR = (NIR - SWIR2) / (NIR + SWIR2) for fire/burn severity mapping.
COLOR SCHEME:
- Dark green (0.5 to 1.0): Healthy, unburned vegetation
- Light green (0.25 to 0.5): Low severity burn / regrowth
- Yellow (0 to 0.25): Moderate-low severity burn
- Orange (-0.25 to 0): Moderate-high severity burn
- Red (-0.5 to -0.25): High severity burn
- Black/dark red (-1 to -0.5): Severe burn scars
${spectralIndices?.nbr ? `
Data: Min ${spectralIndices.nbr.min?.toFixed(2)}, Max ${spectralIndices.nbr.max?.toFixed(2)}, Mean ${spectralIndices.nbr.mean?.toFixed(2)}` : ''}
Show ${eventType} with fire-affected area of ${Math.abs(changePercent)}%.
Include: Burn severity legend, fire perimeter boundaries, recovery zones.
Fire ecology analysis map, Landsat 30m resolution, 16:9 aspect ratio.`;
        break;

      case "temporal_animation":
        prompt = `Create a temporal animation sequence visualization of ${region}, Africa showing ${eventType} change over time.
MULTI-FRAME COMPOSITE:
- 6 panels showing yearly progression (2020-2025)
- Each panel: Landsat snapshot with clear date label
- Progressive color shift indicating change intensity
- Arrow indicators showing change direction between panels
${changeDetection ? `
Total change: ${changeDetection.total_changed_area_km2} km²
Rate: ${(changeDetection.change_percent / 5).toFixed(1)}% per year` : `Rate: ${(Math.abs(changePercent) / 2).toFixed(1)}% per year`}
Include: Timeline bar, cumulative change graph, key event annotations.
Professional time-series visualization, animated style, 16:9 aspect ratio.`;
        break;

      case "risk_zones":
        prompt = `Create a risk zone classification map of ${region}, Africa for ${eventType}.
RISK CLASSIFICATION:
- Red/Dark Red: Critical Risk Zone (immediate intervention required)
- Orange: High Risk Zone (urgent monitoring needed)
- Yellow: Moderate Risk Zone (enhanced surveillance)
- Light Green: Low Risk Zone (standard monitoring)
- Dark Green: Minimal Risk Zone (stable conditions)
Risk based on: ${Math.abs(changePercent)}% change rate, environmental drivers, vulnerability factors.
${changeDetection?.change_hotspots ? `
Priority Hotspots: ${changeDetection.change_hotspots.slice(0, 4).map((h: any) => h.location).join(', ')}` : ''}
Include: Risk legend with action recommendations, priority zones numbered 1-5.
Emergency management style map, 16:9 aspect ratio.`;
        break;

      case "ecosystem_health":
        prompt = `Create a comprehensive ecosystem health dashboard for ${region}, Africa.
MULTI-PANEL VISUALIZATION:
- Panel 1: Vegetation health (NDVI-based) with health gradient
- Panel 2: Water availability (NDWI-based) with moisture levels
- Panel 3: Biodiversity indicators (habitat connectivity)
- Panel 4: Overall ecosystem score (0-100)
${spectralIndices ? `
NDVI Health: ${spectralIndices.ndvi?.mean?.toFixed(2) || 'N/A'}
${spectralIndices.ndwi ? `NDWI Water: ${spectralIndices.ndwi.mean?.toFixed(2)}` : ''}
${spectralIndices.savi ? `SAVI Index: ${spectralIndices.savi.mean?.toFixed(2)}` : ''}` : ''}
Overall Score: ${100 - Math.abs(changePercent)}%
Status: ${changePercent > 15 ? 'CRITICAL' : changePercent > 8 ? 'WARNING' : 'STABLE'}
Include: Trend arrows, health gauges, recommendation panel.
Scientific dashboard style, 16:9 aspect ratio.`;
        break;

      case "driver_analysis":
        prompt = `Create a driver analysis infographic for ${eventType} in ${region}, Africa.
CAUSAL FACTORS VISUALIZATION:
- Pie chart showing contribution of different drivers
- Primary drivers: Land use change, Climate factors, Human activity
- Secondary drivers: Policy, Infrastructure, Economic factors
${changeDetection?.change_drivers ? `
Driver Breakdown:
${changeDetection.change_drivers.slice(0, 5).map((d: any) => `- ${d.driver}: ${d.contribution_percent}%`).join('\n')}` : `
Estimated Drivers:
- Agricultural expansion: 35%
- Infrastructure development: 25%
- Climate variability: 20%
- Resource extraction: 15%
- Other factors: 5%`}
Include: Driver icons, interconnection arrows, mitigation recommendations.
Professional infographic style, 16:9 aspect ratio.`;
        break;
        
      default:
        prompt = `Create a professional environmental analysis infographic for ${region} showing ${eventType}.
Based on Landsat multispectral satellite analysis.
Include: Satellite imagery section, key statistics (${Math.abs(changePercent)}% change), spectral indices, trend chart, recommendations.
${classificationResults ? `Land cover classification with ${classificationResults.num_classes} classes.` : ''}
${changeDetection ? `Change detection showing ${changeDetection.total_changed_area_km2} km² changed.` : ''}
Clean, modern design with data visualization elements.
Professional scientific poster style, 16:9 aspect ratio.`;
    }

    // Image generation via Lovable AI Gateway (primary) with direct Gemini as fallback.
    // The Gateway uses LOVABLE_API_KEY which has higher quota than the free Gemini tier.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const model = "gemini-2.5-flash-image";
    let imageUrl: string | null = null;
    let description = "";
    let lastStatus = 0;

    // --- Attempt 1: Lovable AI Gateway ---
    if (LOVABLE_API_KEY) {
      try {
        const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: `google/${model}`,
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });
        lastStatus = gwRes.status;
        if (gwRes.ok) {
          const gwData = await gwRes.json();
          const msg = gwData?.choices?.[0]?.message;
          const img = msg?.images?.[0]?.image_url?.url;
          if (img) imageUrl = img;
          if (typeof msg?.content === "string") description = msg.content;
        } else {
          console.error(`Lovable Gateway error: ${gwRes.status}`, (await gwRes.text()).slice(0, 200));
        }
      } catch (e) {
        console.error("Lovable Gateway request failed:", e);
      }
    }

    // --- Attempt 2: Direct Gemini fallback ---
    if (!imageUrl) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const requestBody = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      });
      let response: Response | null = null;
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        if (response.ok) break;
        lastStatus = response.status;
        const errText = await response.text();
        console.error(`Direct Gemini error (attempt ${attempt}/${maxAttempts}):`, response.status, errText.slice(0, 200));
        const isRetryable = response.status === 503 || response.status === 429 || response.status === 500;
        if (!isRetryable || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 6000) + Math.random() * 400));
      }
      if (response && response.ok) {
        const aiData = await response.json();
        const parts = aiData?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inline_data || part.inlineData) {
            const inline = part.inline_data || part.inlineData;
            const mime = inline.mime_type || inline.mimeType || "image/png";
            imageUrl = `data:${mime};base64,${inline.data}`;
          } else if (part.text) {
            description += part.text;
          }
        }
      }
    }

    // Graceful fallback: never throw on upstream rate-limits/overloads.
    if (!imageUrl && (lastStatus === 429 || lastStatus === 503 || lastStatus === 500)) {
      return new Response(
        JSON.stringify({
          success: true,
          imageUrl: null,
          fallback: true,
          description:
            lastStatus === 429
              ? "Image generation is rate-limited right now. Showing analysis without an AI-rendered visualization."
              : "AI image provider is temporarily overloaded. Showing analysis without an AI-rendered visualization.",
          visualizationType,
          model,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!imageUrl) {
      console.log("No images generated, returning placeholder");
      return new Response(
        JSON.stringify({ 
          success: true,
          imageUrl: null,
          description: description || "Visualization generated",
          visualizationType
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        imageUrl,
        description: description || "Landsat visualization generated successfully",
        visualizationType,
        model,
        dataSource: "Landsat 8/9 OLI"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-visualization:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const status = errorMessage.includes("required") || errorMessage.includes("must be") ? 400 : 500;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
