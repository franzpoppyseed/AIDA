#!/usr/bin/env python3
"""Static integrity audit for AIDA learner-facing content.

The audit catches deterministic structural failures before shipping:
- missing English glosses/translations on any learner-facing static content
- missing Cantonese Jyutping where pronunciation is expected
- duplicate casual examples
- incomplete grammar override sets
- leaked grammar placeholders
- semantic-topic coverage and everyday-core supplement integrity

It does not claim that every sentence is linguistically perfect; that still requires
corpus evidence and human review.
"""
from pathlib import Path
import json, re, sys, datetime
ROOT = Path(__file__).resolve().parents[1]


def load_assignment(path: Path):
    text = path.read_text(encoding='utf-8')
    m = re.search(r'=\s*(\{.*\});\s*$', text, re.S)
    if not m:
        raise ValueError(f'Could not parse {path}')
    return json.loads(m.group(1))


def add_issue(issues, severity, area, item_id, message):
    issues.append({'severity': severity, 'area': area, 'id': item_id, 'message': message})

casual = load_assignment(ROOT/'data/casual_language.js')
overrides = load_assignment(ROOT/'data/grammar_overrides.js')
jp_vocab = load_assignment(ROOT/'data/japanese_vocabulary.js')
yue_vocab = load_assignment(ROOT/'data/cantonese_vocabulary.js')
comprehension = load_assignment(ROOT/'data/comprehension.js')
reading_passages = load_assignment(ROOT/'data/reading_passages.js')
context_examples = load_assignment(ROOT/'data/context_examples.js')

issues = []
summary = {}
placeholder = re.compile(r'\b(?:ADJ|NOUN|VERB|SUBJECT|OBJECT|CLAUSE|PERSON|PLACE|DIRECT OBJECT|INDIRECT OBJECT)\b')

# Casual curriculum
for lang, items in casual.items():
    seen_ids, seen_pairs = set(), set()
    missing_english = missing_reading = duplicate_pairs = 0
    for item in items:
        if item.get('id') in seen_ids:
            add_issue(issues, 'error', 'casual', item.get('id'), 'Duplicate item id')
        seen_ids.add(item.get('id'))
        pair = (item.get('base','').strip(), item.get('casual','').strip())
        if pair in seen_pairs:
            duplicate_pairs += 1
            add_issue(issues, 'warning', 'casual', item.get('id'), 'Duplicate neutral/casual pair')
        seen_pairs.add(pair)
        for field in ['title','base','casual','translation','whatChanged','when','caution','qualityStatus']:
            if not str(item.get(field,'')).strip():
                add_issue(issues, 'error', 'casual', item.get('id'), f'Missing {field}')
        if not item.get('translation','').strip(): missing_english += 1
        if lang == 'cantonese' and not item.get('reading','').strip():
            missing_reading += 1
            add_issue(issues, 'error', 'casual', item.get('id'), 'Missing Jyutping')
    summary[f'{lang}_casual'] = {'items':len(items),'missing_english':missing_english,'missing_reading':missing_reading,'duplicate_pairs':duplicate_pairs}

# Audited grammar context overrides
for lang, mapping in overrides.items():
    total_examples = 0
    incomplete = 0
    for item_id, examples in mapping.items():
        total_examples += len(examples)
        if len(examples) < 3:
            incomplete += 1
            add_issue(issues, 'warning', 'grammar_override', item_id, f'Only {len(examples)} examples')
        seen_text = set()
        for i, ex in enumerate(examples):
            text = str(ex.get('text','')).strip()
            if not text or not str(ex.get('translation','')).strip():
                add_issue(issues, 'error', 'grammar_override', item_id, f'Example {i+1} missing text or English translation')
            if text in seen_text:
                add_issue(issues, 'warning', 'grammar_override', item_id, f'Duplicate example text at {i+1}')
            seen_text.add(text)
            if placeholder.search(text):
                add_issue(issues, 'error', 'grammar_override', item_id, f'Placeholder leaked into example {i+1}')
            if lang == 'cantonese' and not str(ex.get('reading','') or ex.get('jyutping','')).strip():
                add_issue(issues, 'error', 'grammar_override', item_id, f'Example {i+1} missing Jyutping')
    summary[f'{lang}_grammar_overrides'] = {'cards':len(mapping),'examples':total_examples,'incomplete_sets':incomplete}

