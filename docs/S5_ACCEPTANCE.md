# S5 acceptance — 2026-10-02

**implemented; browser/local API verified; native acceptance unverified.** Повний S5 не має статусу verified: MVP_PLAN вимагає UX на iOS та Android. Clean security/release gate також blocked. S6–S12 не починалися.

| Критерій S5 | Фактично перевірено | Межа доказу |
| --- | --- | --- |
| Territories → interests → schedule → preview без GPS | Chrome390×844: Madrid/music/30days/EuropeMadrid/daily18:00 → «Мій радар Madrid» → real owner union | Curated territories; disconnected places show no coverage. Preview is configuration, not unsaved matching simulation |
| Feed/search/pagination |95music occurrences across3 rules shown once with names; Quartet search1, impossible query0/clear, page2 different records;69 API +24 SQL assertions | Time-dependent snapshots, first QA catalog881; no global coverage claim |
| Map/clustering | Actual OpenFreeMap Positron tiles, manual pan/zoom; MapLibre6.11.2 clusters on8 synthetic points and point selection; polygon editor3 clicks/offline fallback | Madrid location is NULL; real events cannot have markers. Fixture proves renderer, not real coordinates. Native renderer unverified |
| Detail/source/save | Real Aires Iberoamérica occurrence; original Madrid page opens; saved event remains after navigation/reload | Source structured API lacks price/age/coordinates. HTML may have richer data; enrichment belongs to S6, not inferred in S5 |
| Rules/inbox/settings | Existing S4 edit/pause flows preserved; per-rule owner delivery preferences; saved/inbox pages20/focus reload; settings/profile uk/en/es | Saved/digest history uses existing S3/S4 contracts. No automatic schedule/real push in S5 |
| Empty/loading/error/fallback | Search empty/clear verified UI; API invalid/null/private requests rejected; explicit retry components; offline coordinate editor | Provider outage/real native permission denial not fully exercised. GPS never requested |
| Accessibility | Semantic fields/headings, active web tab aria-selected=true, selected buttons aria-pressed, busy state, tab targets61.5px high; UA/EN/ES browser controls verified | Native VoiceOver/TalkBack, font scale, full keyboard/screen-reader acceptance unverified |
| Deep links | Browser event/digest/rule/map/delivery routes and saved session restore; owner RPC/RLS tests | Universal/App Links, cold launch/background iOS/Android unverified |
| Themes | Light-only design inspected at390×844; compact feed puts first card above the fold | Dark theme not offered |
| iOS/Android UX | Isolated Expo prebuild --no-install all + JS exports succeed | No native compile/install/run: Xcode licence gate, Android SDK/adb absent |

## Реальні перевірки

Logs and machine summary: [results.json](evidence/s5/results.json).

- [pnpm check](evidence/s5/check.log): TypeScript/ESLint/env/secret scan,16Jest +8Node tests pass. Map compatibility test transforms actual patched ESM to classic-script syntax and compares copied worker bytes against pinned package.
- [69 S5 Auth/API/RLS checks](evidence/s5/integration.log); [24 SQL transaction assertions](evidence/s5/database-invariants.log), ROLLBACK. Unicode/literal search, stable pages/counts, duplicate-free owner union, genuine zero coordinates vs NULL, foreign rule protection, invalid preferences atomic rollback, no jobs.
- Regression: [S2 108](evidence/s5/auth-regression.log), [S3 84](evidence/s5/s3-regression.log), [S4 73](evidence/s5/rules-regression.log). Only generated test users cleaned;930real events retained and own S5test users0 in [preservation snapshot](evidence/s5/data-preservation.json). User QA rule/saved event retained intentionally.
- [Exports](evidence/s5/export.log) ios/android/web; [server-key boundary](evidence/s5/client-bundles.log), [admin build](evidence/s5/admin-build.log), [frozen install](evidence/s5/install.log), [Expo deps/Doctor18/18](evidence/s5/dependencies.log), generated types byte-equal local CLI. JS export is not native build.
- [Isolated prebuild](evidence/s5/prebuild.log) and [tooling inventory](evidence/s5/native-tooling.json). Product native directories untouched. Remote CI not run.
- [Browser scenarios](evidence/s5/browser.json), screenshots: [final feed](evidence/s5/feed-mobile-web-v6.jpg), [onboarding](evidence/s5/onboarding-mobile-web.jpg), [final6.x synthetic map](evidence/s5/map-cluster-fixture-v6.jpg), [polygon editor](evidence/s5/polygon-editor-web.jpg). Older polygon/onboarding captures precede6.x map upgrade; final map proof is explicitly namedv6.

## Security and minimal dependency on S7

Temporary MapLibre GL JS5.24.0 solved Metro syntax but has [critical XSS advisory](https://github.com/advisories/GHSA-jrc7-96c5-q579); rejected. Final6.11.2 uses Babel web import-meta transform + explicit same-origin pinned module worker/shared assets, unmodified package bytes/license. OpenFreeMap attribution visible; no user Auth/rule data sent as tile parameters. Noto Sans Regular cluster font matches provider glyphs.

[Full audit snapshot](evidence/s5/dependencies-audit.json): **0critical,1high,1moderate; exit1**. High [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) is Expo CLI dependency1.4.0, no patched npm version at verification; same dependency existed in S4. Existing moderate decode-uri-component remains tracked. CI audit gate not disabled. No clean security/release claim.

Schedule UI persists validated manual/daily/weekdays/interval preferences only: active=false, next_run_at=NULL, zero push jobs/sends. Changing schedule timezone preserves event horizon/areas/filters. Durable jobs, DST, quiet hours/retries are S7; native device push stays blocked under user's browser-only preference. Gmail SMTP not configured; use local email flow/Mailpit, not promised Gmail delivery.

## Manual browser check

1. Open http://localhost:8087 → «Правила» → «Нове правило»; pick Madrid, music, horizon, schedule preferences and review coverage. Save one rule; do not expect automatic delivery yet.
2. In «Події», switch «Мої події / Усі події», search Quartet or an impossible word; clear search and use next page.
3. Open a detail → original source → save → «Збережені»; reload and confirm the save remains.
4. Open «Карта»: basemap works without GPS. Current Madrid source has no coordinates, so expect explanation and no markers. For renderer-only QA use dev /map-preview; points are synthetic.
5. «Налаштування» → language/account/push; switch UA/EN/ES and return UA. Browser message requires physical device for push, not browser delivery.

## Remaining acceptance / next action

Owner reviews/accepts Xcode licence; install Android SDK/JDK/emulator or configure own EAS development builds/signing. Rebuild MapLibre development client (not Expo Go), repeat onboarding/feed/map/saved/source/deep links and VoiceOver/TalkBack on both platforms, record device/OS/build. Security upstream remediation and full native distribution notices review before release. S6 is the next independent stage only with a new task; S5 is not MVP/release-ready.
