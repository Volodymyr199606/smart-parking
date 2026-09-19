# City Curb Interval Measurement Contract V1

Status: offline design and deterministic geometry helpers. No source fetch, database connection, ingest, migration, PostGIS enablement, regulation association, or runtime integration. CITY remains **INCOMPLETE**. This resolves the interval representation/measurement contract sufficiently to describe future schema; it does not make curb storage ready to migrate or establish physical-curb identity.

## 1. Existing proposal and previously undefined choices

Reviewed the curb storage, snapshot/canonicalization, association storage, spatial research and city plan documents, plus the canonicalization and spatial profiler scripts. The existing proposal is `[from_fraction, to_fraction]` against an exact immutable curb version, with the association run binding its target snapshot. Source `globalid` is not the internal UUID and does not prove physical continuity.

Previously undefined: distance/projection frame, segment accumulation, endpoint projection and ties, rounding, zero segments, whole-curb encoding, continuous extent evidence, overlap rules, and cross-engine tolerances. The prior profiler's approximate measurements and reverse-insensitive diagnostic fingerprint do not define authoritative intervals. The helper reuses the existing direction-sensitive geometry digest and canonical serializer, without importing or executing the profiler.

## 2. Chosen model and alternatives

**Model identifier: `sf-curb-planar-um-v1`.** Fractions refer to cumulative segment distance in a fixed SF affine planar frame, with derived coordinates and segment lengths quantized to integer micrometres. BigInt arithmetic defines projection positions, ties and final fraction rounding. This is a local engineering measurement convention, not geodesic distance or survey truth.

| Candidate | Decision |
|---|---|
| Fraction of vertex index | Reject: adding a vertex would redistribute position independently of length |
| Cumulative haversine/spherical distance | Possible future model; would also need a specified spherical nearest-point/interpolation algorithm |
| Ellipsoidal geodesic/geography length | Possible future comparison, but requires pinned ellipsoid, geodesic/interpolation implementations and tie semantics |
| Web Mercator | Not selected; geographic-dependent scale is unnecessary for this SF-only local contract |
| Fixed local planar cumulative distance | Selected: explicit affine transform and elementary segment projection can be reproduced without a GIS engine |
| Metres from start | Useful diagnostic, but not a second authoritative interval encoding |
| Fraction plus metres | Fractions authoritative; metres derivable, with measurement model and source geometry retained |

The frame uses constants derived from the existing profiler's sphere radius 6,371,008.8 m and origin (-122.44, 37.77), but the following **literal binary64 constants and operation order** are normative. Do not recompute trigonometric constants at runtime:

```text
x_m = (longitude - (-122.44)) * 87897.02238670301
y_m = (latitude  - 37.77)     * 111195.08023353292
X_um = floor(x_m * 1000000 + 0.5)
Y_um = floor(y_m * 1000000 + 0.5)
```

Input coordinates are the parsed WGS84 longitude/latitude values accepted by the snapshot contract. No locale/timezone/string collation participates. The micrometre grid is derived measurement data only: source coordinates and their geometry digest remain unchanged. Signed grid half-ties round toward positive infinity. Subsequent distances use exact BigInt products and integer square roots rounded to nearest micrometre, half upward; no floating square root determines interval identity.

Domain: longitude **[-122.6, -122.3]**, latitude **[37.65, 37.85]**. Both line vertices and input points must be within it. Accept only 2D LineStrings with 2..10,000 positions and total model length greater than zero and at most 10,000 m. There is no claim that every live DataSF row has passed these new limits; live profiling is not part of this milestone. Out-of-domain/3D/multipart/nonfinite/malformed input is INVALID, not silently reprojected, split or repaired.

Consecutive positions identical on the derived grid contribute zero length and are skipped for measurement, preserving their original source segment indices and geometry identity. Report skipped indices. A line whose total grid length is zero is invalid. No other vertices are removed or merged, and a coordinate change below grid resolution can leave the measurement unchanged while still changing the source geometry/version digest.

## 3. Approximation and numerical meaning

This is an equirectangular local frame, not a tangent-plane survey solution. Relative to east-west scale on the same sphere, the fixed-latitude scale factor is `cos(37.77°)/cos(latitude)`: about **0.998382** at 37.65° and **1.001084** at 37.85°. Thus this source of local scale variation is within roughly **0.162%** over the declared latitude domain. That is not a total error bound relative to ellipsoidal geodesics or surveyed curbs. Ellipsoid/model differences, source age and positional quality are not calibrated here. Do not reuse the frame globally or declare it survey-grade.

