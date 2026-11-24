# Ghana vegetation-change pilot: requirements register

**Status:** Draft for partner review; not an approved scientific protocol.

**Maturity:** Research-only. No operational alerting, public warning, or
life-safety use.

**Partner:** The user identified the University College of Water Science and
Engineering, Ghana as a confirmed partner. This repository review cannot
independently verify the relationship or any institutional approval.

**Working scope agreed with the user, pending partner/scientific approval:**
research-only forest-area NDVI greenness change, not forest-cover-loss mapping.
The Atewa Range Forest Reserve is a candidate AOI only; its authoritative
boundary and partner access must be confirmed. The proposed period is 2000
through the latest complete year with usable imagery, using season-matched
endpoint windows rather than claiming an annual time series.

## Pilot intent

Evaluate whether GeoPulse can report measured NDVI greenness indicators and
endpoint changes within a bounded Ghana forest area, with explicit
measurement provenance, valid-data coverage, and limitations. NDVI greenness
is a vegetation indicator; it is not itself forest cover, forest loss, or
ecological condition.

The user selected forest-area greenness change as the working target. The
partner and scientific reviewer must approve it and the exact comparison
windows. Forest-cover loss, land-cover conversion, causal explanations,
drought diagnoses, validated forecasts, fire/burn severity, and official
warnings are outside this pilot.

## Candidate outputs to review

| Output | Current implementation | Pilot decision |
|---|---|---|
| NDVI mean/min/max | Calculated from Sentinel-2 or Landsat surface-reflectance bands. | Core working indicator for the selected greenness target; domain reviewer must approve its interpretation and aggregation. |
| NDVI before/after change | Relative percent except near-zero baseline (absolute percentage-point change). | Candidate endpoint comparison; approve matched-season windows, baseline handling, and display units before validation. |
| NDWI / NBR | Green/NIR NDWI and NIR/SWIR2 NBR. | Optional exploratory outputs; exclude from primary acceptance unless independently scoped and validated. |
| Valid-pixel coverage | Provider-derived ratio after masks. | Required quality/provenance field; agree minimum usable coverage by pilot conditions. |
| Trend and 6/12-month projections | Disabled; current responses retain measured temporal samples only and return no projection or R²-derived confidence. | Exclude from pilot outputs unless the partner scopes a separate time-series validation study. |
| Severity category | Fixed absolute NDVI-change bands. | Exclude from scientific conclusions unless partner approves and validates the category thresholds. |
| AI narrative | Groq-generated prose with numeric-claim checks. | Optional explanation only; never use as a measurement or source of scientific conclusions. |

## Provisional system settings to evaluate

These are current code settings, not partner-approved scientific requirements:

- AOI: selected polygon if supplied; otherwise a point-centered
  ±0.05-degree box.
- Statistics grid: 128 × 128.
- Sentinel-2 scene-level cloud limit: 60%; SCL classes 3, 8, 9, and 10
  excluded. Snow/ice class 11 is not excluded by the current list.
- Before/after windows: for long study periods, use up to 90 days at each
  endpoint; for shorter periods, split around the midpoint. For this pilot,
  select season-matched endpoint windows; the current implementation's
  limited interior samples do not constitute an annual time series.
- Minimum valid-pixel ratio: strictly greater than 10% in both periods.
- NDVI near-zero baseline boundary: absolute baseline 0.05.
- Historical data: Landsat Collection 2 Level-2 via Earth Engine for analysis
  periods that start before Sentinel-2 support.

The partner and scientific reviewer must decide whether to retain or change
each value based on the vegetation target, cloud regime, seasonality, AOI
size, and reference-data support. A setting being configurable or tested in
code does not make it scientifically validated.

## Required provenance for every result

At minimum, a pilot result and any export must retain:

- Selected AOI geometry, CRS, coordinate source, and area/extent
- Product/provider, sensor/mission, processing level, collection/version,
  acquisition or compositing period, and query interval
- Index formula/bands, reflectance scaling, cloud/quality masks, aggregation
  grid and effective spatial support
- Before/after and interior sample dates, valid and masked pixel counts/ratio,
  and explicit unavailable/error reason
- Change formula, baseline value, output unit, parameter/config version, and
  code version
- Whether each field is measured, model-generated, geocoded, or unavailable
- Reference-data identity and validation result when an accuracy claim is
  made

## Validation protocol to agree with the partner

1. **Define the target:** specify vegetation property/change class,
   decision/user, minimum mapping unit, spatial unit, study period, and what
   counts as a meaningful change. Do not equate greenness change with land
   conversion or ecological degradation without evidence.
2. **Select the AOI and sampling frame:** document representativeness of
   landscape, land-cover, season, terrain, and cloud conditions. Define
   independent spatial units and any exclusions before examining performance.
3. **Choose reference evidence:** first inventory partner field
   observations/plots and independently interpreted higher-resolution
   imagery matched to the selected dates and spatial support. Record
   uncertainty, licensing, observer protocol, and access. A Landsat-derived
   forest-change product may be a secondary comparison, but is not independent
   ground truth for Landsat-based GeoPulse results. No reference dataset is
   currently identified.
4. **Freeze analysis choices:** approve windows, baseline, cloud/mask policy,
   minimum coverage, sensor handling, units, and preprocessing before scoring
   the held-out sample.
5. **Evaluate against the target:** for a continuous reference, report bias,
   MAE, RMSE, agreement, uncertainty, and sample counts by relevant
   landscape/season/sensor strata. Class-wise confusion metrics apply only if
   a categorical change map is implemented. Avoid random pixel splits that
   leak neighboring spatial data.
6. **Approve acceptance limits:** the partner and independent scientific
   reviewer define numeric pass limits before evaluation. No such limits are
   set in this draft.
7. **Publish limitations:** report data gaps, cloud effects, boundary
   conditions, sensor transitions, reference uncertainty, and populations or
   landscapes not represented.

## Open decisions — required before the protocol is frozen

- Partner-approved bounded Ghana AOI and why it represents the intended
  pilot use; confirm or replace Atewa Range and obtain its authoritative
  boundary
- Partner approval of the selected NDVI greenness target and end-user
  research question
- Exact, season-matched endpoint windows from 2000 through the latest
  complete year with usable imagery
- Reference dataset and local sampling/interpretation protocol
- Spatial unit and minimum meaningful change
- Whether NDWI/NBR are in scope; whether trends/severity are excluded
- Acceptable missing-data/valid-pixel threshold and unit conventions
- Validation split, metrics, sample size rationale, and numeric pass criteria
- Named scientific approver and partner contact for sign-off

## Release gate

The pilot remains exploratory until the open decisions are resolved, the
validation protocol and numeric acceptance limits are approved, and held-out
results meet them. Passing this vegetation-change gate does not validate
drought, flood, other countries, other sensors, public warnings, or
life-safety use.
