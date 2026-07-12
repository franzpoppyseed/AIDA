# AIDA V8 functionality map

## Separate learning tracks

Japanese and Cantonese remain independent for target level, XP, daily goal, activity history, SRS/mastery, and review filtering.

## Study modes

- Mixed learning
- Grammar only
- Vocabulary only
- Sentence comprehension
- Passage comprehension

Every active vocabulary and grammar source item can participate in sentence and passage practice.

## Progressive difficulty

Japanese:

```text
N5 → N4 → N3 → N2 → N1
```

Cantonese:

```text
Beginner → Intermediate → Advanced
```

The selected target is the upper ceiling. Sessions are stratified across allowed bands and ordered from easier to harder. Each source item also has three sentence contexts and three passage variants that advance with repeated exposure.

## Answer reveal

Before reveal:

- target-language prompt
- recall/comprehension question
- pronunciation button

After reveal:

- Japanese reading or Cantonese Jyutping
- meaning/translation
- grammar explanation when relevant
- three context variations for direct vocabulary/grammar cards
- Again / Hard / Good / Easy

Cantonese Jyutping remains hidden until reveal.

## Passage assessment

- read target-language passage first
- answer typed comprehension questions
- view an advisory local match estimate
- compare with the reference answer
- self-confirm correct/incorrect
- final score maps to SRS rating
- reading/Jyutping and translation reveal after completion

## Usage Lab

Japanese and Cantonese now use:

- global dynamic-programming word segmentation
- a whole-word length score that prevents known words from being split into attractive one-character fragments
- context-aware sense ranking
- imported-context overlap
- nearby semantic-domain reranking for ambiguous homophones
- alternative-sense display
- token-boundary-aware structure and grammar matching

Japanese additionally supports romaji-to-kana interpretation and common conjugation matching.

Examples such as `ashita tomodachi to eki de au`, all-kana `はしでごはんをたべる`, and bridge context `かわにかかるはしをわたる` are explicitly covered by the validation tests.

Multi-sentence input is analyzed sentence by sentence. The result pane scrolls independently and includes sentence jump navigation.

## Audio

Browser-native path:

- Japanese browser voice selection
- Cantonese recognition for `yue-CN`, `yue-HK`, other `yue-*`, and `zh-HK`
- explicit XiaoMin / 晓敏 and YunSong / 云松 recognition
- manual voice selectors
- chunked long-form speech

Hosted fallback path:

- `api/cantonese-tts.js`
- same-origin automatic fallback when no browser Cantonese voice is exposed
- Azure Speech credentials remain in server environment variables rather than frontend JavaScript
- default hosted voice: `yue-CN-XiaoMinNeural`

## Review

- all learned items, not only due items
- due items prioritized
- Japanese/Cantonese filters
- drag-and-drop queue reordering
- reading/Jyutping shown only after reveal

## Source Library

- separate Japanese grammar/vocabulary and Cantonese grammar/vocabulary datasets
- search
- level filtering
- category/frequency/collection filtering
- sorting

## Progress controls

- local browser persistence
- JSON export/import
- separate language XP and goals
- clear learning progress with typed `CLEAR` confirmation

## Context browser

A dedicated Contexts tab lets the learner search a vocabulary or grammar item and inspect its sentence and passage variants. Source Library items also link directly into this browser. Cantonese context text uses per-character ruby annotations so Jyutping appears above the Chinese characters.
