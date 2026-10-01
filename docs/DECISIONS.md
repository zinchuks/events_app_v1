# Рішення S0 — 2026-10-01

1. **Mobile: adapt Obytes** із pinned SHA REPO_AUDIT. Є тестований TS/router/i18n/UI baseline, обидва JS exports і Metro smoke; auth demo/IDs не прийняті. S1 adoption gate: dependency drift + critical/high disposition, native smoke. Якщо updates не проходять, рішення переглянути.
2. **Ingestion: Python + selective vendoring community-calendar.** Корисні ICS/recurrence/source headers/retry abstractions перевірені; date-only, stable identity, global geo, arbitrary shell execution потребують заміни. Не переносити UI, city snapshots, personal integrations або workflows із push.
3. **Не використовувати event-discovery як backend**, бо Sheets/Apps Script + collapse occurrences/hash без часу не відповідають MVP. Не зливати його з community-calendar.
4. **Simonstorms не mobile основа:** bundles працюють, але доменний onboarding/analytics/plugins додають демонтаж; відсутній unit-test target, nonstandard tooling license. Новіший SDK сам собою не є readiness proof.
5. **MapLibre умовно S5; Crawlee відкладено.** Peer ranges не доводять native сумісність. Для first source API/ICS не потрібен ще один crawler runtime.
6. **S0 — документи, аудит, licenses, локальний Git.** Product directories, env, locks, CI та starter import належать S1. Native та external checks явно unverified; аудит S0 може бути verified без їх pass згідно плану.

# Рішення S1 — 2026-10-01

- Вибірковий Obytes import замість whole starter: Button/tests/CSS/Metro та конфігураційні patterns; прибрано demos/auth/storage/billing/owner IDs. Це зберігає перевірену основу й attribution без функцій наступних етапів.
- Залишено Expo SDK 54, вирівняно React Native 0.81.5 і SDK-compatible ranges, pinned Node 22.23.3 / pnpm 10.34.6. Expo install check й Doctor pass.
- Сумісні security overrides shell-quote/tar/postcss/image-size та xcode-only uuid; image-size потребував збереженого MIT Metro Buffer patch з real asset regression test. У web dev виявлено цикл Uniwind/RN Web; guard лишає внутрішні barrel exports RN Web оригінальними. Повторний browser startup/toggle pass.
- Audit critical/high = 0; decode-uri-component moderate лишається відкритим. CJS→ESM major override без перевіреної сумісності не застосовано. Потрібен upstream query-string/router upgrade перед release review; high-only CI gate не приховує JSON finding.
- Admin S1 — Vite/TypeScript static shell замість орієнтовного Next.js: немає SSR/API потреби до DB/Auth етапу. Worker — executable stdlib Python CLI, uv dev lock, нуль adapters; legacy dependencies не переносяться наперед.
- CI workflow створено, remote не додано. Native/EAS/device/backend інтеграції unverified; локальні web/code/export checks їх не замінюють. S2 не розпочато.

# Рішення S2 — 2026-10-01

- Docker daemon доступний; використовуємо окремий local Supabase CLI stack, без remote project/deploy. Локальну базу відтворено з migrations/seed двічі, приватність перевірено через реальні Auth/PostgREST roles.
- Створено основні schema entities й RLS для всіх 19 таблиць, але не handlers/UX наступних етапів. Public normalized catalog відділено від raw ingestion payloads та private owner data. Server entitlements/jobs не доступні для client writes.
- Self-delete — обмежений SECURITY DEFINER RPC без user ID аргументу; authenticated caller only. Cascades private data, не public events. Валідація поточного акаунта є server-owned; не пересилаємо service role у mobile.
- Email confirmation/recovery — коди з captured email через verifyOtp; зберігається email/password Auth без залежності від native deep-link verification. External SMTP/staging не підмінено local Mailpit proof.
- Native storage — bounded SecureStore chunks, queue + manifest swap; web localStorage. Unit tests перевіряють Unicode, failed writes та concurrent logout; device/keychain acceptance не заявлено.
- Profiles locale з allowlisted signup metadata, translation locale незалежна; all UI uk/en/es. Imported geo data на S2 не потрібні: explicit original synthetic country/city fixtures, без boundaries і fake live coverage.
- Browser QA виявив світлий текст dark variants на світлому фоні; Uniwind theme явно light. Застарілий async startup result не перезаписує нову auth session після logout/login.
