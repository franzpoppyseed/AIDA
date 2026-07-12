# Everyday vocabulary system

V12 adds semantic topics to the vocabulary library so common concrete words are easier to find and study as groups instead of being buried inside JLPT collections or a raw frequency list.

## Topic filters

The Source Library can filter Japanese and Cantonese vocabulary by 26 semantic topics:

- Animals
- Bathroom & hygiene
- Body & health
- City & street
- Cleaning & laundry
- Clothing & accessories
- Colors & appearance
- Cooking
- Drinks
- Electronics & appliances
- Family & people
- Food & ingredients
- Fruit
- Home & furniture
- Kitchen & dining
- Office & work
- Places & buildings
- School & study
- Shopping & money
- Sports & exercise
- Time & calendar
- Tools & repair
- Travel
- Vegetables
- Vehicles & transport
- Weather & nature

Topic labels are additive. A word can belong to more than one topic.

## Curated everyday supplement

The original dictionaries remain intact. V12 checks a curated bilingual set of 108 everyday concepts against the existing surface forms.

When an exact dictionary entry is missing, V12 adds a learner-facing supplement entry:

- 83 Japanese entries added
- 49 Cantonese entries added

The supplement focuses on concrete high-frequency domains that were underrepresented in the original source data, especially:

- vegetables
- kitchen tools
- household objects
- appliances
- hygiene items
- common animals
- vehicles
- electronics

Every supplemental item has:

- target-language written form
- Japanese reading or Cantonese Jyutping
- English meaning
- semantic topic
- beginner-level placement
- explicit curated provenance

The full topic/coverage audit is stored in:

```text
quality/everyday-vocabulary-audit.json
```

## English coverage rule

A learner-facing vocabulary card is not allowed to ship without an English meaning.

The release audit also checks all bundled sentence and passage banks, casual-language items, and audited grammar contexts for English translation coverage.

Raw untranslated Cantonese corpus lines are retained only as internal corpus/parser evidence and are not surfaced as study examples.
