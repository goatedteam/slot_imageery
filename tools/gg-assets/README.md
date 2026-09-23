# Goated Goddess 1000: Eclipse asset pack generator

Generates all 27 redesigned assets (symbols, Corona Ember tiers, VFX, Occulta and poses,
backgrounds, pillar, logo) with Nano Banana Pro, using the original assets as references.

1. Unzip this folder and open it in Claude Code.
2. Tell it: "Read CLAUDE.md and generate all the images."
3. It will ask whether you want to review the anchor images or run fully automatic.

Manual use:
    pip install -r requirements.txt
    export GEMINI_API_KEY=...        # your AI Studio key
    python generate.py list
    python generate.py run           # add --auto-approve to run everything in one go
    python generate.py sheet         # contact sheets for review
    python generate.py approve L1 v2

Finished files land in `final/`. Prompts are in `manifest.json` (machine) and `prompts.md` (human).
