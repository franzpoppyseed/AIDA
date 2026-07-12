# Context coverage report

## Learner-facing source items

| Track | Type | Items | Sentence variants | Mini-passage variants |
|---|---:|---:|---:|---:|
| Japanese | Vocabulary | 7,973 | 23,919 | 23,919 |
| Japanese | Grammar | 963 | 2,889 | 2,889 |
| Cantonese | Vocabulary | 25,869 | 77,607 | 77,607 |
| Cantonese | Grammar | 67 | 201 | 201 |
| **Total** |  | **34,872** | **104,616** | **104,616** |

Coverage is generated on demand. The website stores source items plus imported context and materializes the sentence or passage assessment when selected. This avoids storing 209,232 duplicated runtime cards.

## Progressive variation model

Every source item exposes three sentence contexts:

```text
EASIER → BUILD → HARDER
```

It also exposes three passage variants:

1. the two easier contexts
2. the two denser contexts
3. all three contexts together

The source item's SRS exposure count advances repeated sentence/passage encounters through those three variants.

## Context priority

### Japanese vocabulary and grammar

1. Selected Tatoeba/Tanaka-WWWJDIC Japanese–English contexts from `data/context_examples.js`
2. Original AIDA grammar examples for grammar points with no corpus match
3. Deterministic AIDA fallback context for any remaining uncovered vocabulary slot

### Cantonese vocabulary

1. Existing bundled vocabulary examples with usable Jyutping
2. HKCanCor conversational contexts from `data/context_examples.js`
3. Deterministic AIDA fallback context for remaining uncovered slots

### Cantonese grammar

Three deterministic target-language structure instantiations using different people, objects, times, and places.

## Imported/bundled coverage before fallback

- Japanese vocabulary with imported context: 6,991 / 7,973
- Japanese grammar with imported corpus context: 742 / 963
- Japanese imported total: 7,733 / 8,936
- Japanese grammar with three non-meta contexts after original AIDA supplementation: 963 / 963
- Japanese grammar points supplied with original AIDA examples because no imported corpus match was available: 221
- Cantonese vocabulary with bundled examples: 24,927 / 25,869
- Cantonese vocabulary with HKCanCor context: 4,224 / 25,869
- Cantonese vocabulary covered by bundled examples or HKCanCor: 25,130 / 25,869

Fallback/original material is labeled as AIDA content rather than corpus-sourced material.

## Difficulty progression

A target is a ceiling, not a request to study only that exact band.

Japanese:

```text
N5 → N4 → N3 → N2 → N1
```

Cantonese:

```text
Beginner → Intermediate → Advanced
```

Session sampling is stratified across allowed bands and then ordered from lower to higher difficulty. Repeated encounters with the same source item also move through its easier, build, and harder context variants.

## Learner-facing Cantonese cleanup

The raw Cantonese source export contained **18,566 records** that could not function as reliable study cards because they lacked a definition, carried explicit deletion/editing markers, or had no recoverable pronunciation data. They are excluded from study but preserved in `exports/cantonese_vocabulary_excluded.csv` with an `exclusion_reason` field.

All **25,869 active Cantonese vocabulary items** have pronunciation/Jyutping data. All bundled Cantonese examples that remain learner-facing also have usable Jyutping; unrecoverable example rows were removed from display.
