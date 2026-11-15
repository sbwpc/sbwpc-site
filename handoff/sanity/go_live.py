#!/usr/bin/env python3
"""SBWPC Sanity go-live: install, import seed content, deploy the Studio, verify.

Usage (from sbwpc-site/):
  python3 handoff/sanity/go_live.py check     # install + build only, no changes to Sanity
  python3 handoff/sanity/go_live.py import    # import seed/ into the production dataset
  python3 handoff/sanity/go_live.py deploy    # deploy the Studio to sbwpc.sanity.studio
  python3 handoff/sanity/go_live.py verify    # count documents by type in Sanity

Needs handoff/sanity/.env (never committed) with:
  SANITY_AUTH_TOKEN=<API token with Editor access; Deploy Studio for deploy>
"""
import json, os, shutil, subprocess, sys, urllib.request
from pathlib import Path

PROJECT_ID = "coo0nu6y"
DATASET = "production"
ROOT = Path(__file__).resolve().parents[2]
STUDIO = ROOT / "studio"
SEED = ROOT / "seed"
WORK = STUDIO


def load_env():
    env = dict(os.environ)
    f = Path(__file__).with_name(".env")
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env["SANITY_STUDIO_PROJECT_ID"] = PROJECT_ID
    env["SANITY_STUDIO_DATASET"] = DATASET
    if env.get("SANITY_AUTH_TOKEN"):
        env["SANITY_AUTH_TOKEN"] = env["SANITY_AUTH_TOKEN"]
    return env


def run(cmd, cwd, env, check=True):
    print("+", " ".join(cmd), flush=True)
    r = subprocess.run(cmd, cwd=cwd, env=env)
    if check and r.returncode:
        sys.exit(f"Step failed: {' '.join(cmd)}")


def prepare(env):
    """Install the Studio dependencies once."""
    if not (WORK / "node_modules" / ".bin" / "sanity").exists():
        run(["npm", "ci", "--no-audit", "--no-fund"], WORK, env)


def need_token(env):
    if not env.get("SANITY_AUTH_TOKEN"):
        sys.exit("Missing SANITY_AUTH_TOKEN in handoff/sanity/.env")


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else "check"
    env = load_env()
    prepare(env)
    if step == "check":
        run(["npx", "sanity", "build", "--yes"], WORK, env)
        print("Studio builds cleanly.")
    elif step == "import":
        need_token(env)
        # Local image paths (./images/...) are only uploaded when the importer gets a tarball
        # that holds data.ndjson and images/ together, so build one in a temp folder.
        import tempfile
        tmp = Path(tempfile.mkdtemp(prefix="sbwpc-seed-"))
        tarball = tmp / "seed.tar.gz"
        run(["tar", "-czf", str(tarball), "-C", str(SEED), "data.ndjson", "images"], ROOT, env)
        run(["npx", "sanity", "dataset", "import", str(tarball), "--dataset", DATASET, "--replace"], WORK, env)
    elif step == "deploy":
        need_token(env)
        run(["npx", "sanity", "deploy", "--yes"], WORK, env)
    elif step == "verify":
        need_token(env)
        groq = 'count(*[!(_type match "system.*") && !(_id in path("_.**"))])'
        url = f"https://{PROJECT_ID}.api.sanity.io/v2025-02-19/data/query/{DATASET}?query=" + urllib.request.quote(groq)
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {env['SANITY_AUTH_TOKEN']}"})
        print("Documents in dataset:", json.load(urllib.request.urlopen(req))["result"], "(seed has 163)")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
