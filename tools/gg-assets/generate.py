#!/usr/bin/env python3
"""Goated Goddess 1000 asset generator (Nano Banana Pro via the Gemini API).

Reads manifest.json, generates every asset with its reference images attached in order
(first ref = "Image 1"), keeps variants in output/<JOB>/, and writes finished, keyed and
resized files to final/ once a variant is approved.

Commands
  python generate.py list                      status of every job and what it waits on
  python generate.py dry-run [JOB ...]         print prompts + attachments, no API calls
  python generate.py run [JOB ...]             generate everything runnable (or just JOBs)
      --auto-approve                           approve v1 of every job and run the whole chain
      --variants N                             override variant count
      --force                                  regenerate even if variants exist
  python generate.py approve JOB vN            pick a variant; post-processes into final/
  python generate.py sheet [GROUP]             contact sheet(s) of variants for review
  python generate.py finalize                  redo post-processing for all approved jobs

Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment. Model override: GG_MODEL.
"""
import argparse, json, os, sys, time, shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
JOBS = {j["id"]: j for j in MANIFEST["jobs"]}
OUT, FINAL = ROOT / "output", ROOT / "final"
STATE_FILE = OUT / "state.json"

# ---------------------------------------------------------------- state
def load_state():
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}

def save_state(s):
    OUT.mkdir(exist_ok=True)
    STATE_FILE.write_text(json.dumps(s, indent=2))

def deps(job):
    return [r["job"] for r in job["refs"] if isinstance(r, dict)]

def approved_path(state, jid):
    st = state.get(jid, {})
    return OUT / jid / f"{st['approved']}.png" if st.get("approved") else None

def runnable(state, job):
    return all(approved_path(state, d) for d in deps(job))

def full_prompt(job):
    p = job["prompt"]
    return p + "\n\n" + MANIFEST["master_style"] if job.get("append_master") else p

def ref_paths(state, job):
    out = []
    for r in job["refs"]:
        out.append(approved_path(state, r["job"]) if isinstance(r, dict) else ROOT / r)
    return out

# ---------------------------------------------------------------- API
_client = None
def client():
    global _client
    if _client is None:
        from google import genai
        key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not key:
            sys.exit("Set GEMINI_API_KEY (your AI Studio key) in the environment first.")
        _client = genai.Client(api_key=key)
    return _client

def generate_one(job, refs, dest, retries=3):
    from google.genai import types
    model = os.environ.get("GG_MODEL", MANIFEST["model"])
    contents = [Image.open(p) for p in refs] + [full_prompt(job)]
    cfg = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(aspect_ratio=job["aspect"], image_size=job["size"]),
    )
    last = None
    for attempt in range(1, retries + 1):
        try:
            resp = client().models.generate_content(model=model, contents=contents, config=cfg)
            texts = []
            for part in resp.parts or []:
                if part.inline_data is not None:
                    part.as_image().save(dest)
                    return True
                if part.text:
                    texts.append(part.text)
            last = "no image returned. " + " ".join(texts)[:400]
        except Exception as e:  # rate limits, transient errors
            last = f"{type(e).__name__}: {e}"
        print(f"    attempt {attempt} failed: {last}")
        time.sleep(5 * attempt)
    (dest.parent / f"{dest.stem}.error.txt").write_text(str(last))
    return False

