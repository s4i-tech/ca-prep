# CA Nov-2026 Exam Portal — offline question bank (P1 / P2 / P3)

A fully static, no-build-runtime study portal for ICAI CA Intermediate **Paper 3 (Financial & Investment Analysis and Business Valuation)**, plus P1/P2 siblings, targeting the **November 2026** attempt. All data is pre-generated into JSON + JS mirrors; GitHub Pages serves `src/` + `data/` with no server.

## What's here

- **`src/`** — TypeScript UI under the `App` namespace (loader, router, home, exam, results, store). Compiled to `dist/` with `npm run build`; Pages workflow (`.github/workflows/pages.yml`) builds automatically.
- **`data/`** — 15 generated question banks + `datasets.json` manifest, one set per paper: `core` (full syllabus), `prediction` (likely-question filter), `mock-1` / `mock-2` (complete 100-mark patterns), `rapid` (100-question sprint). Each `.json` has a byte-matched `window.<jsvar>.js` mirror for `<script>` loading.
- **`tools/`** — the pipeline (below).

## Commands

```bash
npm run datasets         # rebuild data/*.json from tools/build/content banks (deterministic)
npm run mirror           # regenerate data/*.js mirrors + datasets manifest
npm run build            # tsc -p tsconfig.json -> dist/
npm run import           # import, format, and register a new dataset JSON
npm run export-chapters  # export chapter-wise MCQ JSON banks (51 chapters across P1–P3)
node tools/validate-datasets.js    # schema/provenance/wording validation (must be 0 errors)
node tools/e2e-test.js             # mirror==json, ids, scoring keys, subset/mark rules, chapter coverage
node tools/coverage-report.js      # per-chapter MCQ/Desc/HIGH table + THIN flags
```

## Chapter-Wise MCQ Preparation

In addition to full-paper sets (Prediction, Mocks, Core Syllabus, Rapid Revision), students can prepare chapter-by-chapter across all 51 chapters of Papers 1, 2, and 3:

- **Interactive Chapter View**: Available directly from the paper dashboard (`#paper/P1`, `#paper/P2`, `#paper/P3`) under the **"🎯 Chapter-Wise MCQs"** tab.
- **Module Filter & Search**: Quickly filter chapters by Module (Module 1, 2, 3...) or search by chapter title or keywords.
- **Modes**:
  - `⚡ Practice MCQs`: Untimed, instant feedback with explanations, answer rationale, and Memory Anchors.
  - `⏱️ Timed Test`: Exam mode with a timed countdown (1.5 min per question), question palette, mark for review, and full scorecard.
- **Individual Progress**: Progress and completed test scores are tracked per chapter in local storage.

Local preview: serve the repo root (`python3 -m http.server 8090`) and open `src/index.html` path — the app loads `../data/datasets.json`.

## Pipeline

`tools/build/content/pX{a,b,c,...}.js` (curated banks) → `tools/build/content-pX.js` (`assemble()`: generators, dedupe-by-question-text, option rotation) → `tools/build/build-datasets.js` (prediction/mock/rapid selection + manifest, stable ids) → `tools/mirror.js` (js mirrors + `--check`).

Banks are 12-field tuples (`tools/build/lib.js`: `mcqFromEntry` / `descFromEntry` / `caseFromEntry`):

- **MCQ** `[ch, topic, probTier, tags, q, options(pipe|string|array), ansIndex, why, trendCode, probNote, memorable, extra]` — field 12 may be `"link override"`, `1` (HARD), or `{alert, d, m}` for amendments.
- **Desc** `[ch, topic, probTier, tags, q, answer, markingScheme, keyPoints(|separated, ≥3), why, trendCode, memorable, marks]` — exactly 12 fields.

## Content conventions (enforced by the validator — don't fight it)

- Anything dependent on notifications/thresholds (rotation limits, BRSR phasing, ADT-4, tax-audit turnover, SAST triggers…) is framed **"verify the notification in force for the attempt year"** and tagged `amd`; the UI shows an amendment alert.
- `probWhy` must state prediction is pattern-analysis, *not an ICAI statement* (phrase checked by regex).
- No meta wording in student-facing text (`for the exam`, `distractor`, `fix:` …), no self-narration artefacts.
- Case studies: exactly 5 sub-MCQs sharing a stem (`caseRef`), contiguous in datasets.
- Mock paper pattern: 40×1 MCQ (incl. 2 case groups) + 5 descriptive (8 marks) = 100 marks, 180 min.

## Amendment safety policy

ICAI frequently moves numbers (SQCS dates, retention years, limit percentages, BRSR phases). Rule for this bank: **mechanics and concepts are stated as law; numbers only with an explicit verify-current-notification caveat, or omitted.** A wrong remembered number costs more than a caveat.
