# growa — project guide

Thai online-pharmacy + medication-care platform for families (hackathon prototype).
Users find licensed pharmacies, order medicines with a pharmacist gate, manage
regular medication (schedules, refill alerts), care for family members as
caregivers, and run a guided symptom checker. UI text is **Thai**.

## Stack and layout

| Path | What it is |
|---|---|
| `web/` | React 19 + Vite app, hash routing (`#/orders/123`), ordering flow (one step per screen: map → choose → questions → result → consult → checkout) in `web/src/flow`, first-sign-in setup and form sections in `web/src/profile` (profile page `#/profile`), older feature pages in `web/src/pages` (reached from the care hub `#/care`), shared UI in `web/src/components/ui.jsx`, hooks in `web/src/lib` |
| `functions/src/` | All backend logic as `firebase-functions` v2 callables (`orders.js`, `pharmacy.js`, `care.js`, `account.js`, `guided-triage.js`, `triage.js` (optional Claude chat), `places.js`, `directory.js`, `demo.js`), shared helpers in `common.js`, pure modules `schedule.js` / `symptom-engine.js` / `symptom-tree.js` |
| `api/call/[fn].js`, `api/cron/daily.js` | Vercel adapter: runs the same callables via `fn.run()`; only callables are exposed (triggers/schedules return 404) |
| `firestore.rules`, `storage.rules`, `firestore.indexes.json` | Security rules and indexes (deployed to Firebase) |
| `tests/` | `symptom-tree`, `rules`, `storage`, `functions` tests, all run in the Firebase emulators |
| `scripts/` | seed, demo, FDA import, test runner, production seed |
| `docs/` | `firestore-schema.md` (data model), `backend.md`, `deploy.md`, `demo.md`, `flowcharts.md` (Mermaid) |
| `data/pharmacy-directory-bangkok.json` | 3,260 FDA-licensed pharmacies (area-level locations) |

Two runtimes, one codebase:
- **Local demo** (`npm run demo`): Firebase emulators (project `demo-medilink`), web talks to them via `httpsCallable`. Needs `VITE_USE_EMULATOR=true` (the demo script sets it).
- **Production**: Firebase project `secret-e67bc` (Auth + Firestore, Spark plan) + Vercel project `growa` (web + `/api/call/*`). No Firestore triggers on Vercel, so the web calls `afterDoseLog`, `afterMedicationWrite`, `afterCaregiverChange`, `afterRating` after its own writes (all idempotent).

## Commands (run from repo root)

- `npm test`: whole suite in emulators (needs Java 21; scripts add the JDK and the Windows socket workaround via `scripts/emulator-env.mjs`)
- `npm run demo`: emulators + seed + web at http://localhost:5180
- `npm run seed`, `npm run import:fda`, `npm run smoke:live` (needs API keys), `node scripts/seed-production.mjs --yes` (real project, needs `service-account.json`)
- `npm --prefix web run build`: production build check

## Non-negotiable rules (from the product spec)

1. **AI never approves dispensing.** Only `submitPharmacistReview`, by a pharmacist with `licenseVerified`, can approve. The symptom checker and Claude chat are advisory.
2. **No payment before a medicine can be dispensed.** `awaiting_payment` is reachable only after stock confirmed and, for `requiresPharmacistReview` drugs, pharmacist approval. Prices, totals and drug classes come from the database, never the client.
3. **Authorization is server-side** (Security Rules and functions), never just hidden buttons. Platform admins must not be able to read health data.
4. **"Not logged yet" is not "confirmed missed".** No dose log = not logged; `missed` is an explicit user confirmation. Stock numbers are **estimates**, say so in UI.
5. **Label what is not real:** sample stores, products, prices, reviews, payment, delivery are marked "ข้อมูลจำลอง". FDA pharmacy locations are area centres, not store pins.
6. Stock that is not real-time must show its last-updated time and source.
7. Symptom results say "consistent with…", never diagnose, never name doses. Red-flag symptoms stop the flow and show 1669 (1323 for mental health). Clinical content must be reviewed by a pharmacist/physician before real use.
8. Google Places data may not be stored (place IDs only); never scrape Google.

