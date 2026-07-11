# AIDA / 間 — Functional V3, Minimal UI Revision

A fully interactive **offline, single-user Japanese × Cantonese learning application** built on the bundled grammar and vocabulary data pools.

## What is functional

- Dynamic Japanese ↔ Cantonese study-session generation from the bundled grammar and vocabulary datasets
- Semantic pairing based on overlap in English meanings
- Configurable lesson focus, JLPT level, session size, and high-frequency Cantonese preference
- Active-recall multiple-choice checks
- Confidence ratings and a local spaced-repetition scheduler
- Review queue with due dates and mastery scores
- Persistent XP, streak, weekly activity, progress, profile settings, and quiz accuracy via `localStorage`
- Browser speech synthesis for Japanese and Cantonese when a compatible system voice is available
- Usage Lab that scans the local source pools for grammar and vocabulary matches, estimates register signals, and suggests cross-language meaning bridges
- Searchable source library across all four separate data files
- Progress export/import as JSON

## Minimal UI revision

The interface was reduced to the tools that actually work:

1. **Study** — generate and complete parallel Japanese/Cantonese sessions
2. **Review** — review due or weak items with spaced repetition
3. **Usage Lab** — inspect a sentence against the bundled local data
4. **Source Library** — search all grammar and vocabulary pools
5. **Progress** — view mastery, XP, learned items, review count, and quiz accuracy
6. **Profile / backup** — save local preferences and export/import progress

Decorative marketing sections, the nonfunctional culture preview, stock artwork, and misleading “native-level verification” language were removed from the visible UI.

## Important scope

This is a **local browser application**. It does not include a cloud backend, accounts, multi-device sync, external AI inference, live corpus search, or human/native-speaker review.

The Usage Lab is a deterministic heuristic analyzer grounded in the bundled data. Its scores indicate **evidence found in the local datasets**, not a guarantee that a sentence is perfectly natural or correct.

Japanese ↔ Cantonese study pairs are **semantic bridges**, not guaranteed one-to-one translations.

## Run locally

From inside this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Opening `index.html` directly also works in most modern browsers.

## Project structure

```text
AIDA_FUNCTIONAL_V3/
├── index.html
├── styles.css
├── app.js
├── assets/
├── data/
├── exports/
├── FUNCTIONALITY.md
└── README.md
```

The old SVG assets are still included so the ZIP remains a complete copy of the project, even though the minimalist interface no longer uses them.
