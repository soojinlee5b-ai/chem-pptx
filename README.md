# Chem PPTX

A Codex skill that converts screenshots to grayscale, inverts their colors, and appends them to an existing PowerPoint deck.

## Features

- Converts screenshots to grayscale and inverted colors
- Adds one image per slide
- Uses blank slides with solid black backgrounds
- Preserves existing slides
- Uses a preferred image width of 30 cm
- Automatically scales tall images to fit the slide height
- Preserves image aspect ratio
- Creates a new PPTX instead of overwriting the source

## Install

Install with GitHub CLI:

```bash
gh skill install soojinlee5b-ai/chem-pptx screenshot-to-dark-pptx --agent codex --scope user

