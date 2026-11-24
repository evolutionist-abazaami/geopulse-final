# GeoPulse requirements and delivery roadmap

## Purpose and destination

This roadmap moves GeoPulse from its current prototype to a system that can
support progressively higher-stakes uses:

1. Demonstration and exploration
2. Research and non-operational decision support
3. Operational advisory use with human review
4. Public-safety use only after formal validation, governance, and approval

The eventual ambition includes African regions, vegetation change, drought,
and flood context. This is not a commitment that one model can safely cover
all hazards or all African environments. Each hazard, sensor, and pilot area
must pass its own evidence gate. Until the operational gates are passed,
GeoPulse must not be represented as a validated forecast or life-safety alert
system.

The current system assessment is in
[`SCIENTIFIC_METHODS_AND_SYSTEM_ASSESSMENT.md`](./SCIENTIFIC_METHODS_AND_SYSTEM_ASSESSMENT.md).
The selected pilot's draft requirements register is in
[`GHANA_VEGETATION_CHANGE_PILOT.md`](./GHANA_VEGETATION_CHANGE_PILOT.md).

## Current stage

**Stage:** Prototype / code-based assessment complete; pilot scope selected,
with AOI and validation details still to be agreed.

**Known starting point:** measured Sentinel-2/Landsat index statistics,
simple temporal summaries and regression, configurable weather thresholds,
AI-generated narrative, map context layers, GIS display/import/export, and
Supabase-backed application services.

**Selected first pilot:** research-only vegetation-change monitoring in
Ghana. The user identified the University College of Water Science and
Engineering, Ghana as a confirmed partner. The working relationship has not
been independently verified. The bounded AOI, exact user decision, and
independent reference data are not yet confirmed.

**Known release blockers:**

- No approved pilot AOI, first target hazard, stakeholder, or operational
  decision has been selected.
- No stakeholder-approved acceptance thresholds, reference datasets, or
  validation report exist in this repository.
- Classification and pixel-wise change detection are unavailable. A
  classification-controls component exists in source but is not mounted in
  the current UI.
- The weather and alert logic does not establish a validated hazard forecast
  or quantify risk.
- No evidence supports public-safety or life-safety use.

## Working principles

- Keep vegetation change, drought, and flood as separate use cases with
  separate inputs, methods, validation, and operational limits.
- Prefer measured, versioned data with explicit units and timestamps. Clearly
  label model-generated, forecast, reanalysis, context, unavailable, and
  measured outputs.
- A missing/stale/provider-failed measurement must be visibly unavailable; it
  must not be replaced with plausible-looking generated values.
- Do not select numeric accuracy thresholds on behalf of domain authorities.
  Obtain those thresholds from the intended decisions, users, and applicable
  national/regional authorities before validation.
- Do not advance to the next maturity stage because code or tests pass alone.
  Each stage requires scientific, operational, and governance evidence.
- Until the final safety case is approved, show decision-support limitations
  and require a human decision-maker for consequential actions.

## Roadmap and exit gates

### Stage 0 — Define the service and risk envelope

**Status:** In progress. The long-term destination and broad hazard scope are
known; the initial pilot is not selected.

**Work**

- Name the sponsoring organization, intended users, decision to be supported,
  affected communities, and accountable scientific/operational owners.
- Select one initial country/region and one primary use case (for example
  vegetation-change monitoring, drought advisory, or flood context).
- State what GeoPulse must never claim or decide at each maturity level.
- Identify applicable national rules, warning authorities, data policies,
  licensing, privacy, accessibility, and escalation responsibilities.
- Define the data and service boundary: observations versus forecasts,
  required update frequency, spatial unit, latency, outage behavior, and
  human review process.

**Deliverable:** signed product charter and hazard-specific requirements
register, including a named approver.

**Exit gate:** users and domain authorities agree on the pilot use, intended
decisions, risk class, and acceptance criteria. No operational claims before
this gate.

### Stage 1 — Make current behavior honest and reproducible

**Status:** Next engineering stage.

