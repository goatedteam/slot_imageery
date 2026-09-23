# Goated Goddess 1000: asset generation (instructions for Claude Code)

You are generating the Eclipse-theme art for the slot game Goated Goddess 1000 with Nano Banana Pro
(Gemini 3 Pro Image) through the user's Google AI Studio API key.

## Files
- `manifest.json`: source of truth. 27 jobs, each with its prompt, reference images in order
  (first ref = "Image 1"), aspect ratio, size, variant count and post-processing.
  `{"job": "L1"}` as a ref means "the approved output of job L1".
- `prompts.md`: the same prompts in readable form, with the original assets linked.
- `refs/`: the original game assets used as Image 1 references.
- `generate.py`: the pipeline. Run `python generate.py --help`.
- `output/<JOB>/vN.png`: raw variants. `final/`: keyed, resized, ready-to-use files.

## Setup
1. `pip install -r requirements.txt`
2. The script reads the key from `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). If the user's key only lives
   inside a Nano Banana MCP server config, ask them to export it in this shell. Never print it,
   write it to a file, or commit it.
3. `python generate.py list` and `python generate.py dry-run L1` to confirm everything loads.
4. If the API returns model-not-found, run a quick `client.models.list()` and set `GG_MODEL`
   to the current Nano Banana Pro image model id.

## Workflow
Ask the user once, before spending anything: **review the anchors, or fully automatic?**
The run is about 35 images at default variant counts.

**Review mode (recommended).** Five jobs are anchors whose look every later job copies:
L1 (symbol style), EMBER (multiplier), HERO and FACE_SHEET (Occulta), BG_BASE (backgrounds).
1. `python generate.py run` generates everything currently unblocked.
2. `python generate.py sheet` writes `output/contact_<group>.png`. Open them, look at the
   variants, recommend one per anchor with a one-line reason, and let the user choose.
3. `python generate.py approve L1 v2` (etc.) for each choice, then `run` again.
   Repeat until `list` shows every job approved.

**Automatic mode.** `python generate.py run --auto-approve` approves v1 of every job and runs
the whole chain in dependency order.

## Quality checks after each batch (view the images yourself)
- Symbols: lows must look flat, matte and cool; highs glowing and premium. Preview at 96 px.
- Keyed PNGs in `final/`: no green fringe or green tint. If there is, re-run that job.
- H4 mask must not read as a crown; H2 astrolabe must not read as a finger ring.
- LOGO: must spell GOATED GODDESS / 1000 / ECLIPSE exactly. Regenerate, never hand-fix letters.
- Occulta poses: same face as FACE_SHEET, same outfit as HERO.
- To redo one job: `python generate.py run H3 --force` (add `--variants 3` for options).
  If you redo an anchor, re-run the jobs that reference it (see `list`).

## Rules
- Never attach `dana-deity.webp` or any photo of a real person to any request. Occulta is
  generated from text only.
- Don't rewrite prompts silently. If a prompt needs a change, show the user the edit to
  `manifest.json` first.
- When done, copy `final/` into the game repo (suggested: `assets/eclipse/`) and list what
  landed where. The board frame is an SVG in code, not an image job.
