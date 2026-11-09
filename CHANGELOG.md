# AAKAAR Changelog

All notable changes are documented here. Dates are ISO 8601 (YYYY-MM-DD).

---

## [v3.4.0] — 2026-11-08 — Release-quality pass

### Changed
- **Product coherence.** Every stage opens with the same job header (type of work, customer ग्राहक, maker कारीगर), a progress bar, and one SO FAR / NEXT strip with a single primary action. Repeated generic instruction blocks removed.
- **KAAM REGISTER** home: each job shows type, customer and maker, stage, outstanding decision, next step, last updated.
- **Naya kaam**: separate customer statement, maker statement and notes; each can be spoken. Original transcripts are kept, edits are saved as marked corrections.
- **SAUDA** is a comparison ledger: comparable items, missing prices, exclusions, like-for-like total. No automatic winner. Narrower item column and a swipe hint on phones.
- **SAMAJH / BAAT KA FARQ** redesigned as a ledger page with BAAT, FARQ, ASAR, SOURCE, AGLA SAWAL, JAWAB, STATUS. Recorded words, model reading, unresolved and person-clarified are shown separately. An answer is not a clarification; a clarified answer enters VAADA only as a proposed field.
- **VAADA / KAAM-NAKSHA**: origin, value kind, per-role confirmation, version history. Versions count content changes only; confirming never bumps.
- **KYA HUA?**: findings not verdicts; "cannot be compared" is a separate state (INR 4,400 vs "yes" is not a difference); duplicate-report warning.
- Visual identity "the contemporary Indian work folio": new palette, Mukta + Yatra One + IBM Plex Mono, ledger rules, registration marks, jali and Ajrakh-style rules. Muted and ochre text darkened to meet contrast.
- Bilingual terms centralised in `lib/utils/terms.ts`.

### Fixed
- A "yes" against an agreed price was counted as a difference in the register and next-step text although the comparison view called it incomparable.
- `.gitignore` excluded `.env.example`; it is now tracked.
- Gujarati language label in `lib/gnani/client.ts` contained a wrong character.
- Zod updated to 4.6.7 (memory-exhaustion advisory). `npm audit --omit=dev` reports 0.

### Removed
- Unused `framer-motion` dependency and the unused `StageGuide` component.
- Google Fonts `@import`. Fonts are now bundled through Fontsource, so no font CDN is contacted.

### Added
- Tests: `release-coherence`, `values`, `workflow`, `newJob`, `provider-errors`; live-model cases A to D (skipped unless `EVAL_LIVE=1`). 193 pass, 7 skipped.
- README with real screenshots and a walkthrough GIF; `docs/GITHUB_REPO_KIT.md`; `docs/social-preview.png`.

---

## [v3.3.0] — 2026-10-26

### Added

**Core acceptance-case tests** (`__tests__/core-cases.test.ts` — 16 new tests):
- **Case A (true mismatch)**: Demo provider correctly flags `material_finish` ambiguity when customer says "walnut finish" and maker quotes laminate; verifies sourceIds are present and clarificationQuestion is non-empty.
- **Case B (no mismatch / dedup)**: Resolved ambiguities cannot be re-created by re-analysis; merge logic blocks both duplicate and re-addition of any fieldKey already in `existingFieldKeys`.
- **Case C (ambiguity — not proven mismatch)**: Demo summary and ambiguity fields must not assert customer intent as fact; clarification question must be neutral and not leading.
- Resolve-flow contract: analysis result alone cannot mark a gap as resolved; `resolved: true` requires an explicit human action setting `resolvedAt`, `resolvedBy`, and `resolutionNote`.
- Revision history immutability: previous revision not deleted when a new one is added; `previousValue ≠ newValue`.
- Provider truthfulness: `providerUsed` must be `"demo"`, never empty, `"live"`, `"gpt"`, or `"openai"`.

**Wider desktop layouts**:
- `app/page.tsx` rewritten to `max-w-6xl` two-column grid (`lg:grid-cols-[1fr_1.6fr]`); hero identity + demo card on left, job list + new job form on right.
- `app/job/[id]/page.tsx` widened to `max-w-5xl`; tabs show Hindi label alongside English on `sm+`; status dots replace badge pills.

**BAAT KA FARQ resolve flow** (`components/modules/SamajhModule.tsx` fully rewritten):
- Two-stage clarification: textarea for resolution note + explicit "Mark resolved" button; prompts user if textarea is empty.
- Resolved cards show green footer with `resolutionNote`.
- "Dono haan bol rahe the. Par dono ki samajh alag thi." story hook for demo jobs with ambiguities.
- Provider badge explicitly labels synthetic demo when `lastProviderUsed === "demo"`.
- "A model suggestion is not a confirmation" disclaimer always visible.
- TTS "सुनो / Listen" wired to `/api/gnani/speak`.

