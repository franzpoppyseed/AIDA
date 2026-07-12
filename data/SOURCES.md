# AIDA data sources

## Japanese grammar

Primary reference:
- https://bunpro.jp/grammar_points

The bundled Japanese grammar file contains public grammar-library index fields used by the app: pattern/title, concise English meaning, JLPT/course grouping, and direct source URL. It intentionally does not copy Bunpro's premium example-sentence collection or full lesson prose.

## Cantonese grammar

Primary references:
- https://www.cuhk.edu.hk/lin/cbrc/CantoneseGrammar/multimedia.htm
- https://ywjt2.user.srcf.net/cantonese/guide_to_cantonese_grammar.pdf

The Cantonese grammar dataset uses concise original summaries and tags entries with source information when the construction is covered by the referenced materials.

## Vocabulary

Normalized from the user-supplied files:
- `all.csv` — Japanese
- `Most Common Cantonese Words (Frequency List) - 40kExport.csv.csv` — Cantonese

### Cantonese learner-facing cleanup

The original Cantonese frequency export includes rows that cannot function as useful study cards. V7 excludes 18,566 rows with blank definitions, explicit source deletion/editing markers, or unrecoverable pronunciation data. The excluded records are preserved in `exports/cantonese_vocabulary_excluded.csv` with an `exclusion_reason` column.

For retained entries, V7 normalizes the pronunciation field for learner display and repairs missing example Jyutping where possible with PyCantonese. Every Cantonese vocabulary item loaded by the website has a meaning and pronunciation/Jyutping field, and every learner-facing bundled Cantonese example has usable Jyutping.

## Japanese context corpus

Selected Japanese–English examples in `data/context_examples.js` were imported from the Tatoeba/Tanaka-WWWJDIC export used during the V7 build.

Tatoeba download page:
- https://tatoeba.org/en/downloads

Tatoeba states that its downloadable files are released under CC BY 2.0 FR. The project stores selected examples rather than the full corpus export.

## Cantonese context corpus

Selected Cantonese conversational examples in `data/context_examples.js` come from HKCanCor as distributed with PyCantonese.

References:
- https://github.com/jacksonllee/pycantonese
- https://github.com/jacksonllee/pycantonese/tree/main/src/pycantonese/data/hkcancor

HKCanCor is used for conversational Cantonese context, word segmentation, and Jyutping data. The corpus is distributed under a CC BY license.

## Generated context

The application guarantees three progressive sentence contexts and three coherent mini-passage variations for every vocabulary and grammar item. Imported or bundled target-containing examples are preferred as anchors; when coverage is incomplete, deterministic original fallback context is used. The V9 passage engine places the anchor inside a semantic-domain scenario with setup, development, and consequence rather than concatenating unrelated example sentences.

Generated fallback text is labeled as AIDA fallback/generated context. It is not represented as corpus-authentic language.

## Original Japanese grammar context

The Japanese corpus matching step did not produce usable sentence context for every grammar-library entry, especially abstract conjugation labels and highly specific advanced constructions. V7 therefore adds original AIDA-written application examples for the 221 grammar items without an imported corpus match. Imported grammar items with fewer than three corpus examples are padded with contextual variations of their matched sentence, so every Japanese grammar item exposes at least three non-meta contexts.

## V12 everyday vocabulary supplement

V12 keeps the original vocabulary imports intact and adds a small curated supplement only where an exact everyday surface form was missing from the bundled source dictionary. These entries are marked with `AIDA_Everyday_Core` / `AIDA curated everyday vocabulary supplement` provenance and semantic topic tags. Cantonese supplement Jyutping is stored directly on each learner-facing entry.

The topic classifier and supplement are summarized in `../EVERYDAY_VOCABULARY.md` and audited in `../quality/everyday-vocabulary-audit.json`.
