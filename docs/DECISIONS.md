# Рішення S0 — 2026-10-01

1. **Mobile: adapt Obytes** із pinned SHA REPO_AUDIT. Є тестований TS/router/i18n/UI baseline, обидва JS exports і Metro smoke; auth demo/IDs не прийняті. S1 adoption gate: dependency drift + critical/high disposition, native smoke. Якщо updates не проходять, рішення переглянути.
2. **Ingestion: Python + selective vendoring community-calendar.** Корисні ICS/recurrence/source headers/retry abstractions перевірені; date-only, stable identity, global geo, arbitrary shell execution потребують заміни. Не переносити UI, city snapshots, personal integrations або workflows із push.
3. **Не використовувати event-discovery як backend**, бо Sheets/Apps Script + collapse occurrences/hash без часу не відповідають MVP. Не зливати його з community-calendar.
4. **Simonstorms не mobile основа:** bundles працюють, але доменний onboarding/analytics/plugins додають демонтаж; відсутній unit-test target, nonstandard tooling license. Новіший SDK сам собою не є readiness proof.
5. **MapLibre умовно S5; Crawlee відкладено.** Peer ranges не доводять native сумісність. Для first source API/ICS не потрібен ще один crawler runtime.
6. **S0 — документи, аудит, licenses, локальний Git.** Product directories, env, locks, CI та starter import належать S1. Native та external checks явно unverified; аудит S0 може бути verified без їх pass згідно плану.
