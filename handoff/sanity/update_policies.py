#!/usr/bin/env python3
"""Copy the Privacy, Cookie and Terms page text from seed/data.ndjson into Sanity.

The live site reads its content from Sanity, so a change to the policy text in the seed file
does not reach the site until it is copied across. Only the body of each page (its sections)
is replaced. Titles, hero and SEO fields are left alone.

Usage (from sbwpc-site/):
  python3 handoff/sanity/update_policies.py check   # show what would change, change nothing
  python3 handoff/sanity/update_policies.py apply   # make the change

Needs handoff/sanity/.env (never committed) with SANITY_AUTH_TOKEN (Editor access).
`check` works without a token as long as the dataset is public.
"""
import difflib, json, os, sys, urllib.parse, urllib.request
from pathlib import Path

PROJECT_ID = "coo0nu6y"
DATASET = "production"
API = f"https://{PROJECT_ID}.api.sanity.io/v2025-02-19/data"
ROOT = Path(__file__).resolve().parents[2]
PAGES = ["page-privacy", "page-cookies", "page-terms"]


def token():
    f = Path(__file__).with_name(".env")
    if f.exists():
        for line in f.read_text().splitlines():
            if line.startswith("SANITY_AUTH_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("SANITY_AUTH_TOKEN", "")


def call(path, body=None):
    req = urllib.request.Request(f"{API}/{path}", data=json.dumps(body).encode() if body else None)
    if body:
        req.add_header("Content-Type", "application/json")
    if token():
        req.add_header("Authorization", f"Bearer {token()}")
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.load(res)


def text_of(sections):
    """Plain text of a page body, one block per line, for a readable comparison."""
    out = []
    for s in sections or []:
        for key in ("heading", "intro"):
            if s.get(key):
                out.append(str(s[key]))
        for block in s.get("body") or []:
            if block.get("_type") == "block":
                links = {m["_key"]: m.get("href", "") for m in block.get("markDefs") or []}
                line = "".join(c.get("text", "") for c in block.get("children") or [])
                hrefs = sorted({links[m] for c in block.get("children") or [] for m in c.get("marks") or [] if m in links})
                out.append(line + (" <" + " ".join(hrefs) + ">" if hrefs else ""))
    return out


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    if step not in ("check", "apply"):
        sys.exit(__doc__)
    seed = {}
    for line in (ROOT / "seed" / "data.ndjson").read_text().splitlines():
        d = json.loads(line)
        if d.get("_id") in PAGES:
            seed[d["_id"]] = d
    query = urllib.parse.quote('*[_id in $ids]{_id, _rev, _updatedAt, sections}')
    ids = urllib.parse.quote(json.dumps(PAGES))
    live = {d["_id"]: d for d in call(f"query/{DATASET}?query={query}&%24ids={ids}")["result"]}
    mutations = []
    for pid in PAGES:
        if pid not in live:
            print(f"{pid}: not found in Sanity, skipped")
            continue
        old, new = text_of(live[pid].get("sections")), text_of(seed[pid]["sections"])
        diff = [l for l in difflib.unified_diff(old, new, "on the site now", "after the update", lineterm="", n=0) if not l.startswith(("---", "+++", "@@"))]
        print(f"\n{pid} (last changed in Sanity {live[pid]['_updatedAt'][:10]}): {len(diff)} changed lines")
        for l in diff:
            print("  " + l[:300])
        if diff:
            mutations.append({"patch": {"id": pid, "ifRevisionID": live[pid]["_rev"], "set": {"sections": seed[pid]["sections"]}}})
    if step == "check" or not mutations:
        print("\nNothing was changed." if step == "check" else "\nAlready up to date.")
        return
    if not token():
        sys.exit("Missing SANITY_AUTH_TOKEN in handoff/sanity/.env")
    res = call(f"mutate/{DATASET}?returnIds=true", {"mutations": mutations})
    print("\nUpdated:", ", ".join(r["id"] for r in res.get("results", [])))
    print("Sanity publishes straight away, and the publish hook rebuilds the site.")


if __name__ == "__main__":
    main()
