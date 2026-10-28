# Paper claim traceability

## Scope limitation

No manuscript file (PDF, DOCX, TeX, or manuscript source) was present in the
repository when this ledger was prepared. The table below records code-backed
claims implied by the requested implementation; it is **not** a complete
sentence-by-sentence audit of the manuscript. Provide the manuscript to map
each exact sentence and identify unsupported claims.

## Code-backed claim candidates

| # | Candidate factual claim | Code path | Constant/helper | Test |
|---|---|---|---|---|
| 1 | Each returned analysis field has a provenance entry identifying whether it is measured, model-generated, geocoded, or unavailable. | `supabase/functions/_shared/satellite-analysis.ts` | `attachFieldProvenance` | `every analysis result field has a provenance entry` |
| 2 | Model-only analysis does not report numeric satellite area, change, spectral indices, temporal breakdown, or predictive modeling. | `supabase/functions/_shared/satellite-analysis.ts` | `normalizeNumericFields` | `model-only analysis always nulls numeric satellite fields` |
| 3 | The statistics request uses Sentinel-2 L2A, a 128×128 grid, and the configured AOI. | `supabase/functions/_shared/sentinel-statistics.ts` | `STATISTICS_GRID_SIZE`, `AOI_HALF_WIDTH_DEGREES` | `Sentinel Hub statistics are parsed from a mocked API response` (checks sensor type and grid; AOI is not asserted) |
| 4 | The Sentinel statistics request applies the 60% cloud limit and masks SCL classes 3, 8, 9, and 10. | `supabase/functions/_shared/sentinel-statistics.ts` | `MAX_CLOUD_COVERAGE_PERCENT`, `EXCLUDED_SCL_CLASSES` | No dedicated assertion for cloud limit or SCL classes |
| 5 | Each before/after statistics window is capped at 90 days and future dates are excluded. | `supabase/functions/_shared/satellite-analysis.ts` | `MAX_ANALYSIS_WINDOW_DAYS` | `analysis windows cap each side at 90 days and exclude future dates` |
| 6 | Change is relative to the baseline except when the baseline magnitude is at or below 0.05, where the difference is expressed in percentage points. | `supabase/functions/_shared/satellite-analysis.ts` | `NEAR_ZERO_NDVI_BASELINE`, `calculateChangePercent` | `change percentage uses relative change except for near-zero baselines` |
| 7 | NDVI severity is derived from absolute change thresholds: low below 3%, medium from 3% to below 8%, high from 8% to below 15%, and critical at 15% or more. | `supabase/functions/_shared/satellite-analysis.ts` | `NDVI_SEVERITY_THRESHOLDS`, `deriveSeverity` | `severity is derived from the exported measured-change thresholds` |
| 8 | Narrative percentages and NDVI/NDWI/NBR decimals are checked within 0.1 percentage points and 0.005 index units. | `supabase/functions/_shared/narrative-guard.ts` | `NARRATIVE_PERCENT_TOLERANCE`, `NARRATIVE_INDEX_TOLERANCE` | `narrative numeric guard accepts measured values and detects mismatches` |
| 9 | Hazard severity is derived from the ratio between the observation and threshold using shared ratio boundaries. | `supabase/functions/_shared/hazard-severity.ts` | `HAZARD_SEVERITY_RATIO_THRESHOLDS` | `hazard severity uses documented ratio boundaries` |
| 10 | Sentinel Hub and Groq request parsing can be exercised without calling the live services. | `supabase/functions/_shared/sentinel-statistics.ts`; `supabase/functions/_shared/groq-client.ts` | Injected `fetcher` | `Sentinel Hub statistics are parsed from a mocked API response`; `Groq chat completion uses an injected mock fetch` |

## Claims requiring more evidence

The repository does not currently contain direct tests for the trend dead-band,
the valid-pixel acceptance threshold, cloud/SCL request settings, native band
resolutions, geocoding accuracy, daily rainfall threshold selection, or the
full narrative retry-and-replacement orchestration. These are implemented in
code, but should not be presented as independently validated results until
their tests are added. No claim about field performance, accuracy, or
real-world environmental outcomes is supported by this code alone.
