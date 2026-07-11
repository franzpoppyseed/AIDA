# AIDA / 間 — Functional V4 Separate-Track Revision

A local-first Japanese and Cantonese learning application built on the bundled grammar and vocabulary data pools.

## Core model

Japanese and Cantonese live in the same website but are learned as **separate tracks**.

Each language now has its own:

- target level
- XP total
- daily goal
- study activity
- study sessions
- quiz accuracy
- SRS history and mastery

There is no parallel Japanese/Cantonese lesson generator and no paired-language grading.

## What is functional

### Study

- Choose Japanese or Cantonese before starting a session.
- Choose grammar, vocabulary, or a mixed session.
- Choose any session length from 1 to 100 items.
- New items are preferred before previously learned items.
- Japanese target scopes are cumulative:
  - N5 → N5
  - N4 → N5 + N4
  - N3 → N5 + N4 + N3
  - N2 → N5 through N2
  - N1 → N5 through N1
- Cantonese grammar scopes are cumulative:
  - Beginner → Beginner
  - Intermediate → Beginner + Intermediate
  - Advanced → all three levels
- The bundled Cantonese vocabulary file has no native level field, so the app uses transparent frequency bands:
  - Beginner → frequency ranks 1–3,000
  - Intermediate → ranks 1–12,000
  - Advanced → the full vocabulary pool

### Learner-friendly grammar display

Raw source placeholders such as `A`, `B`, `ADJ`, `NOUN`, `VERB`, and `PLACE` are converted in the interface to readable labels such as:

- `[person / thing]`
- `[identity / category]`
- `[adjective]`
- `[noun]`
- `[verb]`
- `[place]`

Grammar cards also explain what those labels mean when a template contains placeholders.

### Audio

- Japanese vocabulary pronunciation uses the stored kana reading when available, keeping the spoken form tied to the exact displayed vocabulary item.
- Cantonese pronunciation requests a Cantonese/Hong Kong browser speech voice in this order: `yue-HK`, other `yue` voices, then `zh-HK`.
- Grammar templates strip abstract placeholders before speech so the browser does not read placeholder letters aloud.
- Audio availability depends on the speech voices available to the browser/device.

### Full review queue

- Review includes **every item that has been studied**, regardless of whether the last rating was Again, Hard, Good, or Easy.
- Due cards are prioritized by default but are not the only cards included.
- Review can be filtered to All, Japanese, or Cantonese.
- The visible queue can be reordered by drag and drop.
- Clicking a queued card moves it to the front of the remaining review.

### Source Library

Four separate datasets:

- Japanese Grammar
- Japanese Vocabulary
- Cantonese Grammar
- Cantonese Vocabulary

The library supports:

- full-text search
- level filtering
- category / collection / frequency-band filtering
- sorting by term, level, meaning, and Cantonese frequency where applicable
- random-item lookup
- pronunciation buttons
- learner-friendly grammar patterns
- source/reference links where bundled source metadata is available

The old `Source-indexed` badge is no longer shown.

### Usage Lab

Usage Lab and Source Library are separate top navigation items.

Usage Lab analyzes one selected language at a time and locally checks:

- grammar-pattern evidence
- exact vocabulary matches
- basic register signals

It no longer creates Japanese/Cantonese cross-language meaning bridges.

### Profile and persistence

The static version uses browser `localStorage`, not a real account backend.

Profile settings include:

- name
- Japanese target
- Cantonese target
- any positive integer Japanese daily goal
- any positive integer Cantonese daily goal

Progress can be exported and imported as JSON.

A true username/password login with secure multi-device retrieval would require a backend or hosted authentication/database service. The current build intentionally keeps the immediately functional local profile system instead.

## Run locally

From inside this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Opening `index.html` directly also works in modern browsers that allow local script files.

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

All original bundled data files, exports, source notes, and SVG assets remain included in the ZIP, even when a file was not changed by this revision.
