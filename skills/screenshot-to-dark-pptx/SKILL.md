---
name: screenshot-to-dark-pptx
description: Convert screenshot images to grayscale with inverted colors and append them to an existing PPTX as one image per new black, blank slide. Use for repeated screenshot-to-PowerPoint workflows where the original slides must remain unchanged and new slides must be added only after the last slide.
---

# Screenshot To Dark PPTX

Create a new PPTX from the supplied deck. Never overwrite the source unless the user explicitly asks, and make a backup first if they do.

## Inputs

Require:

- One source `.pptx` file.
- One or more screenshot image files, or a directory containing them.

Sort screenshots by filename with numeric-aware Korean locale ordering unless the user specifies another order. Confirm the resolved image count and first/last filenames before authoring.

## Workflow

1. Load the Presentations skill and its local-editing instructions before changing a PPTX.
2. Call `load_workspace_dependencies` and use the bundled Node.js, Python, and Node modules.
3. Mark the presentation edit operation exactly once as required by the Presentations skill.
4. Run `scripts/append_inverted_screenshots.mjs` in a private build directory. Pass the source PPTX, image files or directories, a new output path, the installed Presentations skill directory, and the bundled Python executable.
5. Render and inspect every appended slide. Compare representative original slides before and after to confirm that existing content did not change.
6. Verify the final PPTX slide count equals the original count plus the image count. Each appended slide must contain exactly one image and no text, shapes, charts, or tables.

## Required output

- Convert each screenshot to grayscale, then invert its colors.
- Append one new slide per transformed image after the final existing slide.
- Use a blank layout with no placeholders or added decoration.
- Set each new slide background to solid black (`#000000`).
- Preserve image aspect ratio.
- Default to 30 cm image width at the top-left corner, matching the established workflow. If the proportional image height would exceed the usable slide height, scale both dimensions down proportionally until the image height fits the slide. On a standard 16:9 slide with no top offset, the maximum height is 19.05 cm. Honor user-specified width, position, or alignment instead.
- Do not modify, replace, reorder, or delete existing slides.
- Produce a new output file by default.

## Script usage

```bash
node scripts/append_inverted_screenshots.mjs \
  --pptx /absolute/path/source.pptx \
  --image-dir /absolute/path/screenshots \
  --output /absolute/path/output.pptx \
  --presentation-skill-dir /absolute/path/presentations/skills/presentations \
  --python /absolute/path/python3
```

Repeat `--image` or `--image-dir` as needed. Optional placement flags are `--width-cm`, `--left-cm`, `--top-cm`, and `--align left|center|right`. Explicit `--left-cm` takes precedence over `--align`.
