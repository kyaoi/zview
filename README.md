# zview

A **fast, lightweight, read-only PDF viewer** for Linux.
It runs in your browser (PDF.js), but serves files from your local machine only.

## What zview is for

`zview` is designed for fast reading and comparison of local PDFs.

- Performance-first rendering (virtualized pages + canceled offscreen renders)
- Vim-like keyboard navigation
- Two-pane workflow with clear roles: `MAIN` and `SUB`
- Local server bound to `127.0.0.1` (no remote PDF fetching)

## Quick Start

### 1. Install

```bash
brew install kyaoi/zview/zview
```

Or build from source:

```bash
git clone https://github.com/kyaoi/zview.git
cd zview
make build
sudo cp zview /usr/local/bin/
```

Requirements: `go`, `pnpm`

### 2. Open a PDF

```bash
zview document.pdf
```

### 3. Open MAIN + SUB

```bash
zview main.pdf --sub ref.pdf
```

### 4. Disable auto-watch (manual reload only)

```bash
zview main.pdf --no-watch
```

## Screenshots / Demo

This section is prepared so you can drop in real screenshots or videos quickly.
Store media files under `docs/media/` and update the paths below.

### Screenshot slots

```md
![MAIN pane (watching)](docs/media/main-pane.png)
![Dual pane (MAIN + SUB)](docs/media/dual-pane.png)
![Help overlay](docs/media/help-overlay.png)
```

### Video slot

```md
[Demo video (MP4)](docs/media/demo.mp4)
```

If you prefer GitHub-hosted uploads:

```md
[Demo video](https://github.com/user-attachments/assets/REPLACE_WITH_YOUR_VIDEO_ID)
```

## Usage

### Common patterns

```bash
# Start with file picker UI
zview

# Open MAIN + multiple SUB tabs
zview main.pdf --sub sub1.pdf --sub sub2.pdf

# Choose initial focus
zview main.pdf --focus sub

# Session management
zview ps
zview kill <port>
```

### Pane roles

| Pane | Role | Reload behavior |
| :--- | :--- | :--- |
| `MAIN` | Primary document | Auto-reload on file change (when watch is on) + manual reload |
| `SUB` | Reference document(s) | Static (no file watching). Replace via "Open Sub" |

## CLI Options

| Option | Description |
| :--- | :--- |
| `-m, --main <PATH>` | Path to MAIN PDF |
| `-s, --sub <PATH>` | Path to SUB PDF (repeatable) |
| `--active-sub <PATH>` | SUB tab to activate initially |
| `--focus <main|sub>` | Initial focus pane (default: `main`) |
| `--watch` / `--no-watch` | Enable/disable MAIN file watching |
| `--port <N>` | Port to bind (`0` = auto-select) |
| `--no-open` | Do not open browser automatically |
| `--help` | Show help |
| `--version` | Print version |

## Default Keybindings

| Key | Action |
| :--- | :--- |
| `j` / `k` | Scroll down / up |
| `h` / `l` | Scroll left / right |
| `d` / `u` | Half-page down / up |
| `g g` / `G` | Jump to top / bottom |
| `n` / `p` | Next / previous page |
| `+` / `-` / `=` | Zoom in / out / fit width |
| `Tab` | Toggle focus (`MAIN` ↔ `SUB`) |
| `s` | Swap left/right pane positions |
| `H` / `L` | Prev / next SUB tab (or fast horizontal scroll) |
| `r` / `R` | Reload MAIN / Reload MAIN + re-render SUB |
| `?` | Toggle help overlay |
| `q` / `<Escape>` | Quit (close tab) |

## Configuration

Configuration file:

```text
~/.config/zview/config.toml
```

Example:

```toml
watch = true
zoom_step = 1.2
dpr_cap = 2.0
scroll_step_vertical = 64.0
scroll_step_horizontal = 64.0
page_scroll_ratio = 0.5

# [keys]
# scroll_down = ["j", "ArrowDown"]
# jump_top = ["g g"]
# toggle_focus = ["<Tab>"]
# blocked_keys = ["<C-p>"]
# disable_browser_shortcuts = true
```

## Troubleshooting

- Performance: `zview` does not enable TextLayer/in-document search by default to keep rendering fast.
- Reload behavior: `SUB` is static; re-open via UI to refresh it.
- Watch behavior: with `--no-watch`, file changes are not detected.
- Password-protected PDFs: the viewer prompts for a password and keeps the current view on cancel/failure.

## Development

```bash
mise run verify
```

Additional docs:

- `docs/TECH_STACK.md`
- `docs/ARCHITECTURE.md`
- `docs/CODING_RULES.md`
- `docs/TESTING.md`