## Demo-only exception to rule 1

`functions/src/demo.js` (`demoPharmacyReview`, `demoPharmacyOrder`) lets one person click through the pharmacist step and the shop's stock/prepare/ship steps (payment and receipt stay with the buyer; drugs needing a pharmacist are never confirmed without an approval). It is off outside the emulator unless `DEMO_SIMULATION=true`, acts only on the caller's own consultation at `sample: true` pharmacies, and is recorded as `pharmacistUid: "demo-simulator"` plus audit `demo.review.simulate`. Never enable it for real pharmacies.

## Gotchas learned the hard way

- Firestore **list queries**: a `get()` on a field the query does not filter on makes the whole rule error. Use separate `allow read` statements (see `orders`, `pharmacistReviews`) and add a rules test for every new list query.
- `firebase-admin` exists in both root and `functions/`: do not mix `Timestamp`/`FieldValue` between the two copies (use `functions/src/common.js` exports inside backend code).
- Dose schedule math (Asia/Bangkok, UTC+7) lives in `functions/src/schedule.js` and is imported by both server and web; change it in one place.
- Firestore security rules: client may not write server-computed fields (`estimatedRemaining`, order status, reviews, notifications, audit logs).

## Installed skills (`.claude/skills/`, local only: `.claude/` is git-ignored)

Picked from https://skills.sh, vetted before install (read every file, no scripts, no hidden characters), copied rather than installed with `npx skills` (no telemetry, nothing executed). Use them when the trigger fits; our web app is a Vite SPA, not Next.js, so skip rules about server components, SSR or `next/*`.

| Skill | Use it when | Source (commit) |
|---|---|---|
| `firebase-security-rules-auditor` | auditing `firestore.rules` / `storage.rules`, before any rules change ships | firebase/agent-skills (92eed24), Apache-2.0 |
| `firestore-rules-creation` | writing or hardening rules. It suggests delegating to a `firestore-rules-author` subagent that does not exist here: follow the skill directly | firebase/agent-skills (92eed24), Apache-2.0 |
| `web-design-guidelines` | reviewing UI for accessibility/UX; rules are pinned in `command.md` (upstream fetched them live on every run, removed) | vercel-labs/agent-skills (063bee9), MIT |
| `vercel-react-best-practices` | React performance review; ignore Next-only rules | vercel-labs/agent-skills (063bee9), MIT |
| `vercel-composition-patterns` | refactoring components with boolean-prop sprawl, compound components | vercel-labs/agent-skills (063bee9), MIT |
| `frontend-design` | visual design polish. growa must feel calm and trustworthy, so use restraint, not "bold" | anthropics/skills (dbd4588), Apache-2.0 |
| `systematic-debugging` | any bug or failing test, before proposing a fix (markdown only; its helper scripts were left out on purpose) | obra/superpowers (2ce8aa1), MIT |
| `verification-before-completion` | before claiming anything works, is fixed or passes | obra/superpowers (2ce8aa1), MIT |

Deliberately **not** installed: `deploy-to-vercel` / `vercel-deploy-claimable` (their scripts tar the whole project folder and upload it to an external endpoint; this folder holds `service-account.json`). Do not add more skills without reading each file first, and never run scripts that ship inside a skill.

## Working agreements

- Repo `azengonlafa-glitch/growa` is **public**. Never commit `service-account.json`, `functions/.secret.local`, `.env*`, API keys. The demo password is public by design; production demo accounts hold sample data only.
- `main` is pushed to GitHub and auto-deploys on Vercel. Do not push or deploy without being asked.
- Run `npm test` before saying work is done; for UI work also check it in a browser. Add tests with every behaviour change.
- Match existing style: ES modules, 2-space indent, Thai user-facing strings, comments only for non-obvious "why".
- Untracked `css/` and `scripts/seed-demo-users.mjs` belong to the user; leave them alone.
