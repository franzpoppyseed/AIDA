# Functional architecture

## Files

- `data/*.js` — bundled Japanese and Cantonese grammar/vocabulary content
- `app.js` — state, target filtering, study sessions, SRS, review queue, audio, Usage Lab, and Source Library logic
- `styles.css` — minimalist black-and-white interface
- `index.html` — application shell and dialogs

## State version

The current browser state schema is version 4.

Version 3 local progress is migrated automatically:

- the old shared XP total is split between Japanese and Cantonese
- old paired-session activity is split between the two language tracks
- the previous Japanese target is retained
- Cantonese starts with a Beginner target
- older low daily goals are raised to the new 30-item default during migration

## Study targeting

### Japanese

Target level is cumulative and never falls back to the full dataset.

`N5 < N4 < N3 < N2 < N1`

For example, an N3 target admits only N5, N4, and N3 items.

### Cantonese grammar

`Beginner < Intermediate < Advanced`

Targets are cumulative in the same way.

### Cantonese vocabulary

Because the bundled vocabulary source has no native proficiency-level field, the application derives a transparent study level from `frequency_rank`:

- Beginner: 1–3,000
- Intermediate: 3,001–12,000
- Advanced: 12,001+

Study target scopes are cumulative, so an Intermediate target admits ranks 1–12,000.

## Spaced repetition

Every learned source item is stored independently under its stable dataset/id key.

A rating updates:

- ease
- interval
- repetitions
- due time
- correct/incorrect history
- mastery
- last rating

XP and activity are credited only to the language of the rated item.

## Full review queue

The review queue is built from all learned SRS entries, not only due or weak entries.

Default priority:

1. due cards
2. lower mastery
3. older last review

The remaining queue is visible and draggable. Reordering changes only the current review-session order; it does not rewrite SRS scheduling.

## Learner-friendly grammar rendering

The raw data files are preserved unchanged. Display formatting converts abstract grammar placeholders into readable labels at render time.

This keeps source data intact while preventing raw forms such as `A hai6 B` or unexplained `ADJ` from appearing as the primary learner-facing card text.

## Audio

The browser Web Speech API is used so the static site does not need a paid API key or backend.

Japanese vocabulary prefers the dataset's stored kana reading as the speech text. Cantonese prefers available `yue-HK` / `yue` voices and falls back to a Hong Kong `zh-HK` voice when available.

The exact voice inventory is browser/device dependent.

## Usage Lab

Usage Lab is language-specific.

It scans:

- grammar pattern chunks
- exact vocabulary strings
- simple register markers

Its scores are local heuristic evidence, not native-speaker verification.

## Source Library

Filtering and sorting are applied to the full dataset before the first 120 visible results are rendered.

Available filter concepts vary by dataset:

- grammar: proficiency level + grammar category
- Japanese vocabulary: JLPT level + collection grouping
- Cantonese vocabulary: derived proficiency level + frequency band

## Persistence

Progress is stored in browser `localStorage` under the existing storage key so older local state can be migrated.

JSON export/import remains available for backup and manual transfer.
