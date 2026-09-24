<p align="center">
  <img src="../assets/icon.png" alt="MinerU Converter icon" width="96" />
</p>

# MinerU Converter — Obsidian Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/github/v/release/liyifan2004/obsidian-mineru-converter?style=flat-square)](https://github.com/liyifan2004/obsidian-mineru-converter/releases)

Right-click any PDF / Word / PPT / Excel / image in your vault and convert it to editable Markdown via the [MinerU](https://mineru.net/apiManage/docs) accurate-parse API.

## Features

- 🖱 **Right-click → Convert** on any supported file in the file explorer.
- 📂 **Saves alongside the original** — `essay.pdf` becomes `essay.md`.
- 🛡 **Conflict prompt** if a `.md` already exists (overwrite / skip / cancel).
- 📊 **Live progress modal** with cancel button and time elapsed.
- 🧩 **Auto-splits oversized PDFs** — a PDF longer than MinerU's 200-page limit is split into parts, parsed by the API, and merged back into a single `.md` with one shared `images/` folder.
- 🌍 **i18n** — auto-follows your Obsidian UI language (English + Simplified Chinese out of the box; structure ready for more).
- 🔌 **Self-hosted API key** — your token stays in your vault; the plugin calls MinerU directly with no middleman.

## Supported file types

PDF · Word (`.doc` / `.docx`) · PowerPoint (`.ppt` / `.pptx`) · Excel (`.xls` / `.xlsx`) · Images (`.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` / `.bmp` / `.jp2`) · HTML (`.html` / `.htm`)

## Quick start

1. Apply for a MinerU API token at <https://mineru.net/apiManage/apiManage> (free tier available).
2. In Obsidian → **Settings → Community plugins → MinerU Converter**, paste the token.
3. Click **Test connection** to verify.
4. Right-click any supported file in your vault → **Convert to Markdown via MinerU**.
5. A `.md` file appears next to the original; the plugin will ask if you want to open it.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| API Token | — | Required. Get from <https://mineru.net/apiManage/apiManage>. |
| Model version | `vlm` | `vlm` = highest accuracy; `pipeline` = legacy default; `MinerU-HTML` = required for HTML inputs. |
| Document language | `ch` | OCR hint. `ch` = Chinese + English; other options cover Japanese / Korean / Latin-script / Traditional Chinese. |
| Recognize formulas | ✅ | Outputs math as LaTeX-style. For `vlm`, only affects inline formulas. |
| Recognize tables | ✅ | Outputs as Markdown tables. |
| Auto-split oversized PDFs | ✅ | Split PDFs over 200 pages into parts, parse each, merge the results into one file. |

## Limits (from the MinerU API)

- 200 MB per file
- 200 pages per file — handled automatically: longer PDFs are split, parsed part by part, and merged back into one Markdown file (see below)
- 50 submissions per minute across all clients of your account
- 1,000 pages/day at high priority

### How large PDFs are handled

MinerU rejects any PDF above 200 pages, so the plugin works around it locally:

1. Parse the PDF once with `pdf-lib` and count the pages. **At or under 200 pages, the original bytes are uploaded unchanged** — nothing is rewritten.
2. Above 200 pages, split the page tree into ≤200-page parts and submit them one at a time (strictly sequential, to stay inside the 50 files/min limit).
3. Merge the part Markdown back into one file, in page order, with no separator markers, and merge all images into a single `images/` folder.

A part that fails fails the whole document — no partial Markdown is written. If the PDF cannot be inspected locally (encrypted or malformed), the plugin falls back to uploading it whole, exactly as it did before auto-splitting existed.

For very large libraries, use the Python batch tool in [`../code/`](../code/) instead — it handles batching and 429 retries automatically.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # tsc --noEmit + esbuild (production)
npm run lint   # ESLint 9 flat config
npm run sync   # copy the build to a vault
```

Source lives under `src/`. Build outputs `main.js` at the plugin root.

### Deploying to a live Obsidian vault

A post-commit Git hook lives at `plugin/hooks/post-commit`. Once `core.hooksPath` is set (see below), every `git commit` that touches `plugin/` automatically copies `main.js`, `manifest.json`, and `styles.css` to your live Obsidian vault's plugin folder.

The hook never fails a commit: if the sync cannot run (no `node`, vault unreachable) it prints a warning and exits 0, and you can re-run `npm run sync` by hand.

**One-time setup** (per machine, after cloning):

```bash
cd path/to/obsidian-mineru
git config core.hooksPath plugin/hooks
```

**Sync target** — the script resolves the destination vault in this priority order:

```bash
# 1. CLI flag (one-off; also persists to scripts/sync-config.json)
npm run sync -- --to "D:\path\to\vault\.obsidian\plugins\obsidian-mineru"

# 2. Environment variable (good for CI)
export OBSIDIAN_PLUGINS_DIR="D:\path\to\vault\.obsidian\plugins\obsidian-mineru"

# 3. Saved config (written by --to; file is gitignored)

# 4. Built-in default (Windows; edit scripts/sync.mjs to change it)
```

**Manual sync** (without committing):

```bash
npm run sync            # use flag / env / saved target
npm run build:sync      # build first, then sync (one shot)
```

**Temporarily disable** the hook:

```bash
git config core.hooksPath .git/hooks    # restore default path
```

The hook only copies when the commit changed a file under `plugin/`. Commits to `docs/`, `code/`, `README.md`, etc. will not trigger a copy.

### Project layout

```
src/
  main.ts              # Plugin lifecycle
  settings.ts          # Settings interface + settings tab
  api/
    MinerUClient.ts    # API client (submit / upload / poll / download / extract)
    types.ts           # API + progress type definitions
  conversion/
    DocumentConverter.ts  # orchestration: split -> parse each part -> merge
    mergeResults.ts       # concatenate part Markdown + images
  commands/
    convertFile.ts     # Right-click menu + command palette wiring
  ui/
    ProgressModal.ts   # Live progress modal
    ConflictModal.ts   # "MD already exists — overwrite?" prompt
  i18n/
    helpers.ts         # t() — locale-aware string lookup
    locale/
      en.ts            # English (base)
      zh-cn.ts         # Simplified Chinese
  utils/
    constants.ts       # Supported extensions, defaults, IDs
    logger.ts          # Console logger
    pdfSplitter.ts     # Page count + page-range splitting (pdf-lib; no obsidian imports)
    zipExtractor.ts    # JSZip wrapper for full.md extraction
```

To add a new locale: create `src/i18n/locale/<code>.ts`, then add it to the map in `src/i18n/helpers.ts`.

## License

[MIT](LICENSE)
