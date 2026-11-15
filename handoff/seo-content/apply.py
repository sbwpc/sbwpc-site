#!/usr/bin/env python3
"""Add the explainer bodies and FAQ sections to the SBWPC Sanity dataset.

Safe by design:
  - Dry run by default. Nothing is written without --apply.
  - Inserts new sections only. It never replaces or edits existing content.
  - Skips a page if an unpublished draft of it exists (an editor is mid-edit).
  - Uses the current document revision, so a concurrent edit makes the write fail instead of clobbering.
  - Re-running is safe: sections with the same key are skipped.

Usage:
  SANITY_WRITE_TOKEN=xxxx python3 apply.py            # dry run, shows the plan
  SANITY_WRITE_TOKEN=xxxx python3 apply.py --apply    # writes
"""
import json, os, re, sys, urllib.parse, urllib.request, uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content

PROJECT, DATASET, API = 'coo0nu6y', 'production', 'v2024-01-01'
BASE = f'https://{PROJECT}.api.sanity.io/{API}/data'
TOKEN = os.environ.get('SANITY_WRITE_TOKEN', '')
APPLY = '--apply' in sys.argv
LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')


def key():
    return uuid.uuid4().hex[:12]


def inline(text):
    """Turn 'a [b](url) c' into spans plus link markDefs."""
    children, defs, pos = [], [], 0
    for m in LINK.finditer(text):
        if m.start() > pos:
            children.append({'_type': 'span', '_key': key(), 'text': text[pos:m.start()], 'marks': []})
        k = key()
        defs.append({'_key': k, '_type': 'link', 'href': m.group(2)})
        children.append({'_type': 'span', '_key': key(), 'text': m.group(1), 'marks': [k]})
        pos = m.end()
    if pos < len(text):
        children.append({'_type': 'span', '_key': key(), 'text': text[pos:], 'marks': []})
    return children, defs


def block(text, style='normal'):
    children, defs = inline(text)
    return {'_type': 'block', '_key': key(), 'style': style, 'markDefs': defs, 'children': children}


def to_portable(markup):
    out = []
    for line in markup.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('### '):
            out.append(block(line[4:], 'h4'))
        elif line.startswith('## '):
            out.append(block(line[3:], 'h3'))
        else:
            out.append(block(line))
    return out


def get(url, auth=False):
    req = urllib.request.Request(url)
    if auth and TOKEN:
        req.add_header('Authorization', 'Bearer ' + TOKEN)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def query(groq, auth=False, **params):
    q = {'query': groq}
    for k, v in params.items():
        q['$' + k] = json.dumps(v)
    host = f'{BASE}/query/{DATASET}?' + urllib.parse.urlencode(q)
    return get(host, auth)['result']


def build_sections():
    plan = {}
    for path, e in content.EXPLAINERS.items():
        plan[path] = {
            'key': 'seo-explainer-body',
            'where': 'after-last',
            'section': {
                '_type': 'sectionText', '_key': 'seo-explainer-body', 'tone': 'cream',
                'eyebrow': e['eyebrow'], 'heading': e['heading'], 'body': to_portable(e['body']),
            },
        }
    for path, f in content.FAQS.items():
        items = []
        for q, a in f['items']:
            assert q.endswith('?'), q
            items.append({'_type': 'accordionItem', '_key': key(), 'title': q, 'body': [block(a)]})
        plan[path] = {
            'key': 'seo-faq',
            'where': 'before-cta',
            'section': {
                '_type': 'sectionAccordion', '_key': 'seo-faq', 'tone': 'white',
                'eyebrow': f['eyebrow'], 'heading': f['heading'], 'items': items,
            },
        }
    return plan


def main():
    plan = build_sections()
    if APPLY and not TOKEN:
        sys.exit('Set SANITY_WRITE_TOKEN to write. Dry run does not need it.')
    paths = list(plan)
    docs = query('*[_type=="page" && path in $paths]{_id,_rev,path,"sections":sections[]{_key,_type}}', paths=paths)
    by_path = {d['path']: d for d in docs}
    drafts = set()
    if TOKEN:
        ids = ['drafts.' + d['_id'] for d in docs]
        found = query('*[_id in $ids]{_id}', auth=True, ids=ids)
        drafts = {x['_id'] for x in found}
    mutations, report = [], []
    for path, item in plan.items():
        d = by_path.get(path)
        if not d:
            report.append(f'SKIP  {path}: page not found'); continue
        if 'drafts.' + d['_id'] in drafts:
            report.append(f'SKIP  {path}: an unpublished draft exists, publish or discard it first'); continue
        keys = [s['_key'] for s in (d.get('sections') or [])]
        if item['key'] in keys:
            report.append(f'SKIP  {path}: already added'); continue
        ctas = [s['_key'] for s in (d.get('sections') or []) if s['_type'] == 'sectionCta']
        if item['where'] == 'before-cta' and ctas:
            ins = {'before': f'sections[_key=="{ctas[-1]}"]', 'items': [item['section']]}
            spot = 'before the closing call to action'
        else:
            ins = {'after': 'sections[-1]', 'items': [item['section']]}
            spot = 'at the end of the page'
        mutations.append({'patch': {'id': d['_id'], 'ifRevisionID': d['_rev'], 'insert': ins}})
        n = len(item['section'].get('items') or item['section'].get('body') or [])
        report.append(f'ADD   {path}: {item["section"]["_type"]} ({n} blocks/items) {spot}')
    print('\n'.join(report))
    if not APPLY:
        print('\nDry run only. Re-run with --apply to write %d change(s).' % len(mutations))
        return
    if not mutations:
        print('Nothing to write.'); return
    ok = 0
    for m in mutations:  # one at a time so a failed revision check affects only that page
        req = urllib.request.Request(
            f'{BASE}/mutate/{DATASET}?returnIds=true', data=json.dumps({'mutations': [m]}).encode(),
            headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                json.load(r); ok += 1
                print('WROTE', m['patch']['id'])
        except urllib.error.HTTPError as e:
            print('FAILED', m['patch']['id'], e.code, e.read().decode()[:300])
    print(f'Done: {ok} of {len(mutations)} written.')


if __name__ == '__main__':
    main()
