# Functional architecture

- `data/*.js`: source content only
- `app.js`: local application engine, semantic pairing, SRS, persistence, Usage Lab analysis
- `styles.css`: visual layer
- `index.html`: application shell

## SRS
Each learned source item is stored independently under a stable dataset/id key. Ratings update ease, interval, repetitions, due time, and mastery.

## Cross-language pairing
Pairs are suggestions, not guaranteed exact translations. The engine compares normalized English gloss tokens and labels the strength of the bridge.

## Usage Lab
The local checker scans grammar pattern chunks and exact vocabulary matches, then surfaces source evidence and cross-language suggestions. Register is heuristic and explicitly labeled as such.
