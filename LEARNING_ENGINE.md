# AIDA V9 learning engine

## Why one mastery number was removed

Language knowledge is not one-dimensional. A learner may:

- recognize a word on sight
- fail to produce it from meaning
- miss it in fast speech
- understand it inside a passage
- misuse its grammar

V9 therefore stores separate memory cards for five skills.

## Skill model

```text
recognition
production
listening
reading
grammar
```

Each base vocabulary or grammar item can have zero to five active skill records. A skill record contains its own:

- FSRS card state
- seen count
- correct/wrong history
- mastery estimate
- last rating
- local history

The old aggregate `state.srs` object remains as a derived compatibility layer for dashboards and older exports. `state.skillSrs` is the authoritative multi-skill memory store.

## FSRS implementation

The project vendors the browser UMD build of `ts-fsrs` in:

```text
vendor/ts-fsrs.umd.js
```

Bundled version: **5.4.1**, implementing FSRS-6 behavior.

The package license is preserved in:

```text
vendor/TS-FSRS-LICENSE.txt
```

AIDA configures:

- adjustable desired retention from 0.80 to 0.97
- 0.90 default
- long maximum interval
- fuzzing enabled
- short-term learning enabled
- learning steps of 1 minute and 10 minutes
- relearning step of 10 minutes

The UI keeps the familiar learner labels:

```text
Again / Hard / Good / Easy
```

These map to the corresponding FSRS ratings. The predicted next interval is shown on each rating button.

## Migration

Older AIDA state used one memory record per base item. During migration:

- vocabulary defaults to Recognition
- grammar defaults to Grammar
- sentence/passage items default to Reading

The old record is converted into a reasonable initial FSRS-like card instead of being discarded. Future practice creates additional skill records as needed.

## Adaptive mixed practice

Mixed study deliberately samples multiple modes rather than drawing uniformly from the huge vocabulary pool. The current intended composition is approximately:

- 24% recognition
- 18% grammar
- 16% production
- 16% listening
- 13% sentence reading
- 13% passage reading

The actual session is still constrained by the selected language target ceiling and then ordered from easier level bands toward harder bands.

## Production

Production cards use a context sentence tied to the base item. The learner sees meaning first and must produce the target language. Typed input receives a surface-form similarity estimate, but the estimate is explicitly advisory because valid language can have multiple correct forms.

Grammar production updates both Production and Grammar memory. XP is awarded once per practice event rather than twice.

## Listening

Listening items are sentence or passage contexts tied to the source material.

Before reveal:

- transcript hidden
- audio replay available
- learner reconstructs meaning

After reveal:

- transcript visible
- reading/Jyutping visible where appropriate
- synchronized replay available

The synchronization layer prefers browser speech boundary events. If the browser does not emit boundaries, AIDA estimates token timing. Hosted Cantonese audio uses audio-progress-based highlighting.

## Reading comprehension

Passage questions test discourse and inference. A local response matcher provides only a hint. The learner remains the final grader after seeing the reference answer.

## Review selection

A base item can have several skill records. The review queue chooses the most urgent skill by:

1. overdue status
2. earliest due time
3. lower mastery as a tie-breaker

The review format is then materialized for that skill. A production-due item becomes a production review; a listening-due item becomes a hidden-transcript listening review.

## Local-only architecture

All memory state is stored locally in browser storage and can be exported/imported as JSON. No password-based local “account” is presented as real authentication.