# Vocabulary: every word must have an English meaning. Curated Cantonese supplement must have Jyutping.
for label, obj, lang in [('japanese', jp_vocab, 'jp'), ('cantonese', yue_vocab, 'yue')]:
    items = obj.get('items', [])
    missing_english = 0
    missing_pronunciation = 0
    with_topics = 0
    supplemental = 0
    for item in items:
        item_id = item.get('id')
        if not str(item.get('meaning','')).strip():
            missing_english += 1
            add_issue(issues, 'error', f'{label}_vocabulary', item_id, 'Missing English meaning')
        if item.get('topics'): with_topics += 1
        if str(item_id).startswith(('jp-ev-', 'yue-ev-')):
            supplemental += 1
            if lang == 'yue' and not str(item.get('jyutping','')).strip():
                missing_pronunciation += 1
                add_issue(issues, 'error', f'{label}_vocabulary', item_id, 'Everyday supplement item missing Jyutping')
            if lang == 'jp' and not str(item.get('reading','')).strip():
                missing_pronunciation += 1
                add_issue(issues, 'error', f'{label}_vocabulary', item_id, 'Everyday supplement item missing reading')
    summary[f'{label}_vocabulary'] = {
        'items': len(items),
        'missing_english': missing_english,
        'items_with_semantic_topics': with_topics,
        'supplemental_everyday_items': supplemental,
        'supplemental_missing_pronunciation': missing_pronunciation,
    }

# Reading bank and sentence/passage comprehension: English is mandatory.
for lang in ['japanese','cantonese']:
    for content_type in ['sentences','passages']:
        items = comprehension.get(lang,{}).get(content_type,[])
        missing = 0
        for item in items:
            if not str(item.get('translation','')).strip():
                missing += 1
                add_issue(issues,'error',f'{lang}_{content_type}',item.get('id'),'Missing English translation')
        summary[f'{lang}_{content_type}'] = {'items':len(items),'missing_english':missing}
    items = reading_passages.get(lang,[])
    missing = 0
    for item in items:
        if not str(item.get('translation','')).strip():
            missing += 1
            add_issue(issues,'error',f'{lang}_reading_passages',item.get('id'),'Missing English translation')
    summary[f'{lang}_reading_passages'] = {'items':len(items),'missing_english':missing}

# Imported Japanese contexts are learner-facing and must have English.
# Raw Cantonese corpus lines are retained as parser/corpus evidence but app.js deliberately
# excludes untranslated lines from learner-facing context cards.
jp_context_total = jp_context_missing = 0
for group in (context_examples.get('japanese') or {}).values():
    if not isinstance(group, dict):
        continue
    for item_id, examples in group.items():
        if not isinstance(examples, list):
            continue
        for i, ex in enumerate(examples):
            jp_context_total += 1
            if not str(ex.get('translation','') or ex.get('meaning','')).strip():
                jp_context_missing += 1
                add_issue(issues,'error','japanese_context_examples',item_id,f'Example {i+1} missing English translation')
summary['japanese_context_examples'] = {'examples':jp_context_total,'missing_english':jp_context_missing}

raw_yue_total = 0
raw_yue_with_english = 0
for group in (context_examples.get('cantonese') or {}).values():
    if not isinstance(group, dict):
        continue
    for examples in group.values():
        if not isinstance(examples, list):
            continue
        for ex in examples:
            raw_yue_total += 1
            if str(ex.get('translation','') or ex.get('meaning','')).strip(): raw_yue_with_english += 1
summary['cantonese_raw_corpus_context'] = {
    'examples': raw_yue_total,
    'with_english': raw_yue_with_english,
    'learner_facing_policy': 'Untranslated raw corpus lines are excluded from context cards and retained only as corpus/parser evidence.'
}

# Semantic topic coverage audit
all_topics = sorted(set(
    topic
    for obj in [jp_vocab, yue_vocab]
    for item in obj.get('items',[])
    for topic in (item.get('topics') or [])
))
summary['semantic_topics'] = {'count':len(all_topics),'topics':all_topics}

report = {
    'generated_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'purpose': 'Deterministic structural audit; not a substitute for linguistic review.',
    'summary': summary,
    'issue_counts': {
        'errors': sum(i['severity']=='error' for i in issues),
        'warnings': sum(i['severity']=='warning' for i in issues)
    },
    'issues': issues
}
out = ROOT/'quality/audit-report.json'
out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
print('issues', report['issue_counts'])
sys.exit(1 if report['issue_counts']['errors'] else 0)
