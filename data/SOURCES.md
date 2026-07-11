# AIDA data sources

## Japanese grammar
Primary reference: Bunpro Grammar Library
- https://bunpro.jp/grammar_points

The bundled Japanese grammar file contains the public grammar-library index fields used by the app:
pattern/title, concise English meaning, JLPT/course grouping, and the direct source URL.
It intentionally does not copy Bunpro's premium example-sentence collection or full lesson prose.

## Cantonese grammar
Primary references:
- https://www.cuhk.edu.hk/lin/cbrc/CantoneseGrammar/multimedia.htm
- https://ywjt2.user.srcf.net/cantonese/guide_to_cantonese_grammar.pdf

The Cantonese grammar dataset uses concise original summaries and tags entries with both sources when
the same construction is covered by the learner guide and the CUHK chapter framework.

## Vocabulary
Normalized from the user-supplied files:
- all.csv (Japanese)
- Most Common Cantonese Words (Frequency List) - 40kExport.csv.csv (Cantonese)

The website loads these pools from separate JavaScript data files so the project also works when
index.html is opened directly from disk without a web server.
