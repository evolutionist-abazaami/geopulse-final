# Data sources and service limits

This note separates services currently used by GeoPulse from candidates that
still need integration. “Free” does not mean unlimited, guaranteed, or
appropriate for production traffic.

## In use

| Service | Current use | Access and constraints |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org/quick_start/) | Default MapLibre basemap (`VITE_MAP_STYLE_URL` can override it). | Public hosted tiles; no API key is required for the documented style. The public endpoint is not an application SLA. Use a managed provider or self-host tiles if testing traffic requires guaranteed capacity. |
| [OpenStreetMap Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Explicit place search and reverse lookup; returned boundaries are drawn and can be sent as analysis AOIs. | End-user searches only; no autocomplete. The public service has an absolute maximum of one request per second per application, requires identifying app attribution/referrer, and has no capacity guarantee. GeoPulse currently throttles and caches only within one browser module; that is **not** a shared per-application limit. Suitable only for moderate prototype usage. Add a shared proxy/cache and global rate limiter, or run a dedicated geocoder, before increasing users. OpenStreetMap data is ODbL; display attribution and review the license for redistributed extracts. |
| [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/) | Sentinel-2 L2A statistics for supported recent analysis windows. | Requires configured credentials; processing/catalogue use is governed by provider quotas and terms. A provider failure is shown as unavailable, not replaced with invented measurements. |
| [Google Earth Engine](https://developers.google.com/earth-engine/guides/access) + [USGS Landsat Collection 2](https://www.usgs.gov/landsat-missions/landsat-collection-2) | Historical Landsat Level-2 fallback in satellite analysis for dates before Sentinel-2 coverage. | The USGS archive is free, but this application accesses it through Earth Engine. The deployed project needs Earth Engine registration, service-account credentials, and quota monitoring. Level-2 surface-reflectance products are globally available from 1982 onward, subject to product availability. |
| [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) | Context-only MODIS/Terra NDVI and land-surface-temperature overlays, plus GPM IMERG precipitation-rate imagery. | These are coarse, provider-rendered context layers; they are not the selected AOI’s analysis result. Tile availability and temporal coverage vary by layer. The UI shows product attribution and labels the layers as context. |

## Recommended additions

| Service or dataset | Why it helps | Integration status and caveats |
|---|---|---|
| [geoBoundaries](https://www.geoboundaries.org/) | Open administrative boundary data at multiple levels; useful as a stable fallback for country and subnational outlines when place search returns no polygon. | Not integrated yet. Data is CC BY 4.0 and requires attribution. Import/cache boundaries and select the correct administrative level rather than inventing an outline. |
| [HydroBASINS](https://www.hydrosheds.org/products/hydrobasins) | Global, nested watershed polygons and Pfafstetter connectivity; the best fit for named basin/catchment analysis instead of treating a basin name as a point. | Not integrated yet. Free for commercial use under its stated license, with the terms and required attribution in the HydroSHEDS documentation. The Africa download contains large, multi-level datasets; preprocess and host a searchable vector service rather than downloading them in each browser session. |
| [CHIRPS v3](https://www.chc.ucsb.edu/data/chirps3) | Long-term gridded rainfall for drought and precipitation context, complementary to optical vegetation indices. | Not integrated yet. CHC says v3 is available and v2 production ends after December 2026. Preserve the dataset version, dates, and spatial resolution with each result. Rainfall estimates are not local gauge observations. |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) | Satellite fire detections can substantiate fire-related alerts and help distinguish burn events from other vegetation changes. | Not integrated yet. API access requires a MAP_KEY; report sensor, acquisition time, and detection confidence, and do not treat hotspots as burned-area measurements. |
| [Sentinel-1 SAR](https://dataspace.copernicus.eu/) | Radar observations can support flood and surface-change monitoring when optical imagery is cloud-obscured. | Not integrated in the analysis pipeline. Add a separate, validated SAR methodology and quality/provenance fields; do not relabel optical NDVI outputs as radar results. |

## Reliability and interpretation

- Search can return a point without a usable boundary. In that case the map
  must not draw a guessed country/region polygon; analysis is point-based
  unless a real AOI geometry is available.
- A returned boundary does not guarantee that the selected-area satellite
  statistics have valid observations. Null measurements remain unavailable.
- Public geocoding, map tiles, satellite APIs, and Earth Engine all have
  independent service limits. Configure credentials and quotas, cache stable
  data where licensing permits, and expose provider errors instead of
  presenting success-shaped fallback data.
- Administrative outlines and watershed boundaries have different meanings.
  A basin workflow should use a hydrological dataset such as HydroBASINS, not
  an administrative area or a town's geocoded point.
