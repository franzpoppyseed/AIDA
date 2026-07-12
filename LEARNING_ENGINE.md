# AIDA V10 learning engine

## Independent skill model

Language knowledge is not one-dimensional. A learner may recognize a word on sight, fail to produce it, miss it in speech, understand it only in context, or know a formal form without being able to use the conversational equivalent.

V10 therefore tracks six independent skills:

```text
recognition
production
listening
reading
grammar
casual
```

Each vocabulary, grammar, or casual-language item can have its own memory record for the skill being practiced. A skill record contains its own:

- FSRS card state
- seen count
- correct/wrong history
- mastery estimate
- last rating
- local history

`state.skillSrs` is the authoritative multi-skill memory store. The older aggregate `state.srs` object remains only as a compatibility/summary layer.

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

The learner still rates reviews with:

```text
Again / Hard / Good / Easy
```

The predicted next interval is displayed before the rating is chosen.

## Casual & conversational language

Casual language is not treated as a hidden variant of a formal grammar card. It is a separate skill family with explicit contrast and its own FSRS state.

### Japanese coverage

The casual bank includes progressive practice with:

- `です / ます` → plain forms
- casual questions without sentence-final `か`
- recoverable omission of `を`, `は`, `が`, and `に`
- `ている → てる`
- `という → って`
- `では → じゃ`
- `てしまう → ちゃう / じゃう`
- `なくては → なくちゃ`
- `なければ → なきゃ`
- `ておく → とく`
- `ておいて → といて`
- `ては → ちゃ`
- `というか → っていうか`
- conversational `もの → もん`
- request softening and omitted material when context makes the meaning recoverable
- selected colloquial potential forms with explicit caution about register

Particle omission is taught as **context-dependent ellipsis**, not as a rule that particles can always be deleted.

### Cantonese coverage

The Cantonese casual bank includes:

- common sentence-final particles and particle stacks
- subject/object omission when recoverable
- aspect particles such as `緊`, `住`, and `咗`
- spoken-vs-written lexical choices
- common contractions and colloquial question forms
- conversational demonstratives and quantity forms
- topic continuation and discourse particles

Jyutping is shown on reveal for Cantonese casual forms.

### Three-stage casual practice cycle

Repeated encounters rotate through:

1. **Transform** — rewrite the explicit/neutral form naturally for casual conversation.
2. **Notice** — identify what was omitted, contracted, or changed in register.
3. **Register judgment** — explain where the casual form is natural and what should not be overgeneralized.

This is intentionally more than memorizing `formal → casual` pairs. The learner is asked to notice recoverability, relationship, setting, and pragmatic effect.

## Grammar-context validation

Grammar context tiles now resolve through the V14 per-item registry rather than character-overlap matching or generic runtime generation.

- 963 Japanese grammar registry keys exist.
- 437 Japanese grammar items currently have one or more verified learner-facing contexts.
- 1,061 verified Japanese grammar examples are in the registry.
- all 129 N5 Japanese grammar items have verified contexts.
- ambiguous higher-level Japanese grammar items may intentionally have no example rather than a guessed one.
- all 67 Cantonese grammar cards have manually audited contexts, for 201 examples total, including Jyutping and English.

See `GRAMMAR_CONTEXT_AUDIT.md` and `ITEM_SPECIFIC_CONTEXT_POLICY.md` for the methodology and counts.

## Migration

Older AIDA state used one memory record per base item. During migration:

- vocabulary defaults to Recognition
- grammar defaults to Grammar
- sentence/passage items default to Reading
- casual items create a Casual skill record when first practiced

Older records are converted into reasonable initial FSRS-like cards rather than discarded.

## Adaptive mixed practice

Mixed study samples multiple modes rather than drawing uniformly from the huge vocabulary pool. The composition deliberately includes recognition, grammar, production, listening, reading, and casual/register practice while respecting the selected language target ceiling.

The session is then ordered from easier level bands toward harder bands.

## Production

Production cards use a context sentence tied to the base item. The learner sees meaning first and must produce the target language. Typed input receives a surface-form similarity estimate, but the estimate is explicitly advisory because valid language can have multiple correct forms.

Grammar production can update both Production and Grammar memory while awarding XP once per practice event.

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

The review format is materialized for that skill. A production-due item becomes a production review; a listening-due item becomes a hidden-transcript listening review; a casual-due item becomes conversational transformation/noticing/register practice.

## Local-only architecture

All memory state is stored locally in browser storage and can be exported/imported as JSON. No password-based local “account” is presented as real authentication.