Grid rounding changes each planar coordinate by at most 0.5 micrometre per axis. Quantizing each segment length adds at most 0.5 micrometre relative to that grid segment's Euclidean length. Compared with unquantized affine coordinates, a conservative accumulation allowance is `(sqrt(2) + 0.5) micrometres * segment_count`, separate from floating input-transform error. These tiny numerical bounds are not physical-accuracy claims. The fixed constants and arithmetic order are part of the versioned contract.

All identity-bearing fractions and rational positions are serialized as exact decimal strings. Derived longitude/latitude points and metre displays use binary64 and may differ in their final digits across implementations; they are not hashed as interval identity. A future implementation must reproduce the grid/rounding contract and test boundary cases, not assume a different engine produces identical fractions.

## 4. Direction, cumulative position and interpolation

Fraction 0 is the first source coordinate; fraction 1 is the last. Segment indices refer to original consecutive coordinate pairs, including indices of skipped zero-length segments. Cumulative distance is the sum of individually rounded nonzero segment lengths in source order.

For a fraction, multiply total integer length by the exact fraction, find the first segment whose cumulative end includes that position, and linearly interpolate on its grid endpoints. At an exact internal vertex use the preceding nonzero segment; adjoining segments identify the same cumulative position. At fraction 0/1 return the exact original first/last source coordinate, avoiding a grid-induced change to those endpoint values. Interior interpolation returns the inverse affine transform of the grid point.

Do not normalize reversed source geometry. Reversal maps geometric positions approximately/exactly under this model from `f` to `1-f`, but it changes the geometry digest/version and cannot transfer an association. Added/removed vertices, even collinear or repeated ones, also change version content even if some measurements agree.

## 5. Point projection and ties

For every nonzero segment with grid endpoints `a,b`, grid point `p`, `v=b-a`:

1. Compute exact `d=v·v`, `q=(p-a)·v`; clamp `q` into `[0,d]` to obtain numerator `t_num` of segment parameter `t=t_num/d`.
2. Keep the projected point `a+t*v`; calculate point distance from the exact squared rational distance, rounded to integer micrometres.
3. Cumulative position is the exact rational `segment_start_um + segment_length_um*t_num/d`. Retain its numerator/denominator, projected point, distance, original segment index and clamp flag.
4. Find the smallest rounded distance, retaining **all candidates within 1,000 micrometres (1 mm)** of it. This is a reproducible arithmetic near-tie band, not an estimate of source-location uncertainty or a match-acceptance radius.
5. Coalesce candidates only when their exact rational cumulative positions are equal (cross-multiply to compare). This handles a shared vertex or skipped zero segments. Preserve all corresponding segment indices; a group is unclamped if any equivalent segment projection was unclamped.

One distinct position yields `CLEAR`. More than one yields `AMBIGUOUS`, with every retained position in source segment order. Never choose a different position by segment index, UUID or floating epsilon. Closed-line start/end and self-intersections can have the same XY point at different cumulative positions; they remain ambiguous. Invalid input yields `INVALID` with a reason.

Before-start and after-end projections clamp mechanically and retain their distance/clamp flags. A clear projection can still be far from the curb and is not independently valid association evidence. Future workflows must preserve source uncertainty beyond the 1 mm arithmetic tie rule.

## 6. Building an interval

`intervalFromProjectedBounds` checks that both projections reproduce exactly on the supplied geometry/model and that the reference geometry digest agrees. It needs an explicit, finite, nonnegative run-specific maximum projection distance; no default association radius is supplied.

| Case | Result / requirement |
|---|---|
| Two clear, noncollapsed, unclamped bounds within declared distance; explicit contiguous-extent evidence | `VALID_INTERVAL`, conditional structural measurement only |
| Endpoint projections only; no extent evidence | `AMBIGUOUS` |
| One uncertain/tied bound or multiple distinct projected positions | `AMBIGUOUS` |
| Shorter overlapping regulation geometry | May describe a partial interval only after continuous scope is established |
| Longer regulation with endpoints beyond curb | Clamping is recorded; construction stays `AMBIGUOUS`, not automatically [0,1] |
| Multiple crossings, looping/disconnected source, uncertain overlap | `AMBIGUOUS`; split/review evidence later, no min/max hull of the whole geometry |
| Reversed bound order with established continuous scope | Sort the two bound fractions into increasing target order, record `bounds_reversed=true`; do not reverse source geometry |
| Collapsed position or collapse after fraction quantization | `INVALID` |
| Malformed line/point, mismatched version, altered/stale projection, invalid distance policy | `INVALID` |

Extent evidence kinds are `CONTIGUOUS_BOUNDS`, `BOUNDS_ONLY`, `MULTIPLE_CROSSINGS`, `LOOP_OR_DISCONNECTED`, and `UNCERTAIN`. Only `CONTIGUOUS_BOUNDS` with a nonempty evidence reference permits conditional construction. **The helper does not inspect regulation geometry or prove this classification.** A caller-supplied label is not trusted review; future publication must validate the referenced extent evidence independently. Even `VALID_INTERVAL` does not mean verified curb side, rule applicability, legality or accepted association.

