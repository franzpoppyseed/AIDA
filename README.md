# AIDA / 間 — Functional V6 Reading & Progress Revision

A local-first Japanese and Cantonese learning application. The two languages share one interface but remain separate learning tracks.

## V6 changes

### Usage Lab scrolling is fixed

The analysis pane is now a real independently scrollable region inside the desktop dialog. Long passage analysis can be scrolled from the first sentence to the last without the modal trapping the content.

For multi-sentence input, a sticky **Jump to 1 / 2 / 3...** navigator also appears at the top of the analysis pane.

### Passage comprehension is now an assessment, not a reveal card

Passages use a dedicated flow:

1. Read the target-language passage with no translation shown.
2. Begin the comprehension test.
3. Answer several questions in your own words.
4. Check your answer against a reference answer.
5. A local keyword/overlap score gives an advisory match estimate.
6. You make the final correct/incorrect judgment yourself.
7. The passage receives an automatic SRS rating from the final comprehension score.
8. Reading help and translation appear only after the assessment.

This avoids making reading progress depend only on multiple-choice recognition or an unreliable fully automatic grader.

Question types include detail, sequence, cause/effect, contrast, inference, strategy, risk, and main idea.

### Larger passage bank

The project now contains:

- 15 Japanese passages across N5–N1
- 12 Cantonese passages across Beginner–Advanced
- 8 Japanese sentence-comprehension items
- 8 Cantonese sentence-comprehension items

The original comprehension data remains in `data/comprehension.js`. Additional original passages are stored separately in `data/reading_passages.js`.

Mixed sessions now reserve some space for sentence and passage comprehension so the much larger vocabulary pool cannot crowd reading practice out completely.

### Clear progress

Profile now includes **Clear learning progress…**.

The destructive action requires typing `CLEAR`. It removes:

- Japanese and Cantonese XP
- SRS/mastery records
- review queue history
- activity/streak history
- session statistics
- answer statistics

It keeps:

- name
- Japanese target
- Cantonese target
- both daily goals

### Existing V5 behavior retained

- Japanese and Cantonese remain fully separate tracks.
- Japanese targets are cumulative: N4 includes N5+N4, and so on.
- Cantonese targets are cumulative: Intermediate includes Beginner+Intermediate.
- Study answers and Again/Hard/Good/Easy remain hidden until a standard card is revealed.
- Abstract taxonomy-only grammar cards remain removed.
- Review contains every learned item and supports drag-and-drop reordering.
- Source Library supports search, level/category filters, and sorting.
- Usage Lab provides local word separation, structure hints, grammar matching, and sentence-by-sentence analysis.
- Japanese audio uses the stored reading where appropriate.
- Cantonese browser audio prefers `yue-HK`/`zh-HK` voices and does not silently substitute Mandarin.

## Persistence

The application remains local-first and stores progress in browser `localStorage` under the existing storage key, so V4/V5 progress remains compatible.

Progress can be exported and imported as JSON.

## Run locally

From inside this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Project structure

```text
AIDA_FUNCTIONAL_V3/
├── index.html
├── styles.css
├── app.js
├── AUDIO_SETUP.md
├── assets/
├── data/
│   ├── japanese_grammar.js
│   ├── japanese_vocabulary.js
│   ├── cantonese_grammar.js
│   ├── cantonese_vocabulary.js
│   ├── comprehension.js
│   ├── reading_passages.js
│   ├── manifest.json
│   └── SOURCES.md
├── exports/
├── FUNCTIONALITY.md
└── README.md
```

The ZIP includes the complete project, including unchanged assets, exports, and source notes.
