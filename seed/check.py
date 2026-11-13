#!/usr/bin/env python3
"""Validate seed NDJSON against the dumped Sanity schema. Usage: check.py file.ndjson [more.ndjson]"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, 'schema.json')))
PRIMS = {'string', 'text', 'number', 'boolean', 'url', 'date', 'datetime', 'slug'}
VALID_PATHS = set(
    """home about/history about/board about/committees about/positions about/seat-at-the-table contact
elections elections/endorsements elections/past elections/candidate-corner elections/endorsement-process
elections/request-endorsement elections/campaign-finance elections/governors-race elections/candidate-forums
take-action take-action/boards-and-commissions take-action/letters-and-statements advocacy advocacy/playbook
advocacy/legislator-interviews advocacy/era advocacy/election-protection advocacy/explainers
advocacy/explainers/ice-santa-barbara-county advocacy/explainers/ice-ventura-county advocacy/explainers/sable-oil
advocacy/explainers/vc-defensa advocacy/explainers/voting-rights-act advocacy/explainers/camino-dolores-huerta
events events/gallery news join donate get-involved/run-for-office""".split()
)
errors = []
ids = {}
event_slugs, post_slugs = set(), set()
internal_links = []


def err(loc, msg):
    errors.append(f'{loc}: {msg}')


def check_image(v, loc):
    if not isinstance(v, dict):
        return err(loc, 'image must be an object')
    a = v.get('_sanity_asset') or (v.get('asset') or {}).get('_ref')
    if not a:
        return err(loc, 'image missing _sanity_asset')
    m = re.match(r'image@file://\./images/(.+)$', a)
    if m and not os.path.exists(os.path.join(HERE, 'images', m.group(1))):
        err(loc, f'image file not found: {a}')
    if not m and not a.startswith('image@http') and not a.startswith('image-'):
        err(loc, f'bad image reference {a}')
    for k in v:
        if k not in ('_type', '_key', '_sanity_asset', 'alt', 'caption', 'asset', 'hotspot', 'crop'):
            err(loc, f'unknown image key {k}')


def collect_link(url, loc):
    if isinstance(url, str) and url.startswith('/'):
        internal_links.append((url, loc))
    if isinstance(url, str) and 'sbwpc.org/' in url and not url.startswith('mailto:') and '@sbwpc.org' not in url:
        err(loc, f'old absolute sbwpc.org link, use a new relative path: {url}')


def check_portable(v, loc):
    if not isinstance(v, list):
        return err(loc, 'richText must be an array')
    keys = set()
    for i, b in enumerate(v):
        l = f'{loc}[{i}]'
        if not isinstance(b, dict):
            err(l, 'block must be object'); continue
        if '_key' not in b: err(l, 'missing _key')
        elif b['_key'] in keys: err(l, 'duplicate _key')
        keys.add(b.get('_key'))
        if b.get('_type') == 'imageWithAlt':
            check_image(b, l); continue
        if b.get('_type') != 'block':
            err(l, f'unexpected block type {b.get("_type")}'); continue
        if b.get('style', 'normal') not in ('normal', 'h3', 'h4', 'blockquote'):
            err(l, f'bad style {b.get("style")}')
        mdefs = {m.get('_key'): m for m in b.get('markDefs', [])}
        for m in mdefs.values():
            if m.get('_type') != 'link': err(l, 'markDef must be link')
            collect_link(m.get('href'), l)
        if not isinstance(b.get('children'), list) or not b['children']:
            err(l, 'block needs children'); continue
        for j, s in enumerate(b['children']):
            if s.get('_type') != 'span' or '_key' not in s or not isinstance(s.get('text'), str):
                err(f'{l}.children[{j}]', 'bad span (needs _type span, _key, text)')
            for mk in s.get('marks', []):
                if mk not in ('strong', 'em') and mk not in mdefs:
                    err(f'{l}.children[{j}]', f'mark {mk} has no markDef')


def check_value(spec, v, loc):
    t = spec['type']
    if t in PRIMS:
        if t == 'slug':
            if not (isinstance(v, dict) and isinstance(v.get('current'), str) and re.match(r'^[a-z0-9-]+$', v['current'])):
                err(loc, 'slug must be {"_type":"slug","current":"lower-case-dashes"}')
            return
        if t in ('number',) and not isinstance(v, (int, float)): err(loc, 'expected number')
        elif t == 'boolean' and not isinstance(v, bool): err(loc, 'expected boolean')
        elif t in ('string', 'text', 'url') and not isinstance(v, str): err(loc, f'expected {t} string')
        elif t == 'date' and not (isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}$', v)): err(loc, 'date must be YYYY-MM-DD')
        elif t == 'datetime' and not (isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', v)): err(loc, 'datetime must be ISO')
        if t == 'url' and isinstance(v, str) and not re.match(r'^(https?://|mailto:|tel:)', v): err(loc, f'url field needs full address: {v}')
        if spec.get('options') and isinstance(v, str) and v not in spec['options'] and t == 'string':
            err(loc, f'value {v!r} not in options {spec["options"]}')
        if t == 'string' and loc.endswith('.url'): collect_link(v, loc)
        return
    if t == 'array':
        if not isinstance(v, list): return err(loc, 'expected array')
        allowed = {o['name']: o for o in spec['of']}
        keys = set()
        for i, item in enumerate(v):
            l = f'{loc}[{i}]'
            if 'string' in allowed and isinstance(item, str):
                continue
            if not isinstance(item, dict):
                err(l, 'array item must be an object'); continue
            if '_key' not in item: err(l, 'missing _key')
            elif item['_key'] in keys: err(l, 'duplicate _key')
            keys.add(item.get('_key'))
            it = item.get('_type')
            if it not in allowed and not (len(allowed) == 1 and it is None):
                err(l, f'_type {it!r} not allowed here (allowed: {list(allowed)})'); continue
            o = allowed.get(it) or list(allowed.values())[0]
            if o.get('fields'):
                check_fields(o['fields'], item, l)
            else:
                check_named(o['type'], item, l)
        return
    if t == 'object':
        if not isinstance(v, dict): return err(loc, 'expected object')
        return check_fields(spec['fields'], v, loc)
    check_named(t, v, loc)


def check_named(name, v, loc):
    if name in ('imageWithAlt', 'image'):
        return check_image(v, loc)
    if name == 'richText':
        return check_portable(v, loc)
    d = S.get(name)
    if not d:
        return err(loc, f'unknown type {name}')
    if not isinstance(v, dict):
        return err(loc, f'{name} must be an object')
    check_fields(d['fields'], v, loc)


def check_fields(fields, obj, loc):
    for k, val in obj.items():
        if k.startswith('_'):
            continue
        if k not in fields:
            err(loc, f'unknown field {k!r} (allowed: {sorted(fields)})'); continue
        check_value(fields[k], val, f'{loc}.{k}')


for fn in sys.argv[1:]:
    for n, line in enumerate(open(fn), 1):
        line = line.strip()
        if not line: continue
        loc = f'{os.path.basename(fn)}:{n}'
        try:
            d = json.loads(line)
        except Exception as e:
            err(loc, f'invalid JSON {e}'); continue
        _id, _t = d.get('_id'), d.get('_type')
        if not _id or not _t: err(loc, 'missing _id or _type'); continue
        if _id in ids: err(loc, f'duplicate _id {_id} (also {ids[_id]})')
        ids[_id] = loc
        loc = f'{loc} {_id}'
        if _t not in S or S[_t]['base'] != 'document': err(loc, f'unknown document type {_t}'); continue
        check_fields(S[_t]['fields'], d, loc)
        if _t == 'page' and d.get('path') not in VALID_PATHS: err(loc, f'path {d.get("path")!r} not in sitemap')
        if _t == 'event' and d.get('slug'): event_slugs.add(d['slug'].get('current'))
        if _t == 'post' and d.get('slug'): post_slugs.add(d['slug'].get('current'))

for url, loc in internal_links:
    p = url.split('#')[0].split('?')[0].strip('/')
    if p == '': continue
    if p in VALID_PATHS: continue
    if p.startswith('events/') or p.startswith('news/'): continue  # checked across batches at merge time
    err(loc, f'internal link to unknown path /{p}')

if errors:
    print(f'{len(errors)} problem(s):')
    for e in errors[:200]:
        print(' -', e)
    sys.exit(1)
print(f'OK: {len(ids)} documents')