`intervalFromFractions` is the lower-level structural encoder for explicitly reviewed bounds. It validates reference formatting and canonical fractions but cannot resolve a DB version or establish scope. Direct reversed inputs are INVALID; unlike projected bound construction, it never sorts authored fractions. Future trusted tooling must resolve the version, geometry and snapshot membership before using its result.

## 7. Canonical fields and fraction precision

Recommend **`numeric(10,9)`** for each future target fraction and a nine-decimal string in TypeScript/JSON. Internally it is an integer in `[0,1000000000]`. Quantize a positive projected fraction with exact integer division, nearest unit with half upward. Reject intervals whose endpoints collapse after quantization. No epsilon is used to expand a collapsed interval.

Whole curb has exactly **`from_fraction="0.000000000"`, `to_fraction="1.000000000"`**. Do not add a whole-curb flag, null endpoints, reversed encoding or metre-offset alternative. Exponent notation, fewer/more decimal places, negative zero and out-of-range fractions are rejected at the serialization boundary. DB writers must validate before insertion, because a scaled numeric column can round an over-precise input.

Each endpoint moves by at most half a fraction unit: at the model's 10 km cap this is **5 micrometres** of model arclength, far below source association accuracy. Nine decimals express deterministic storage, not surveyed precision. This supersedes the earlier association draft's target `numeric(13,12)` proposal; source-regulation interval measurement is a separate contract and is not changed by this milestone.

`from_m`, `to_m`, `curb_length_m`, unrounded rational positions and projection distances belong to diagnostic evidence and are derived under the recorded model. They are not alternative authoritative interval fields. Recompute rounded-endpoint offsets from the stored fraction and model length; keep original projection offsets separately labelled to avoid presenting them as identical after quantization.

An optional interval evidence digest is implemented using the existing canonical hash helper:

```text
SHA256("city-curb/interval/v1\n" + canonicalJson({
  component_index:0, curb_version_id, geometry_sha256,
  measurement_model:"sf-curb-planar-um-v1", from_fraction, to_fraction
}))
```

The internal UUID is validated in lowercase canonical form; it is never derived from DataSF globalid. The digest identifies an interval reference, not approval, snapshot membership or physical equivalence. The enclosing association/run evidence binds regulation identity, source/target snapshots, review and projection evidence. No separate interval table or required digest column is proposed.

## 8. Multiple intervals, adjacency and stacked rules

One regulation assessment may retain several intervals on one or several versions. `checkIntervalSet` operates within one assessment/release context, preserves every input interval and reports conflicts. It does not union, split, reorder or merge them.

- Same regulation + same version + same bounds is a duplicate. Competing candidate evidence can remain in drafts with an ambiguity marker, but selected/published duplicates are invalid.
- Positive-length overlap for the same regulation/version is a publication conflict. Retain alternatives until reviewed; do not resolve them by silently taking a union. Different source components/clauses do not bypass this target-overlap review.
- Adjacent intervals sharing exactly one endpoint are permitted and remain separate. Overlap checks compare interiors (`a.from < b.to` and `b.from < a.to`); this does not redefine the physical endpoint applicability of rules as half-open.
- Several regulations on the exact same version/interval are valid stacked rules and must not violate target-only uniqueness.
- Different versions remain distinct. The helper cannot infer physical overlap across versions, including duplicate source shapes; cross-version alternatives still require independent review.
- One version UUID claiming different geometry digests is always a conflict, even across different regulations.

`CANDIDATE` conflict results are `AMBIGUOUS`; `PUBLISHED` conflict results are `INVALID`. A conflict-free result is only `VALID_INTERVAL_SET`, not a publication decision. No publication system or database guard is implemented here.

## 9. Version and snapshot safety

Same immutable version reused in a later snapshot preserves its interval coordinates; using it in a new release still requires exact snapshot membership and source/regulation review. Same globalid with changed attributes or geometry means a different content version: do not transfer intervals automatically. Reversal, added/removed vertices, or a similar new globalid never inherit approval. A later equivalence/re-evaluation process may record a new reviewed interval while preserving old history.

Projection objects bind their model, geometry digest and input point. Construction recomputes them, rejecting stale or altered measurements. It cannot prove that a UUID actually resolves to that geometry without trusted storage; the future FK/membership/read boundary must establish that relationship.

## 10. Proposed DB contract (prose only; no new SQL)

