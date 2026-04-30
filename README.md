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

Or install via the install script (Linux / macOS):

```bash
curl -fsSL https://raw.githubusercontent.com/kyaoi/zview/main/install.sh | sh
```

You can customize the install directory with `INSTALL_DIR`:

```bash
curl -fsSL https://raw.githubusercontent.com/kyaoi/zview/main/install.sh | INSTALL_DIR=/usr/local/bin sh
```

You can also install a specific version using `VERSION`:

```bash
curl -fsSL https://raw.githubusercontent.com/kyaoi/zview/main/install.sh | VERSION=v1.2.1 sh
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

### Screenshot
<img width="1920" height="945" alt="image" src="https://github.com/user-attachments/assets/d945ce64-fdb5-4290-a762-48e59451fbd7" />

### Demo Video
[demo](https://github.com/user-attachments/assets/3392a0cc-0795-4459-9224-26c6be15397b)

## Usage

### Common patterns

```bash
# Start with file picker UI
zview

# Open MAIN + multiple SUB tabs
zview main.pdf --sub sub1.pdf --sub sub2.pdf
# or
zview main.pdf sub1.pdf sub2.pdf

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
| `--no-text-select` | Disable the selectable text layer (smaller memory footprint) |
| `--no-animate` | Disable Beamer `animate` playback (frames render statically) |
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
text_select = true

[animate]
enabled = true
default_fps = 12
max_active_clips = 4

# [keys]
# scroll_down = ["j", "ArrowDown"]
# jump_top = ["g g"]
# toggle_focus = ["<Tab>"]
# blocked_keys = ["<C-p>"]
# disable_browser_shortcuts = true
```

## Troubleshooting

- Text selection: the TextLayer is enabled by default for Chrome-like text selection and copy. Disable it with `--no-text-select` or `text_select = false` if memory pressure matters more than selectability.
- Beamer animations: PDFs from LaTeX's `animate` package play inline by default. Disable with `--no-animate` or `enabled = false` under `[animate]` to skip the playback layer entirely.
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
