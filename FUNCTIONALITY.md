# Functional architecture

- `data/*.js`: bundled source content
- `app.js`: local application engine, semantic pairing, quizzes, SRS, persistence, Usage Lab analysis, and library search
- `styles.css`: black-and-white minimalist interface
- `index.html`: application shell and dialogs

## Spaced repetition

Each learned source item is stored independently under a stable dataset/id key. Ratings update ease, interval, repetitions, due time, mistakes, and mastery.

## Cross-language pairing

Pairs are suggestions, not guaranteed exact translations. The engine compares normalized English-gloss tokens and labels the strength of the semantic bridge.

## Quick checks

Each quick-check prompt and its correct meaning now come from the same Japanese or Cantonese item. Distractors are sampled from the relevant grammar or vocabulary pools.

## Usage Lab

The local checker scans grammar pattern chunks and exact vocabulary matches, then surfaces source evidence and cross-language suggestions. Register detection is heuristic and explicitly presented as confidence rather than native-speaker verification.

## Persistence

Progress is stored in `localStorage`. Dates use the browser's local calendar date. Users can export and import progress as JSON.
