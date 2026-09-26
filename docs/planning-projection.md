# Planning model seam, not evacuation zones

**Status:** Firepoint has **no WindNinja or ELMFIRE run, time-of-arrival raster, measured clearance time, fire forecast, trigger line or source-backed prediction map**. `src/planning/scenario.ts` is a pure, unconnected validation/comparison contract with synthetic-only tests. It never calls a model, fetches an API, persists a run, draws geometry or issues an instruction. Do not feed its test values to the resident UI.

## What the current map actually draws

The merged homepage draws **red circular placeholder hazards**: a default **simulated** 1.5 km Verdugo fire and 500 m-radius circles around the visitor's private marks. These circles are used by the prototype route-avoidance code. They are **not** an agency fire perimeter, an evacuation order, or a fire-spread forecast. There is **no yellow warning circle** in the current map. The green/orange destination pins are unverified hardcoded shelters/targets, not agency evacuation destinations. See the [source policy](source-policy.md) for the public release boundary. The separate NWS/CAL FIRE/NIFC/AirNow/Glendale GIS source contracts are not connected to these circles; production queries are paused.

**Red = order / yellow = warning only when the issuing agency publishes that status and its applicable zone or polygon.** The app cannot derive an official order/warning from a distance to a fire, three marks, report density, a wind field or a model contour. Agency shapes need original issuer wording/URL, ID, issue/retraction time, verified jurisdiction and geometry vintage. NIFC perimeters mean mapped fire extent **at capture time**, not today's front or an order. Community report-density cells stay visually and contractually unverified.

## A separate conditional planning computation

A future batch pipeline could run the [USFS WindNinja CLI](https://github.com/firelab/windninja) on sourced terrain and HRRR initialization to produce **terrain-adjusted wind**, then a **separate, validated** spread model such as ELMFIRE on cited ignition, fuels/terrain and wind to produce time-of-arrival (TOA) cells. Clearance time would need separately verified households/vehicles/exits/mobilization and a safety margin. None is available in Firepoint today. A WindNinja grid alone says nothing about where fire will travel.

The new `PlanningCellSchema` requires WindNinja and ELMFIRE run/version/configuration/output hashes, matched wind-run IDs, run/valid times, named and dated DEM/wind/fuels/ignition inputs, household/vehicle/exit sources, clearance method, and hindcast/review URLs. `evaluatePlanningCell` compares **modeled** TOA minus clearance and margin only when an actual TOA value and all validation references exist. It returns `unavailable` otherwise. Its three outputs are model-only time comparisons (`modeled-clearance-deficit`, `modeled-within-safety-margin`, `modeled-clearance-margin-available`), **never** “evacuate,” “warning,” a safe area or an all-clear. Every output carries the input provenance and visible caveats: lee-canyon underprediction, dated fuels and ember spotting. This is a *planning projection, not a forecast or evacuation order*.

TOA is a raster surface, not a ring: terrain, wind, fuels and spotting break radial symmetry. If the team later validates a projection layer, map cells/contours must come from the real model output and have an explicit hypothetical-scenario mode with vintage, validation and uncertainty. Do not draw a synthetic red/yellow radius from the formula. A planning deficit may prompt **planner review**, not an automatic resident evacuation instruction. Official alert channels remain the resident action source.

## What still has to be built

1. Select and license the model inputs; run a pinned WindNinja container/CLI and a separate spread model; record full provenance sidecars and immutable output hashes. **No public hosted WindNinja REST API exists.**
2. Validate against historical Santa Ana winds and observed fire perimeters/arrival, including lee-slope error and spotting limits; commission clearance input verification. The contract's validation URLs must refer to real reports, not test fixtures.
3. Design an atomic worker/store/export path for **complete** run generations and source checks (proposed separately in [PR #15](https://github.com/Astrotemporal/firepoint/pull/15); not merged or connected). Never replace last-good with partial output or call an old run current.
4. Have the map/API/frontend owners review distinct symbology and error states, then test real cell-to-map georeferencing, scenario change, stale/absent run and official-geometry separation. No model layer should render in the resident default view before source/agency and release review.

The tests in `src/planning/scenario.test.ts` use conspicuously synthetic values **only inside tests**. They cover the time comparison, missing output/review, cross-run mismatch, invalid units and no order/color/polygon/all-clear fields. Passing those tests says the contract is safe to extend; it does **not** validate a physical wildfire model.
