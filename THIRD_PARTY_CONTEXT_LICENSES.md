# Third-party context data and attribution

AIDA includes a selected subset of external corpus examples for language-learning context. It does **not** bundle the full upstream corpora.

## Tatoeba / Tanaka-WWWJDIC-derived Japanese sentence pairs

Selected Japanese-English sentence pairs in `data/context_examples.js` were taken from a Tatoeba downloadable Japanese-English WWWJDIC/Tanaka-style export during the V7 build.

- Project: Tatoeba
- Downloads: https://tatoeba.org/en/downloads
- License stated for downloadable sentence data: Creative Commons Attribution 2.0 France (CC BY 2.0 FR)
- Attribution: Tatoeba contributors

Only selected sentence pairs used as item context are included in this repository.

## HKCanCor via PyCantonese

Selected Cantonese conversational utterances in `data/context_examples.js` were extracted from HKCanCor as distributed with PyCantonese.

- Project/distribution: PyCantonese / HKCanCor
- Repository: https://github.com/jacksonllee/pycantonese
- License: Creative Commons Attribution (CC BY), as documented by the upstream project for HKCanCor data
- Attribution: HKCanCor corpus contributors and PyCantonese project maintainers

The selected utterances are used for conversational context, segmentation evidence, and Jyutping where available.

## AIDA-authored and curated material

AIDA also contains item-specific examples written or manually selected for the exact learner-facing vocabulary or grammar point. These are labeled as curated/audited AIDA material and are not attributed to Tatoeba, HKCanCor, or another external corpus.

V14 does **not** use a generic runtime sentence generator to fill context gaps. If no trustworthy item-specific, audited, translated corpus, bundled, or curated reading-bank context is available, the learner-facing context is left absent.
