#!/usr/bin/env python3
"""Static integrity audit for AIDA learner-facing context data.

This does not claim linguistic perfection. It catches structural quality failures that
can be checked deterministically before shipping: missing translations/readings,
placeholder leakage, duplicate examples, incomplete override sets, and missing
quality provenance.
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

casual = load_assignment(ROOT/'data/casual_language.js')
overrides = load_assignment(ROOT/'data/grammar_overrides.js')
issues = []
summary = {}
placeholder = re.compile(r'\b(?:ADJ|NOUN|VERB|SUBJECT|OBJECT|CLAUSE|PERSON|PLACE|DIRECT OBJECT|INDIRECT OBJECT)\b')

for lang, items in casual.items():
    seen_ids, seen_pairs = set(), set()
    missing_english = missing_reading = duplicate_pairs = 0
    for item in items:
        if item.get('id') in seen_ids:
            issues.append({'severity':'error','area':'casual','id':item.get('id'),'message':'Duplicate item id'})
        seen_ids.add(item.get('id'))
        pair = (item.get('base','').strip(), item.get('casual','').strip())
        if pair in seen_pairs:
            duplicate_pairs += 1
            issues.append({'severity':'warning','area':'casual','id':item.get('id'),'message':'Duplicate neutral/casual pair'})
        seen_pairs.add(pair)
        for field in ['title','base','casual','translation','whatChanged','when','caution','qualityStatus']:
            if not str(item.get(field,'')).strip():
                issues.append({'severity':'error','area':'casual','id':item.get('id'),'message':f'Missing {field}'})
        if not item.get('translation','').strip(): missing_english += 1
        if lang == 'cantonese' and not item.get('reading','').strip():
            missing_reading += 1
            issues.append({'severity':'error','area':'casual','id':item.get('id'),'message':'Missing Jyutping'})
    summary[f'{lang}_casual'] = {'items':len(items),'missing_english':missing_english,'missing_reading':missing_reading,'duplicate_pairs':duplicate_pairs}

for lang, mapping in overrides.items():
    total_examples = 0
    incomplete = 0
    for item_id, examples in mapping.items():
        total_examples += len(examples)
        if len(examples) < 3:
            incomplete += 1
            issues.append({'severity':'warning','area':'grammar_override','id':item_id,'message':f'Only {len(examples)} examples'})
        seen_text = set()
        for i, ex in enumerate(examples):
            text = str(ex.get('text','')).strip()
            if not text or not str(ex.get('translation','')).strip():
                issues.append({'severity':'error','area':'grammar_override','id':item_id,'message':f'Example {i+1} missing text or English translation'})
            if text in seen_text:
                issues.append({'severity':'warning','area':'grammar_override','id':item_id,'message':f'Duplicate example text at {i+1}'})
            seen_text.add(text)
            if placeholder.search(text):
                issues.append({'severity':'error','area':'grammar_override','id':item_id,'message':f'Placeholder leaked into example {i+1}'})
            if lang == 'cantonese' and not str(ex.get('reading','') or ex.get('jyutping','')).strip():
                issues.append({'severity':'error','area':'grammar_override','id':item_id,'message':f'Example {i+1} missing Jyutping'})
    summary[f'{lang}_grammar_overrides'] = {'cards':len(mapping),'examples':total_examples,'incomplete_sets':incomplete}

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