| Field | Proposed type / invariant |
|---|---|
| `curb_version_id` | UUID NOT NULL; FK to immutable `city_parking_curb_versions(id)`, restricted deletion |
| `from_fraction`, `to_fraction` | numeric(10,9) NOT NULL; finite, `0 <= from_fraction < to_fraction <= 1`; no defaults |
| `measurement_model` | text NOT NULL; exactly `sf-curb-planar-um-v1` for this contract |
| `component_index` | integer NOT NULL, exactly 0 for this LineString-only model |
| `projection_evidence` | jsonb NOT NULL object validated by a versioned schema; records bounds, all near-tie candidates, rational cumulative positions, distances/clamps, extent evidence reference, distance policy, reversed-bound flag and tool version |

Geometry digest is resolved from the referenced immutable version and repeated in evidence/DTO for validation, not a second independently editable geometry fact. A geometry digest consistency CHECK alone cannot prove FK payload equality. Source regulation identity and run/snapshot identity come through the existing proposed assessment/run chain.

Future guards must reject nonfinite numeric values before range validation, validate exact input scale before DB coercion, require model/component compatibility, and enforce target snapshot membership. Exact selected-link identity includes assessment/regulation context, version, model, component and target bounds; a source component cannot conceal a duplicate selected target interval. Candidate provenance may need multiple evidence records rather than violating identity constraints. Use lock-aware reviewed-set validation for overlap and exact duplicates; there is no unique constraint solely on curb version/interval because stacked rules are allowed. No SQL, index, migration or publication function is created now.

## 11. Future PostGIS comparison

Use an isolated analysis database only after separate authorization; confirm the installed functions/versions then. Preserve the fixture bytes and pinned TypeScript model. First transform each source coordinate with these exact affine constants and micrometre rounding, creating a planar geometry in **these model metre coordinates**, not raw longitude/latitude, Web Mercator or an automatically chosen CRS.

Compare segment lengths and per-segment closest-point candidates. Later `ST_LineLocatePoint` / `ST_LineInterpolatePoint` experiments may check unique projections and interpolated positions on that same frame. Native implementations using unrounded segment lengths are not exactly the quantized cumulative model; either implement the specified rounded accumulation in the comparison harness or use the explicit diagnostic allowances below. Enumerate tied segments separately rather than accepting a native function's single returned location as a tie policy.

- For identical grid coordinates, allow **0.5 micrometre per nonzero segment plus 1 micrometre** when comparing native unrounded total length to this model.
- Compare cumulative positions/interpolated points with an initial computational tolerance of **max(1 mm, nonzero_segment_count * 1 micrometre)**. Compare fractions by converting their difference to distance using total model length; short lines need proportionally larger fractional allowances. This accommodates rounded accumulation without mistaking it for a different physical extent.
- An implementation claiming exact conformance must reproduce canonical fraction strings and tie states on fixtures. Cases within a rounding or tie boundary require exact integer/rational reproduction and explicit review, not silently widening tolerances until results agree.
- Independently compare ellipsoidal/geodesic metrics later to characterize physical scale distortion; those measurements do not overwrite the stored model or establish correctness of source side/extent.

No PostGIS experiment, installation or connection was performed. Cross-engine numerical/physical calibration remains validation work before relying on the metric for association acceptance.

## 12. Implementation, checks and readiness

Pure helpers in `scripts/curb-interval.ts`: `lineLengthMeters`, `lineMeasurement`, `pointAtFraction`, `projectPointOntoLine`, `intervalFromFractions`, `intervalFromProjectedBounds`, `serializeInterval`, `intervalDigest`, and `checkIntervalSet`. No network or import-time work. No dependency, runtime export or matching pipeline added.

```text
pnpm.cmd exec tsx scripts/verify-curb-interval.ts
pnpm.cmd typecheck
git diff --check
git status --short
```

Verification result: **38 offline checks passed**. The fixture suite covers endpoints/midpoints, unequal segments, reversal, nearest projection/clamping, shared vertices, exact/near ties, zero segments, malformed/multipart/domain inputs, precision collapse, conditional extent construction, loops/crossings, stale projections, serialization, separate/adjacent/overlapping intervals, stacked rules and version isolation. Fixtures use synthetic UUIDs only and are never inserted anywhere. `pnpm.cmd typecheck` passed across all workspaces/scripts; `git diff --check` passed. No network, database, PostGIS or ingestion was used for this milestone.

Resolved: direction-sensitive measurement, fraction scale/encoding, endpoint projection/ties, interval construction and multiple-interval rules are now explicit and verified enough to specify the future interval fields. Still blocking curb migration: live snapshot/double-capture validation, operational immutable artifact retention/restore, and database publication/immutability/concurrency guards. Isolated cross-engine and source-position calibration remain prerequisites for accepting measured associations. **Migration is not ready and remains deferred.** No regulation-to-curb association or source identity continuity is verified by this milestone; coverage, legality and runtime remain unchanged.
