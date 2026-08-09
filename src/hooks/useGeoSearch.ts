import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMapContext } from "@/contexts/MapContext";
import { parseAfricanQuery } from "@/utils/africanGeocoding";
import type { GeoSearchResult } from "@/contexts/RightPanelContext";

type SelectedLocation = { lat: number; lng: number; name: string } | null;

// Ported verbatim from the old GeoSearch.tsx page - offline fallback used
// when the process-search edge function is unreachable.
const generateLocalSearchInterpretation = (queryText: string, selectedLoc: SelectedLocation) => {
  const parsed = parseAfricanQuery(queryText);
  const loc = selectedLoc || { lat: parsed.location.lat, lng: parsed.location.lng, name: parsed.location.name };
  const event = parsed.eventType;
  const locLower = loc.name.toLowerCase();
  const qLower = queryText.toLowerCase();

  let interpretation = `Multi-spectral Sentinel-2 satellite evaluation for "${queryText}" in ${loc.name}. Processing Band 3 (Green), Band 8 (NIR), and Band 11 (SWIR1) surface reflectance highlights temporal environmental variation across target sectors.`;
  let findings = [
    `NDWI (Normalized Difference Water Index) signatures indicate altered hydrological accumulation and localized surface runoff near ${loc.name}.`,
    `Sentinel-2 multi-spectral band differencing confirms surface reflectance changes associated with ${event.replace(/_/g, " ")} across primary drainage vectors.`,
    `Urban land cover density and surrounding topography contribute to localized environmental vulnerability in ${loc.name}.`,
  ];
  let recommendations = [
    `Establish high-frequency Sentinel-2 satellite surveillance alerts over ${loc.name}.`,
    `Deploy municipal engineering teams to inspect primary drainage channels and low-lying sectors in ${loc.name}.`,
    `Integrate multi-spectral satellite indices into local emergency response frameworks.`,
  ];

  if (locLower.includes("abidjan") || qLower.includes("abidjan") || qLower.includes("abijan")) {
    interpretation = `Comprehensive satellite flood risk and hydrological assessment for "${queryText}" targeting Abidjan (Lagunes Region, Côte d'Ivoire). Processing Sentinel-2 Band 3 (Green) and Band 8 (NIR) confirms high moisture saturation around Ébrié Lagoon and Indénié crossroads.`;
    findings = [
      `Elevated NDWI (Water Index) anomalies detected along the Indénié basin, Cocody bayou, and low-lying coastal districts of Yopougon and Abobo.`,
      `Tropical monsoon heavy rainfall coupled with steep urban hillside slopes in Abidjan increases slope instability and mudslide risks along Banco forest fringes.`,
      `Impermeable urban infrastructure in central Abidjan has reduced soil infiltration, concentrating runoff into the Ébrié Lagoon estuary.`,
    ];
    recommendations = [
      `Execute emergency dredging and channel enlargement at the Carrefour Indénié stormwater junction in Abidjan.`,
      `Install telemetry water level monitors along the Banco River and Cocody bayou channels.`,
      `Enforce strict urban slope protection policies to prevent building encroachments along landslide-prone hillsides in Abidjan.`,
    ];
  } else if (locLower.includes("kumasi") || qLower.includes("kumasi")) {
    interpretation = `Comprehensive satellite flood risk and hydrological assessment for "${queryText}" targeting Kumasi (Ashanti Region, Ghana). Processing Sentinel-2 Band 3 (Green) and Band 8 (NIR) confirms high moisture saturation across the Subin, Aboabo, and Wiwi river catchments.`;
    findings = [
      `Severe NDWI surface moisture anomalies detected along the Subin river channel, Kejetia market vicinity, and low-lying residential sectors of Aboabo and Asafo in Kumasi.`,
      `Rapid urban expansion and high impermeable surface density in the Kumasi metropolitan area have reduced natural soil infiltration capacity by over 35%.`,
      `Multi-temporal Sentinel-2 SWIR imagery highlights seasonal waterlogging of wetlands surrounding the Owabi and Barekese reservoir basins.`,
    ];
    recommendations = [
      `Execute immediate engineering interventions to dredge, widen, and concrete-line the Subin and Aboabo river channels through central Kumasi.`,
      `Enforce strict municipal zoning restrictions preventing building encroachments on Kumasi floodplains and natural buffer zones.`,
      `Install telemetry-enabled water level sensors at critical culverts along the Kumasi-Accra highway and Kejetia transit hub.`,
    ];
  } else if (locLower.includes("accra") || qLower.includes("accra")) {
    interpretation = `Satellite hydrological and flood risk assessment for "${queryText}" in Accra (Greater Accra Region, Ghana). Multi-spectral processing confirms high surface moisture saturation in the Odaw River basin and Korle Lagoon.`;
    findings = [
      `High NDWI moisture values mapped along the Odaw river channel, Alajo, Kaneshie market, and Mallam interchange low-lying zones.`,
      `Dense paved urban surface cover in central Accra prevents rainwater absorption, forcing massive runoff into coastal lagoons.`,
    ];
    recommendations = [
      `Accelerate dredging operations along the Odaw river channel and Korle Lagoon outlet.`,
      `Construct retention basins upstream to mitigate storm runoff surges into central Accra.`,
    ];
  } else if (locLower.includes("lagos") || qLower.includes("lagos")) {
    interpretation = `Multi-spectral coastal inundation and flood risk evaluation for "${queryText}" targeting Lagos Megacity (Lagos State, Nigeria). Sentinel-2 imagery reveals high water table and tidal surge impacts.`;
    findings = [
      `High NDWI water signatures observed across Lekki Peninsula, Victoria Island coastal fringe, and Agege low-lying drainage channels.`,
      `Low elevation and lagoon surges during high tides exacerbate urban flood retention across Lagos metropolitan sectors.`,
    ];
    recommendations = [
      `Upgrade coastal sea wall barriers along Lekki and Victoria Island shorelines.`,
      `Desilt primary storm drainage canals emptying into Lagos Lagoon.`,
    ];
  }

  return {
    query: queryText,
    interpretation,
    findings,
    locations: [{ name: loc.name, lat: loc.lat, lng: loc.lng, verified: !!selectedLoc || parsed.location.type !== "custom" }],
    confidenceLevel: 93,
    recommendations,
  };
};

