"""Turn the policy markdown files into Sanity page documents in the seed.
Run from the repo root: python3 handoff/policies/build_policies.py"""
import json, re, glob, hashlib

def key(*parts):
    return 'p' + hashlib.md5('|'.join(map(str, parts)).encode()).hexdigest()[:9]

def spans(text, bk):
    marks, children, defs = [], [], []
    pos = 0
    pat = re.compile(r'\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)')
    # placeholders stay visible and bold so nobody misses them
    if text.startswith('[SBWPC to confirm'):
        return [{'_type': 'span', '_key': key(bk, 'ph'), 'text': text, 'marks': ['strong']}], []
    i = 0
    for m in pat.finditer(text):
        if m.start() > pos:
            children.append({'_type': 'span', '_key': key(bk, i), 'text': text[pos:m.start()], 'marks': []}); i += 1
        if m.group(1):
            inner = m.group(1)
            lm = re.fullmatch(r'\[([^\]]+)\]\(([^)]+)\)', inner)
            children.append({'_type': 'span', '_key': key(bk, i), 'text': inner, 'marks': ['strong']}); i += 1
        else:
            lk = key(bk, 'l', i)
            defs.append({'_type': 'link', '_key': lk, 'href': m.group(3)})
            children.append({'_type': 'span', '_key': key(bk, i), 'text': m.group(2), 'marks': [lk]}); i += 1
        pos = m.end()
    if pos < len(text):
        children.append({'_type': 'span', '_key': key(bk, i), 'text': text[pos:], 'marks': []})
    return children, defs

def parse(path, slug):
    lines = open(path).read().splitlines()
    title = lines[0][2:].strip()
    effective = lines[1].strip()
    body = []
    for n, raw in enumerate(lines[2:]):
        line = raw.rstrip()
        if not line.strip():
            continue
        bk = key(slug, n)
        if line.startswith('### '):
            ch, defs = spans(line[4:], bk); body.append({'_type': 'block', '_key': bk, 'style': 'h3', 'markDefs': defs, 'children': ch})
        elif line.startswith('  - '):
            ch, defs = spans(line[4:], bk); body.append({'_type': 'block', '_key': bk, 'style': 'normal', 'listItem': 'bullet', 'level': 2, 'markDefs': defs, 'children': ch})
        elif line.startswith('- '):
            ch, defs = spans(line[2:], bk); body.append({'_type': 'block', '_key': bk, 'style': 'normal', 'listItem': 'bullet', 'level': 1, 'markDefs': defs, 'children': ch})
        else:
            ch, defs = spans(line, bk); body.append({'_type': 'block', '_key': bk, 'style': 'normal', 'markDefs': defs, 'children': ch})
    return title, effective, body

PAGES = [
    ('privacy', 'privacy.md', 'How SBWPC collects, uses and protects information from donors, members, subscribers and site visitors.'),
    ('terms', 'terms.md', 'The terms for using sbwpc.org, including contributions, endorsements and content.'),
    ('cookies', 'cookies.md', 'The cookies used on sbwpc.org, why they are there and how to change your choice.'),
]
docs = {}
for slug, f, desc in PAGES:
    title, effective, body = parse(f'handoff/policies/{f}', slug)
    docs[f'page-{slug}'] = {
        '_id': f'page-{slug}', '_type': 'page', 'title': title, 'path': slug,
        'hero': {'_type': 'hero', 'heading': title, 'body': effective, 'tone': 'cream'},
        'sections': [{'_type': 'sectionText', '_key': key(slug, 'text'), 'tone': 'white', 'body': body}],
        'seo': {'_type': 'seo', 'title': title, 'description': desc},
    }

def write(path, add_new):
    out, seen = [], set()
    for l in open(path):
        if not l.strip():
            out.append(l); continue
        d = json.loads(l)
        if d['_id'] in docs:
            d = docs[d['_id']]; seen.add(d['_id'])
        out.append(json.dumps(d, ensure_ascii=False) + '\n')
    if add_new:
        for i, d in docs.items():
            if i not in seen: out.append(json.dumps(d, ensure_ascii=False) + '\n')
    open(path, 'w').write(''.join(out))

write('seed/data.ndjson', True)
for p in glob.glob('seed/parts/*.ndjson'):
    write(p, p.endswith('I.ndjson'))
print('ok', list(docs))
