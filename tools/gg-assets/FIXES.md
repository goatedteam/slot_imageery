# Art review fixes (4 regenerations)

Copy this folder over the repo (it replaces `tools/gg-assets/manifest.json` and adds 2 files to `refs/`).
Nothing else changes. The new references are static files, so these jobs don't depend on `output/`.

| Job | Problem | Fix in the prompt |
| --- | --- | --- |
| L1, L2, L3 | Lows don't read as moon phases: L2 is a crescent with a line, L3 is a full disc inside a crescent, and at 96 px L1/L2 and L3/L4 look alike. L1 also has a warm copper rim | Solid filled silver phases matching L4 (25/50/75% lit), cool rim, L4 as style anchor |
| SC | Sits on a silver disc like the lows, with a grey bar baked into the bottom | Free-floating corona, no disc or bar, H4 as style anchor |

Run in Claude Code:

    python generate.py run L1 L2 L3 SC --force
    python generate.py sheet symbols

Each job makes 2 variants and auto-approves v1. Look at the contact sheet, switch any with
`python generate.py approve L2 v2`, check the lows at 96 px, then copy the new files from `final/`
over the matching ones in `assets/eclipse/symbols/`. 8 images in total.