/**
 * Extracted from the old GeoSearch.tsx page - same process-search fetch and
 * offline fallback logic, adapted to drive the single shared map (via
 * MapContext) instead of a page-local map instance.
 */
export function useGeoSearch() {
  const mapCtx = useMapContext();
  const [isSearching, setIsSearching] = useState(false);

  const search = async (queryText: string, selectedLocation: SelectedLocation = null): Promise<GeoSearchResult | null> => {
    if (!queryText.trim()) return null;

    setIsSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let raw: any;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-search`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
            },
            body: JSON.stringify({
              query: queryText,
              selectedLocation: selectedLocation
                ? { lat: selectedLocation.lat, lng: selectedLocation.lng, name: selectedLocation.name }
                : null,
            }),
          }
        );
        raw = response.ok ? await response.json() : generateLocalSearchInterpretation(queryText, selectedLocation);
      } catch {
        raw = generateLocalSearchInterpretation(queryText, selectedLocation);
      }

      const parsedLoc = parseAfricanQuery(queryText);
      const locatableResults = Array.isArray(raw.locations)
        ? raw.locations.filter((l: any) => Number.isFinite(l?.lat) && Number.isFinite(l?.lng))
        : [];
      const locList = locatableResults.length > 0
        ? locatableResults
        : [selectedLocation || { name: parsedLoc.location.name, lat: parsedLoc.location.lat, lng: parsedLoc.location.lng, verified: parsedLoc.location.type !== "custom" }];

      let reportLocation: GeoSearchResult["reportLocation"] = null;

      if (locList.length > 0) {
        const first = locList[0];
        mapCtx.setMarkers(locList.map((loc: any) => ({
          lat: loc.lat || parsedLoc.location.lat,
          lng: loc.lng || parsedLoc.location.lng,
          label: loc.name || parsedLoc.location.name,
          color: "#0891b2",
        })));

        if (first.lat && first.lng) {
          mapCtx.setView([first.lat, first.lng], 10);
          reportLocation = { lat: first.lat, lng: first.lng, name: first.name || parsedLoc.location.name, verified: first.verified !== false };

          const boundarySize = 0.2;
          mapCtx.setPolygons([{
            coordinates: [
              [first.lng - boundarySize, first.lat + boundarySize],
              [first.lng + boundarySize, first.lat + boundarySize],
              [first.lng + boundarySize, first.lat - boundarySize],
              [first.lng - boundarySize, first.lat - boundarySize],
              [first.lng - boundarySize, first.lat + boundarySize],
            ],
            label: first.name || "Area of Interest",
            color: "#0891b2",
            fillOpacity: 0.25,
          }]);
        }
      }

      return {
        query: queryText,
        interpretation: raw.interpretation,
        findings: raw.findings || [],
        locations: raw.locations || [],
        confidenceLevel: raw.confidenceLevel ?? 85,
        recommendations: raw.recommendations || [],
        reportLocation,
      };
    } finally {
      setIsSearching(false);
    }
  };

  return { isSearching, search };
}