**Preliminary fix completed in parallel with pilot scoping:** file-analysis
confidence is no longer fabricated when absent/invalid, the UI labels any
remaining score as uncalibrated model self-report, and failed analysis is
presented as unavailable rather than complete. The early-warning UI now
identifies Open-Meteo data as provider data rather than GeoPulse field
observations, discloses the lack of an age cutoff, and exposes provider and
ingestion timestamps in alert descriptions. These are scoped corrections,
not completion of Stage 1. Sparse-sample NDVI projections and R²-derived
confidence are also disabled pending independent validation. A maximum-age
cutoff still requires a hazard/metric-specific approved value.

**Work**

- Remove, disable, or explicitly mark classification/change-detection UI
  options as unavailable until a tested implementation exists.
- Ensure all report views and exports preserve per-field provenance, units,
  source/product, timestamp/date range, AOI, processing method, and missing
  data/fallback reason.
- Distinguish Open-Meteo provider products from field observations; expose
  source/provider/ingestion times. Set metric-specific maximum ages with the
  pilot owner before stale data can trigger an operational alert.
- Separate analysis status from narrative status. A generated explanation
  must never make unavailable measurements appear measured.
- Keep projections and R²-derived confidence unavailable unless a future
  time-series validation protocol supports their reintroduction.
- Add contract tests for valid/stale/missing provider responses, invalid
  geometry/date/units, masks, boundary thresholds, and provenance through
  reports/exports.
- Record provider product/collection, model ID, code/config version, query
  window, sensor, AOI/CRS, pixel scale, sample counts, and data timestamps.

**Deliverables:** truthful UI/API schemas, reproducible provenance record,
focused automated tests, and an updated known-limitations statement.

**Exit gate:** a reviewer can trace every displayed/exported numeric value
back to its source and processing; unavailable or stale inputs cannot render
as measured or trigger an apparently current alert.

### Stage 2 — Design the scientific validation protocol

**Work**

- For the selected pilot, document target phenomena, spatial/temporal
  support, units, reference definition, baseline, exclusions, uncertainty,
  and known confounders.
- Choose independent reference data and establish its quality, licensing,
  temporal alignment, and representativeness.
- Pre-register or otherwise freeze evaluation design before tuning:
  independent spatial/temporal holdouts, stratification, sample-size
  rationale, missing-data handling, and comparison baselines.
- Select metrics appropriate to the target. Examples:
  - Continuous index/measurement: bias, MAE/RMSE, agreement by land-cover and
    season, and uncertainty/coverage.
  - Classification (only if implemented): confusion matrix, class-level
    precision/recall/F1, and spatially independent evaluation.
  - Event alerts: probability of detection, false-alarm ratio, critical
    success index, lead time, and calibration where probabilities exist.
- Have local domain experts review the protocol and interpretation.

**Deliverables:** versioned protocol, reference-data inventory, data
management and licensing record, and stakeholder-approved acceptance limits.

**Exit gate:** independent reviewers agree the protocol can test the actual
decision requirement without leakage or proxy-label substitution.

### Stage 3 — Implement one validated hazard workflow at a time

**Vegetation change**

- Define the precise target (greenness, canopy condition, land-cover change,
  or another endpoint); these are not interchangeable.
- Validate cloud/shadow/snow masking, seasonal timing, mixed pixels,
  saturation, AOI aggregation, and sensor transitions.
- Harmonize sensors where necessary; evaluate the chosen index against an
  appropriate reference. Keep NBR and burn-severity claims distinct unless
  a validated dNBR workflow is added.

**Drought**

- Define drought type and impact of interest (meteorological, agricultural,
  hydrological, or socioeconomic).
- Do not infer drought from NDVI or a single rain reading alone. Select
  suitable long-term precipitation and, where needed, temperature/evaporative
  demand data; specify accumulation periods, climatology baseline, and
  regional calibration.
- Validate against independent drought/impact references and evaluate
  seasonality, persistence, and false alarms.

**Flood**

- Keep precipitation context separate from inundation detection and flood
  impact. Rainfall threshold alone is not a flood model.
- Define whether the target is rainfall trigger, surface-water extent,
  riverine flood, flash flood, or exposure/impact.
- Use appropriately validated observations/products for that target (for
  example radar imagery for cloud-obscured extent, elevation/hydrography and
  discharge context where relevant), with explicit limits and acquisition
  times.