# ---------------------------------------------------------------- post-processing
def key_green(img: Image.Image, lo=30, hi=110, warm_w=0.7) -> Image.Image:
    """Remove a flat #00FF00 background: alpha from green excess, un-mix edges, despill.
    Warm glows (coronas, flames) come back from the model blended into the green as dull
    olive; those pixels get alpha from green over 0.7x red instead and are pushed back to orange."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = 1.0 - np.clip((g - np.maximum(r, b) - lo) / (hi - lo), 0, 1)
    olive = (g >= 0.75 * r) & (r < 200) & (r > b + 60) & (g > b + 60)
    alpha2 = 1.0 - np.clip((g - warm_w * r - lo) / (hi - lo), 0, 1)
    alpha = np.where(olive, np.minimum(alpha, alpha2), alpha)
    key = np.array([0, 255, 0], np.float32)
    safe = np.maximum(alpha, 1e-3)[..., None]
    fg = (a - (1 - alpha)[..., None] * key) / safe          # un-mix partially keyed edges
    fg = np.clip(fg, 0, 255)
    fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))  # despill
    fg[..., 2] = np.where(olive, np.minimum(fg[..., 2], b), fg[..., 2])     # no magenta rim
    fg[..., 1] = np.where(olive, np.minimum(fg[..., 1], 0.6 * fg[..., 0]), fg[..., 1])  # olive -> orange
    out = np.dstack([fg, alpha * 255]).astype(np.uint8)
    out[alpha < 0.02] = 0
    return Image.fromarray(out, "RGBA")

def finalize_job(jid, state):
    job, src = JOBS[jid], approved_path(state, jid)
    dest = FINAL / job["dest"]
    dest.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(src)
    if job["post"] == "key_green":
        img = key_green(img)
    if job.get("final_px"):
        img = img.resize(tuple(job["final_px"]), Image.LANCZOS)
    img.save(dest, optimize=True)
    print(f"    final -> {dest.relative_to(ROOT)}")

def approve(jid, variant, state, quiet=False):
    p = OUT / jid / f"{variant}.png"
    if not p.exists():
        sys.exit(f"{p} does not exist")
    state.setdefault(jid, {})["approved"] = variant
    save_state(state)
    if not quiet:
        print(f"approved {jid} = {variant}")
    finalize_job(jid, state)

# ---------------------------------------------------------------- commands
def cmd_list(_):
    state = load_state()
    for j in MANIFEST["jobs"]:
        st = state.get(j["id"], {})
        if st.get("approved"):
            status = f"approved {st['approved']}"
        elif st.get("variants"):
            status = f"awaiting approval ({', '.join(st['variants'])})"
        elif runnable(state, j):
            status = "ready"
        else:
            status = "waits on " + ", ".join(d for d in deps(j) if not approved_path(state, d))
        print(f"{j['id']:18} {j['group']:12} {j['aspect']:5} {j['size']:3} x{j['variants']}  {status}")

def cmd_dry(args):
    state = load_state()
    for jid in args.jobs or JOBS:
        j = JOBS[jid]
        print(f"=== {jid}: {j['title']}  [{j['aspect']}, {j['size']}, x{j['variants']}]")
        for i, r in enumerate(j["refs"], 1):
            label = f"approved {r['job']}" if isinstance(r, dict) else r
            print(f"  Image {i}: {label}")
        print(full_prompt(j), "\n")

def cmd_run(args):
    state = load_state()
    targets = args.jobs or [j["id"] for j in MANIFEST["jobs"]]
    done_now = set()
    progress = True
    while progress:
        progress = False
        for jid in targets:
            job, st = JOBS[jid], state.setdefault(jid, {})
            if jid in done_now or (st.get("variants") and not args.force):
                continue
            if not runnable(state, job):
                continue
            n = args.variants or job["variants"]
            (OUT / jid).mkdir(parents=True, exist_ok=True)
            print(f"[{jid}] {job['title']}  ({n} variant{'s' if n > 1 else ''})")
            if st.pop("approved", None):
                print("    note: replacing an approved version; re-run jobs that used it as a reference")
            refs = ref_paths(state, job)
            made = []
            for k in range(1, n + 1):
                dest = OUT / jid / f"v{k}.png"
                if generate_one(job, refs, dest):
                    made.append(f"v{k}")
                    print(f"    saved {dest.relative_to(ROOT)}")
            st["variants"] = made
            save_state(state)
            if not made:
                print(f"    {jid} failed; see output/{jid}/*.error.txt")
                continue
            if args.auto_approve or not job.get("anchor"):
                approve(jid, made[0], state, quiet=True)
                if job.get("check_text"):
                    print(f"    CHECK SPELLING: {job['check_text']}")
            else:
                print(f"    -> review output/{jid}/ then: python generate.py approve {jid} v1")
            done_now.add(jid)
            progress = True
    waiting = [j for j in targets if state.get(j, {}).get("variants") and not state[j].get("approved")]
    blocked = [j for j in targets if not state.get(j, {}).get("variants") and not runnable(state, JOBS[j])]
    if waiting:
        print("\nAwaiting your approval:", ", ".join(waiting))
    if blocked:
        print("Blocked until those are approved:", ", ".join(blocked))
    if not waiting and not blocked:
        print("\nAll requested jobs are done. Finished files are in final/.")

def cmd_approve(args):
    approve(args.job, args.variant, load_state())

def cmd_sheet(args):
    state = load_state()
    groups = [args.group] if args.group else sorted({j["group"] for j in MANIFEST["jobs"]})
    for g in groups:
        tiles = []
        for j in MANIFEST["jobs"]:
            if j["group"] != g:
                continue
            for v in state.get(j["id"], {}).get("variants", []):
                im = Image.open(OUT / j["id"] / f"{v}.png").convert("RGB")
                im.thumbnail((360, 360))
                t = Image.new("RGB", (380, 400), (30, 26, 40))
                t.paste(im, ((380 - im.width) // 2, 10))
                mark = " *" if state[j["id"]].get("approved") == v else ""
                ImageDraw.Draw(t).text((10, 378), f"{j['id']} {v}{mark}", fill=(230, 230, 230))
                tiles.append(t)
        if not tiles:
            continue
        cols = min(5, len(tiles))
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 380, rows * 400), (16, 18, 31))
        for i, t in enumerate(tiles):
            sheet.paste(t, ((i % cols) * 380, (i // cols) * 400))
        dest = OUT / f"contact_{g}.png"
        sheet.save(dest)
        print(f"wrote {dest.relative_to(ROOT)}")

def cmd_finalize(_):
    state = load_state()
    for jid in JOBS:
        if approved_path(state, jid):
            print(jid)
            finalize_job(jid, state)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    p = sub.add_parser("dry-run"); p.add_argument("jobs", nargs="*"); p.set_defaults(fn=cmd_dry)
    p = sub.add_parser("run"); p.add_argument("jobs", nargs="*")
    p.add_argument("--auto-approve", action="store_true"); p.add_argument("--variants", type=int)
    p.add_argument("--force", action="store_true"); p.set_defaults(fn=cmd_run)
    p = sub.add_parser("approve"); p.add_argument("job"); p.add_argument("variant"); p.set_defaults(fn=cmd_approve)
    p = sub.add_parser("sheet"); p.add_argument("group", nargs="?"); p.set_defaults(fn=cmd_sheet)
    sub.add_parser("finalize").set_defaults(fn=cmd_finalize)
    args = ap.parse_args()
    for jid in getattr(args, "jobs", []) or []:
        if jid not in JOBS:
            sys.exit(f"Unknown job {jid}. Run: python generate.py list")
    args.fn(args)

if __name__ == "__main__":
    main()
