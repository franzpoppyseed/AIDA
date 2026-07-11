# AIDA / 間 — Functional V3

A fully interactive **offline, single-user learning application** built on the bundled Japanese and Cantonese data pools.

## What is functional
- Dynamic Japanese ↔ Cantonese lesson generation from the real bundled grammar and vocabulary datasets
- Semantic pairing by overlap in English meanings
- Configurable lesson focus, JLPT level, session size, and common-Cantonese preference
- Active-recall quizzes
- Confidence ratings and a working local spaced-repetition scheduler
- Review queue with due dates and mastery scores
- Persistent XP, streak, weekly activity, progress, profile settings, and quiz accuracy via `localStorage`
- Browser speech synthesis for Japanese and Cantonese when a compatible voice is installed
- Usage Lab that actually scans the local source pools for grammar and vocabulary matches, infers register signals, and suggests cross-language meaning bridges
- Searchable source library across all four separate data files
- Progress export/import as JSON

## Honest scope
This version is fully functional as a **local browser app**. It does not include a cloud backend, multi-device sync, server accounts, human/native-speaker review, or an external AI/corpus API. The Usage Lab is a deterministic local analyzer grounded in the bundled source data; it does not claim to be a perfect native-speaker judge.

## Run
For best browser compatibility, serve the folder locally:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/AIDA_FUNCTIONAL_V3/` if serving from the parent directory, or `http://localhost:8000/` if running the command inside this folder.

Opening `index.html` directly also works in most modern browsers.