- Validate against independent event footprints/records and assess latency,
  missed events, and false alarms.

**Deliverable for each workflow:** versioned method, provenance schema,
training/calibration data record if applicable, automated tests, independent
validation report, uncertainty and limitations, and operations instructions.

**Exit gate:** the hazard-specific acceptance criteria from Stage 2 are met
on held-out data and approved by the designated domain owner. A result for
one hazard does not qualify another.

### Stage 4 — Research release

**Work**

- Freeze data, model, method, and configuration versions for each published
  result.
- Provide reproducible analysis exports and an audit trail; label exploratory
  outputs and unsupported regions clearly.
- Run sensitivity analyses and document performance by region, season,
  sensor, and relevant population/ecosystem group.
- Publish limitations, known failure conditions, and correction/versioning
  policy.

**Exit gate:** an independent reviewer can reproduce key results and agrees
that claims in the UI, reports, and publications are supported by evidence.

### Stage 5 — Limited operational advisory pilot

**Work**

- Deploy only the Stage-3-qualified workflow to a bounded AOI and named users.
- Establish freshness/availability checks, provider quota management,
  monitoring, incident response, backups, audit retention, access control,
  and tested degraded-mode behavior.
- Establish alert ownership, review/approval, escalation, correction,
  acknowledgement, and recipient feedback processes.
- Measure operational performance (latency, data freshness, outages,
  unreviewed alerts, false alarms, missed events) alongside scientific
  performance.
- Communicate that advisories are not authoritative warnings unless formally
  approved by the relevant authority.

**Exit gate:** operations and domain owners sign off the pilot evidence,
support process, and authority relationship. Expansion requires a new
regional/data validation; success in one location does not generalize to a
continent.

### Stage 6 — Public-safety qualification and controlled expansion

**Work**

- Obtain formal approval from competent national/regional authorities and
  complete any applicable legal, procurement, safety, and data-protection
  assessments.
- Produce a documented safety case: hazards, failure modes, mitigations,
  human factors, fail-safe state, fallback communication channels,
  cybersecurity/privacy controls, and independent assurance.
- Demonstrate end-to-end reliability, redundancy, alert delivery and
  acknowledgement, recovery, auditability, change control, and periodic
  revalidation under realistic conditions.
- Roll out one approved geography and hazard at a time, retaining rollback
  and a clear separation between GeoPulse analysis and official warnings.

**Exit gate:** written authority approval, completed independent assurance,
and evidence meeting the agreed safety and performance criteria. Until then,
no life-safety claims or autonomous public warnings.

## Recommended standards and governance review

The exact applicable rules depend on deployment country, operator, data, and
consequence of use. Have the responsible authorities select and interpret
requirements; citing a standard does not itself establish compliance. As
candidate references for expert review, consider:

- ISO 31000 for organizational risk-management principles.
- ISO 19157-1 for geographic data quality reporting.
- ISO 19115-1 for geographic metadata.
- Relevant WMO guidance and national meteorological/hydrological procedures
  for the selected drought/flood product and warning workflow.
- Applicable national disaster-management, privacy, accessibility, public
  procurement, and critical-infrastructure requirements.

## Immediate sequence from the current stage

1. **Complete pilot definition:** confirm the bounded Ghana AOI, local
   reviewer/partner, reference dataset, and decision/user group. The first
   workflow is vegetation change and the pilot is research-only. Broad target
   scope remains the eventual destination.
2. **Build the acceptance register:** record units, source/product, temporal
   freshness, spatial support, reference data, error/alert metrics, and
   expert approver for every required output. Leave numeric limits pending
   expert approval rather than inventing them.
3. **Implement Stage 1 only:** make the current UI/results truthful and
   reproducible; do not begin speculative hazard-model expansion before the
   first pilot requirements and validation protocol are agreed.
4. **Review the Stage-1 diff and test evidence**, then proceed to the chosen
   pilot's validation design.

## Decisions still needed to start the pilot

- First pilot country/region or bounded AOI
- First primary workflow: vegetation change, drought, or flood
- Named user/decision and operational versus research-only status
- Local scientific/authority reviewer and reference dataset access
- Any required legal/regulatory or customer standard
