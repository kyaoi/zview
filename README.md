# zview

A **fast, lightweight, read-only PDF viewer** that runs in your browser, inspired by Zathura’s minimal UX and Vim-like navigation.

* **Linux-first**
* **Web UI only** (the CLI starts a local server and opens your browser)
* **PDF.js-powered** rendering

---

## Goals

* Fast startup and smooth scrolling for large PDFs
* Vim-like keybindings (minimal, practical subset)
* Optional auto-reload for the **MAIN** PDF
* Side-by-side view (max 2 panes) with clear focus/role indicators

## Non-goals

* Editing, annotations, forms
* In-document text search
* URL loading (local files only)
* Tabs/session management

---

## Features

### Rendering & UX

* **Continuous scroll** with **16px** spacing between pages
* **Zoom:** `+` / `-`
* **Fit to width:** `=`
* Bundled **Noto Sans JP** + PDF.js CMaps/standard fonts for offline-safe Japanese text rendering

### Two panes (max 2)

* Two roles: **MAIN** and **SUB**
* **SUB is static** (no reload). To change it, re-open via the UI.
* **Swap panes:** `s` (swaps left/right positions; roles remain MAIN/SUB)
* **Focus toggle:** `Tab`

### Reload behavior

* **MAIN**:

  * When watch is **ON**: automatically reloads on file change.
  * If reload fails (e.g., file mid-write): **keeps the current display** and retries on the next change.
  * Keeps the **same page and approximately the same vertical position** after reload.
* When watch is **OFF**:

  * **No change detection**.
  * Use manual reload: `r` (reload MAIN).

---

## Keybindings

### Navigation

* `j` / `k` — scroll down / up
* `d` / `u` — half-page down / up
* `gg` — jump to top
* `G` — jump to bottom
* `n` / `p` — next / previous page (best-effort based on current viewport)

### Zoom

* `+` / `-` — zoom in / out
* `=` — fit to width

### Panes

* `Tab` — toggle focus (MAIN ↔ SUB)
* `s` — swap left/right pane positions

### Reload / Misc

* `r` — reload **MAIN** (manual)
* `R` — reload **MAIN** and re-render **SUB** (SUB does not re-read from disk)
* `?` — show help overlay
* `q` — quit

---

## CLI Usage

### Open a PDF as MAIN

```bash
zview path/to/main.pdf
```

### Two-pane view (MAIN + SUB)

```bash
zview path/to/main.pdf path/to/other.pdf
# or
zview path/to/main.pdf --sub path/to/other.pdf
```

### Start focused on SUB

```bash
zview path/to/main.pdf --sub path/to/other.pdf --focus sub
```

### Disable watch (no detection)

```bash
zview path/to/main.pdf --no-watch
```

### No path: open empty UI

```bash
zview
```

Then use the **Open** button in the Web UI.

### Options (planned / typical)

* `--sub <PATH>` — open a second PDF as SUB
* `--focus main|sub` — initial focus
* `--watch / --no-watch` — enable/disable filesystem watching for MAIN (default: watch)
* `--port <N>` — bind to a specific port
* `--no-open` — don’t auto-open a browser tab

## Build (single binary)

```bash
cd frontend
pnpm install        # first time only
pnpm build          # emits assets to ../backend/dist for embedding

cd ../backend
go build -o ../zview
```

Result: `./zview` contains the embedded frontend; end users do **not** need Node/pnpm.

---

## Web UI

Minimal toolbar (suggested):

* **Open** (MAIN)
* **Open Sub** (SUB)
* **Swap**
* **Reload** (MAIN)
* **Help**

Each pane should show a persistent header badge like:

* `MAIN • watching` / `MAIN • manual`
* `SUB • static`

This prevents confusion when switching focus.

---

## Performance strategy (core design)

This project prioritizes speed:

* **Virtualized rendering**: only render visible pages (+ a small buffer). Far pages are placeholders.
* **Cancelable renders**: abort in-flight page renders when scrolling quickly.
* **No text layer** by default (since search is out of scope).
* **DPR cap** (avoid memory blowups on high-DPI screens).
* For MAIN, the local server should support **HTTP Range requests** where possible.

---

## Auto-reload details (MAIN)

* Watches the file (Linux-first). Updates often occur via atomic replace; the watcher must handle rename/replace.
* Transport: **SSE** on `/events` (only when watch is ON and MAIN exists). With `--no-watch`, `/events` is not served and no change detection occurs.
* Uses a short debounce before reloading.
* On reload success: restore **page + vertical position** best-effort.
* On reload failure: do nothing visually; show a brief status message.

---

## Security

* The server should bind to **127.0.0.1** only.
* Prefer a per-launch random token in the URL to avoid accidental cross-tab access.

## Language

Project documentation and UI text are written in English by default unless a task specifies otherwise. Use pnpm for Node installs. Styling should use Tailwind CSS v4.x.

---

## License

TBD
