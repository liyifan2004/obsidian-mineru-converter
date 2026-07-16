# MinerU Converter — Obsidian Plugin

Right-click any PDF / Word / PPT / Excel / image in your vault and convert it to editable Markdown via the [MinerU](https://mineru.net/apiManage/docs) accurate-parse API.

> Convert any document in your vault to Markdown with one right-click.

## Features (v0.1)

- 🖱 **Right-click → Convert** on any supported file in the file explorer.
- 📂 **Saves alongside the original** — `essay.pdf` becomes `essay.md`.
- 🛡 **Conflict prompt** if a `.md` already exists (overwrite / skip / cancel).
- 📊 **Live progress modal** with cancel button and time elapsed.
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

## Limits (from the MinerU API)

- 200 MB per file
- 200 pages per file (v0.1 surfaces an error rather than auto-splitting)
- 50 submissions per minute across all clients of your account
- 1,000 pages/day at high priority

For very large libraries, use the Python batch tool in [`../code/`](../code/) instead — it handles batching and 429 retries automatically.

## Roadmap

- v0.2 — multi-file batch select, auto-split PDFs > 200 pages, encrypted-PDF password prompt
- v0.3 — audio auto-embed (detect sibling `.m4a` files and prepend `![[file.m4a]]`)
- v1.0 — folder watcher mode, callback (push) instead of polling

## Development

```bash
npm install
npm run dev   # watch mode
```

Source lives under `src/`. Build outputs `main.js` at the plugin root.

### Deploying to your live Obsidian vault

A post-commit Git hook is configured at `plugin/hooks/post-commit`. Once `core.hooksPath` is set (see below), every `git commit` that touches `plugin/` will automatically copy `main.js`, `manifest.json`, and `styles.css` to your live Obsidian vault's plugin folder.

**One-time setup** (per machine, after cloning):

```bash
cd path/to/obsidian-mineru
git config core.hooksPath plugin/hooks
```

**Default target** — already hard-coded to `D:\桌面\李轶凡的笔记仓库\学-习\.obsidian\plugins\obsidian-mineru`. No config needed on this machine.

**Custom target** — three options, in priority order:

```bash
# 1. CLI flag (one-off; also persists to scripts/sync-config.json)
npm run sync -- --to "D:\path\to\other\vault\.obsidian\plugins\obsidian-mineru"

# 2. Environment variable (good for CI)
export OBSIDIAN_PLUGINS_DIR="D:\path\to\other\vault\.obsidian\plugins\obsidian-mineru"

# 3. Saved config (npm run sync --to)
# script writes to plugin/scripts/sync-config.json (gitignored)
```

**Manual sync** (without committing):

```bash
npm run sync            # use default / saved / env-var target
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
    zipExtractor.ts    # JSZip wrapper for full.md extraction
```

To add a new locale: create `src/i18n/locale/<code>.ts`, then add it to the map in `src/i18n/helpers.ts`.

## License

MIT
