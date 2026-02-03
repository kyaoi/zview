# zview

A **fast, lightweight, read-only PDF viewer** for Linux.
Runs in your browser, powered by PDF.js, with Vim-like navigation.

## Features

* **Fast & Lightweight**: Virtualized rendering for smooth scrolling even with large PDFs.
* **Vim-like Keybindings**: Navigate with `j`, `k`, `d`, `u`, `g g`, `G`, etc.
* **Dual Pane Support**: View two PDFs side-by-side (MAIN and SUB).
    * **MAIN Pane**: Supports auto-reload on file change.
    * **SUB Pane**: Static reference view; supports multiple tabs.
* **Focus Management**: Clear visual indication of the active pane.
* **Configuration**: Customizable key behaviors via `~/.config/zview/config.toml`.
* **Session Management**: List and terminate running instances via CLI.

## Installation

### Homebrew (Recommended)

```bash
brew install kyaoi/zview/zview
```

### Build from source

Requirements: `go`, `pnpm`

```bash
# Clone the repository
git clone https://github.com/kyaoi/zview.git
cd zview

# Build frontend and backend
make build

# Install (optional, or add to $PATH)
sudo cp zview /usr/local/bin/
```

## Usage

### Basic Usage

Open a PDF in the MAIN pane:

```bash
zview document.pdf
```

Open without arguments (select file in UI):

```bash
zview
```

### Dual Pane View

Open two PDFs side-by-side:

```bash
zview main.pdf sub.pdf
# or
zview main.pdf --sub sub.pdf
```

* **MAIN Pane**: The primary document. Auto-reloads when the file changes (unless disabled).
* **SUB Pane**: Secondary reference document(s). Configurable via tabs in the UI.

### Session Management

List running `zview` instances:

```bash
zview ps
```

Terminate an instance:

```bash
zview kill <port>
# or interactive selection:
zview kill
```

### CLI Options

* `--sub <PATH>`: Open a second PDF as SUB.
* `--focus <main|sub>`: Set initial focus (default: main).
* `--port <N>`: Bind to a specific port (default: auto).
* `--no-watch`: Disable file watching for MAIN.
* `--no-open`: Don't open the browser automatically.

## Keybindings

| Key | Action |
| :--- | :--- |
| **Navigation** | |
| `j` / `k` | Scroll down / up |
| `d` / `u` | Scroll half-page down / up |
| `h` / `l` | Scroll left / right |
| `g g` | Jump to top |
| `G` | Jump to bottom |
| `n` / `p` | Next / Previous page |
| **Zoom** | |
| `+` / `-` | Zoom in / out |
| `=` | Fit to width |
| **Panes** | |
| `Tab` / `<Tab>` | Toggle focus (MAIN ↔ SUB) |
| `s` | Swap left/right pane positions |
| **General** | |
| `r` | Reload MAIN |
| `?` | Show help overlay |
| `q` / `<Escape>` | Quit (close tab) |

## Configuration

You can configure `zview` by creating a file at `~/.config/zview/config.toml`.

**Example `config.toml`:**

```toml
# Enable file watching for MAIN PDF (default: true)
watch = true

# Zoom step factor (default: 1.2)
zoom_step = 1.2

# Device Pixel Ratio cap (default: 2.0)
# Lower this to 1.0 if you experience memory issues or lag on high-DPI screens.
dpr_cap = 2.0

# Scroll step in pixels (default: 64.0)
scroll_step_vertical = 64.0
scroll_step_horizontal = 64.0

# Page scroll ratio (default: 0.5)
# How much to scroll (relative to screen height) for 'd' / 'u' commands.
page_scroll_ratio = 0.5

# [keys]
# You can define custom keybindings.
# Single key:   scroll_down = "j"
# Multiple keys: scroll_down = ["j", "ArrowDown"]
# Key sequence: jump_top = ["g g"]  (space-separated)
# Modifiers:    scroll_down = ["<C-j>"] (Ctrl+j)
# Special keys: toggle_focus = ["<Tab>"]
#
# Blocked keys (prevent browser default behavior):
# blocked_keys = ["<C-p>", "<C-f>"]
#
# Aggressively disable browser shortcuts:
# disable_browser_shortcuts = true
```

### Key Notation

* **Basic**: `"j"`, `"G"`, `"?"`
* **Special Keys**: Enclosed in `<...>` (e.g., `<Space>`, `<Tab>`, `<Enter>`, `<Escape>`, `<Backspace>`, `<Delete>`, `<ArrowUp>`, etc.)
* **Modifiers**: `<M-j>` (Meta+j), `<C-u>` (Ctrl+u), `<A-Left>` (Alt+Left), `<S-Tab>` (Shift+Tab)
    * `C`: Ctrl
    * `M`: Meta (Command on Mac, Win on Windows)
    * `A`: Alt
    * `S`: Shift
* **Note on Shift**: For printable characters, use the character itself.
    * Use `"G"` instead of `"<S-g>"`.
    * Use `"<"` instead of `"<S-,>"`.
    * Use `"<C-G>"` for Ctrl+Shift+g.
* **Sequences**: Space-separated (e.g., `"g g"`, `"<Space> j"`)
```

## Troubleshooting

* **Performance**: `zview` prioritizes performance. It does not use a "Text Layer" for selection/search to keep rendering fast and lightweight.
* **Reloading**: The SUB pane is static and does not watch for changes. Re-open the file in the UI to update it.
