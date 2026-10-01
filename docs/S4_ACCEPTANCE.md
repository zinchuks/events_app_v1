# S4 acceptance — 2026-10-01

Overall: **implemented; local PostGIS/API/browser verified; iOS/Android unverified**.
S3 real push remains blocked. S5–S12 not started by this task.

| Requirement | Evidence / actual result |
| --- | --- |
| Multiple countries/regions/cities | 24 curated countries, 19 licensed Spain regions, 5 city identities. Actual API/browser multi-area selection; disconnected areas selectable. Not a complete global catalog. |
| Real admin boundaries | geoBoundaries Spain ADM0/ADM1, pinned bytes/provenance/licence. All19 region geometries PostGIS-valid. Madrid inside/outside and exact actual boundary vertex tested. |
| Radius / polygon points | Map taps, coordinate inputs, zoom/move/undo/editor tested in Chrome390×844. Radius geodesic metres; custom polygon server validation3–100 vertices, no zero area/self-intersection, antimeridian explicitly rejected. Native pointer/render not tested. |
| Inside / boundary / outside | Actual PostGIS rollback test: polygon/radius inclusion on boundary, outside/unknown exclusion. Country geometry point with no territory assignment, admin point on real boundary, hierarchy-only event with unknown coordinates. Synthetic event positions are not live Madrid coordinates. |
| Owner CRUD / pause | Actual Auth/API: create/update RPC, pause/resume, own delete + area cascade, old digest survives; owner-only reads, cross-owner RPC/update denied/no change. RLS prohibits direct S4 settings/area bypass. |
| OR / AND / overlaps | Countries OR/categories OR/area OR, filter groups AND. Actual live union of two music rules has89occurrences and one card per occurrence with both rule IDs. SQL and API verify union/digest dedup. |
| Budget / currency | Explicit currency required for active budget. EUR never compares USD; unknown allowed/excluded. Known-value tests use transaction fixtures; real source prices unknown. No FX conversion. |
| Event language / age | Independent from UI and translation preferences. Language exact validated code OR, unknown allow/exclude; age intervals overlap, incomplete provider range unknown. Known-value proof synthetic; live values unknown. |
| Dates / timezone / unknown time | Inclusive range or rolling1–366 days, valid IANA. Date-only retained; known UTC converted to rule-local date (UTC vs America/Los_Angeles boundary tested); undated/past excluded. Scheduling/DST delivery belongs S7. |
| Manual union persistence | Atomic, idempotent/concurrent-safe digest+items, one DB snapshot for membership/fingerprint/freshness. Max5000, client pages1000. Source stale >48h blocks build. No S4 push/schedule job created. |
| Browser and languages | Actual account/session/restored settings, two persistent example rules, pause/resume via final RPC, repeated digest same URL, invalid polygon message, unavailable private digest state, uk/en/es. Clean final tab0console errors, responsive390×844 screenshots. |
| Native / external integration | Unverified: iOS Xcode licence gate, Android SDK absent, own EAS/signing/device setup absent. Native SVG/touch and actual development push need device proof. No tiles/geocoder/full MapLibre configured. |

Checks: **73 actual API**, **49 SQL assertions**, **108 S2** + **84 S3** regressions,
**14 Jest +7Node** checks, TypeScript/lint/env/secrets, admin build, all three JS
exports, generated types vs DB, 56-file client server-key scan, frozen install,
Expo dependency check and Doctor18/18. Audit0high/critical,1existing moderate.
Full `pnpm audit --json` exits1 and is preserved; not reported as clean.
CI includes deterministic SQL checks; remote execution unverified.

SQL probes are transaction-only and roll back; API fixture accounts are random
`s4-*@example.test` and cleaned. Existing user/data/remote preserved; no DB reset,
no Git push. Known-value fixture proof is separate from live imported-data proof.

[Results](evidence/s4/results.json), [API log](evidence/s4/integration.log),
[SQL log](evidence/s4/spatial-filters.log), [boundary hashes](evidence/s4/boundaries.json),
[mobile list](evidence/s4/matches-mobile-web.png), [manual selection](evidence/s4/digest-mobile-web.png).

Minimal deviations: S4 needs a coordinate map editor and manual union persistence;
implemented these dependencies without S5 full map UX or S7 scheduler/push. Legacy
S3 quick selection remains separate. Technical local resource caps are not paid
entitlements; Free/Plus server limits remain S9.
