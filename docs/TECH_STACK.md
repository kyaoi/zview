# TECH_STACK.md

This document captures the technical stack and architecture decisions for **zview**.

## Summary

* **Backend (CLI + local server):** Go
* **Frontend (Web UI):** Vite + TypeScript
* **PDF Rendering:** PDF.js (`pdfjs-dist`)
* **Frontend tooling (build-time):** Node.js (LTS) + **pnpm** (installed via mise or similar; Corepack not used; version not pinned)
* **Lint/format:** Biome
* **Runtime distribution:** **single Go binary** (no Node/pnpm required for users)
* **Platform target:** Linux-first

Design priorities: **speed**, **low memory**, **simple distribution**, **read-only**.

---

## Goals (technical)

* Fast startup and responsive scrolling for large PDFs
* Minimal runtime dependencies on Linux
* Stable packaging (single executable where possible)
* Reliable MAIN auto-reload (when enabled)
* Predictable behavior with continuous scroll and Vim-like keybindings

## Non-goals (technical)

* Native GUI toolkit
* URL loading / remote PDFs
* Text search / text layer features (disabled by default)
* Background indexing / pre-rendering of all pages

---

## Backend: Go (CLI + HTTP)

### Why Go

* Easy **single-binary** distribution
* Solid standard library for HTTP
* Works well on Linux
* Straightforward file watching and process lifecycle

### Responsibilities

* Parse CLI options and start a local server (bind to `127.0.0.1` only)
* Serve the Web UI assets (built `dist/`) via embedded files
* Serve MAIN PDF bytes with proper HTTP semantics
* Optional filesystem watching for MAIN (watch ON/OFF)
* Provide a minimal event channel for the UI when watch is enabled

### Key design points

* **HTTP Range support (MAIN):** serve PDF bytes with Range support for PDF.js partial fetch.

  * Prefer `http.ServeContent` when feasible.
* **Watch behavior:**

  * `--watch` (default): detect changes and notify UI
  * `--no-watch`: **no detection**, manual reload only
* **Debounce:** file change events should be debounced (e.g., 200–500ms) to avoid mid-write reload.
* **Reload failure:** never crash; UI keeps current display.

### Endpoints (suggested)

* `GET /` — web app
* `GET /assets/*` — static assets
* `GET /api/main.pdf` — MAIN PDF stream (Range supported)
* `GET /api/sub.pdf` — optional: serve SUB if provided via CLI path (Range supported)
* `GET /events` — Server-Sent Events (SSE) for MAIN changes (only when watch enabled)

### CLI options (planned)

* `zview [MAIN.pdf]`
* `--sub <PATH>` — open a second PDF as SUB
* `--focus main|sub` — initial focus
* `--watch / --no-watch` — enable/disable filesystem watching for MAIN
* `--port <N>` — choose port
* `--no-open` — don’t auto-open the browser


### Package Structure

The backend is organized into internal packages:

```
backend/
├── main.go              # Entry point
└── internal/
    ├── cli/             # CLI parsing & subcommands
    ├── config/          # Configuration loading
    ├── server/          # HTTP handlers, SSE
    ├── session/         # Instance management
    ├── state/           # Application state
    └── watcher/         # File watching
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.
---

## Frontend: Vite + TypeScript

### Why this stack

* Fast dev server and reliable production bundling
* Easy worker bundling for PDF.js
* TypeScript helps keep rendering and input logic safe

### Responsibilities

* Render PDFs (continuous scroll with 16px page gap)
* Implement virtualization and render cancellation
* Handle keybindings and pane focus
* Show persistent MAIN/SUB role indicators and status
* Manage reload behavior and scroll-position restoration

### PDF.js integration

* Use `pdfjs-dist` as the sole source for both core and worker.
* Explicitly set `GlobalWorkerOptions.workerSrc` to the bundled worker output to prevent version mismatch.
* Avoid mixing CDN versions.

### Rendering/performance strategy (must-have)

* **Virtualized pages:** only render visible pages (+ small buffer); far pages are placeholders with preserved height.
* **Cancelable renders:** abort in-flight render tasks when scrolling quickly.
* **No TextLayer by default:** since search is out of scope.
* **DPR cap:** cap effective device pixel ratio (e.g., max 2.0) to prevent memory blowups.
* **Quality on idle:** optionally render lower-res while scrolling, re-render high-res on idle.

### Pane model

* Up to 2 panes: **MAIN** and **SUB**.
* MAIN: reloadable (auto when watch ON, manual always).
* SUB: **static** (no re-read from disk). Can be replaced via “Open Sub”.
* Swap changes only left/right position; roles remain MAIN/SUB.

### Keybindings (default)

* Scroll: `j/k`, half-page: `d/u`, top: `gg`, bottom: `G`
* Page step: `n/p` (best-effort)
* Zoom: `+/-`, Fit width: `=`
* Focus: `Tab`
* Swap panes: `x`
* Reload: `r` (MAIN), `R` (MAIN + re-render SUB)
* Help: `?`, Quit: `q`

---

## Frontend package manager & runtime (developer tooling)

### Decision

* **Package manager:** pnpm
* **Runtime:** Node.js (LTS)
* **Version pinning:** use Corepack and the `packageManager` field in `frontend/package.json`.

### Notes

* pnpm/Node are **development & CI dependencies only**.
* The released `zview` binary must **not** require Node/pnpm at runtime.

---

## Reload & scroll-position restoration

### MAIN auto-reload

* When watch is ON, the server notifies the UI of changes via SSE.
* The UI reloads MAIN using a cache-busting URL query (e.g., `?v=<timestamp>`).
* If the new PDF fails to load, the UI **keeps the current rendering**.

### Restoration target

Minimum requirement: after reload, start at **the same page and approximately the same vertical position**.

Suggested state snapshot before reload:

* `topPageIndex` — page nearest the viewport top
* `offsetPx` — pixel offset within that page
* `zoomMode` — manual scale or fit-width
* Fallback: `scrollTopRatio = scrollTop / scrollHeight`

Restore after the new layout is measured:

1. If `topPageIndex` exists: scroll to page top + `offsetPx`
2. If page count decreases: restore using height-based fallback (ratio or clamped scrollTop)

---

## Packaging & distribution

### Release artifact

* **Single executable:** `zview`
* Frontend is built ahead-of-time and embedded into the Go binary.
* End users do **not** run pnpm/Node.

### Build pipeline (recommended)

1. Frontend build

   * `pnpm install`
   * `pnpm build` → produces `frontend/dist/`
2. Backend build

   * Go embeds `frontend/dist/` using `embed`
   * `go build` → produces `zview`

### Dev workflow (recommended)

* Frontend: `pnpm dev` (Vite dev server)
* Backend: `go run ...` (optionally proxy to Vite during development)
* Production: backend serves embedded `dist/`

---

## Security

* Bind server to `127.0.0.1` only
* Use a per-launch random token in the URL or as a header to reduce accidental access
* No URL loading; only local file paths provided via CLI or file picker

---

## License considerations

* PDF.js is Apache-2.0 (confirm via `pdfjs-dist`)
* Keep dependencies minimal and compatible with intended project license

---

## Future (explicitly optional)

* Config file for keymaps and defaults
* Persistent UI preferences (zoom mode, last used options)
* Optional File System Access API enhancements (not required)