### Fixed

**CSS `@import` order** (`app/globals.css`): Google Fonts `@import url(...)` now precedes `@import "tailwindcss"` as required by the CSS spec, eliminating the build warning about `@import rules must precede all other rules`.

**Demo epistemic language** (`lib/data/demo-scenario.ts`, `lib/ai/providers/demo.ts`):
- `amb_finish.interpretationA` no longer asserts "customer imagines real walnut wood"; replaced with balanced two-reading presentation.
- Demo provider `interpretationA` for `material_finish` similarly rewritten to present alternatives rather than assert intent.

**Unused variable** (`__tests__/core-cases.test.ts`): removed `const job = makeMinimalJob()` that was declared but never referenced, clearing the ESLint `@typescript-eslint/no-unused-vars` warning.

### Verification (2026-10-26)

```
npm test     → 89/89 passed, 5 suites
npm run lint → 0 errors, 0 warnings
npm run build → clean (no CSS warnings, no TypeScript errors)
```

⚠️ **Note:** Next.js 16.4.0 triggers a security advisory at build time. The build succeeds after the retry. See upgrade recommendation below.

---

## [v3.2.0] — 2026-10-22

### Summary

Surgical repair pass addressing five specific issues found in the v3.1 audit.

### Fixed

1. **Orphan source ID guard** (`app/api/reason/route.ts`): Zod validation now rejects any `sourceId` in analysis output that does not appear in `job.sources`; unknown IDs are stripped before the result reaches the UI.

2. **Deduplication via `normalizeFieldKey`** (`app/job/[id]/page.tsx`): Re-analysis no longer creates duplicate ambiguity cards. The merge uses `normalizeFieldKey` on both existing and incoming `fieldKey`s; resolved ambiguities are also excluded from re-insertion.

3. **`maker` party in TTS requests** (`app/api/gnani/speak/route.ts`): Requests where the source is `party: "maker"` now correctly pass `speaker: "maker"` to the Gnani TTS endpoint rather than defaulting to `"customer"`.

4. **Zod schema tightened** (`lib/ai/schemas.ts`): `materialImpact` is now validated as a union of `"high" | "medium" | "low"` rather than a freeform string; unknown values are rejected.

5. **Browser TTS not labelled "Prisma"** (`components/modules/SamajhModule.tsx`): The TTS preview button label no longer claims Gnani Prisma when falling back to the browser's `SpeechSynthesis` API.

### Added

- **v3.2 regression suite** (`__tests__/v32-regression.test.ts`): 23 tests covering all five fixes plus provider adapter contracts, `TranscriptionSource` shape, and demo epistemic language.
- `BAAT_KA_FARQ_EVALUATION.md`: Product evaluation rubric for the SAMAJH module.

---

## [v3.1.0] — 2026-10-18

### Summary

PostCSS / Tailwind v4 pipeline repair + Gnani API wiring.

### Fixed

- `postcss.config.mjs` created with `@tailwindcss/postcss` plugin; `@tailwindcss/postcss` installed. CSS pipeline now processes correctly.
- `@import "tailwindcss"` + `@theme` directive confirmed in `globals.css`.

### Added

- Gnani Prisma v2.5 STT proxy at `/api/gnani/transcribe`.
- Gnani Timbre v3.0 TTS proxy at `/api/gnani/speak`.
- `VoiceRecorder.tsx`: WAV PCM conversion via `AudioContext`, Gnani vs browser mode selector, explicit consent prompt, 60-second cap.
- `.env.example` documenting all server-side environment variables.

---

## [v3.0.0] — 2026-10-10

### Summary

Initial complete application scaffold.

### Added

- Four modules: SAUDA (quote comparison), BAAT KA FARQ / SAMAJH (mismatch detection), VAADA / KAAM-NAKSHA (spec confirmation), KYA HUA? (outcome vs spec).
- Provider adapter: `REASONING_PROVIDER` env var routes to `demo`, `openai-compatible`, or `evon-local`; unknown values fail loudly.
- Demo wardrobe scenario: fully deterministic, no API keys, synthetic data clearly labelled.
- Deterministic arithmetic in `lib/spec/calculations.ts` — AI never touches numbers.
- Revision history with integrity checks in `lib/spec/diff.ts`.
- LocalStorage repository adapter.
- Design system: Contemporary Indian Editorial / Tactile Workshop palette.
- Initial test suites: `calculations.test.ts`, `diff.test.ts`.