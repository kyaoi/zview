# DEVELOPMENT.md

This document explains how to develop **zview** locally.

zview is a **web-based, read-only PDF viewer**. The Go CLI starts a local server and opens the Web UI.

---

## Prerequisites

### Required

* **Go** (recent stable version)
* **Node.js (LTS)**
* **pnpm** (installed via mise or equivalent; Corepack not used; version not pinned, tested with 10.19.0)

Recommended:

* Linux environment (primary target)

---

## Repository layout

* `backend/` — Go CLI + local HTTP server
* `frontend/` — Vite + TypeScript web app

---

## Install dependencies

### Frontend

From `frontend/`:

```bash
pnpm install
```

---

## Development workflow

There are two common ways to develop:

### Option A (recommended): run Vite dev server + Go backend

This is best for fast UI iteration.

1. Start the frontend dev server

```bash
cd frontend
pnpm dev
```

2. Start the backend

```bash
cd ../backend
go run . --port 8080
```

Notes:

* During development, you may choose to:

  * serve the UI from Vite and have the backend serve only `/api/*`, or
  * proxy `/api/*` from Vite to the backend.
* Keep the design simple: the backend should be the source of truth for PDF bytes.

### Option B: build frontend and run backend-only

This matches the production path.

1. Build frontend

```bash
cd frontend
pnpm build
```

2. Run backend (serving embedded `dist/`)

```bash
cd ../backend
go run . --port 8080
```

---

## Running zview

### MAIN only

```bash
zview path/to/main.pdf
```

### MAIN + SUB

```bash
zview path/to/main.pdf --sub path/to/sub.pdf
```

### Disable file watching (no detection)

```bash
zview path/to/main.pdf --no-watch
```

---

## Build

### Production build (single binary)

1. Build frontend

```bash
cd frontend
pnpm build
```

2. Build backend

```bash
cd ../backend
go build -o ../zview
```

Result:

* `./zview` is the distributable executable.
* Frontend assets are emitted to `backend/dist` and **embedded** into the Go binary.
* End users do **not** need Node/pnpm.

---

## Testing & quality checks

### Frontend

From `frontend/`:

```bash
pnpm lint     # Biome lint
pnpm fmt      # Biome format --check
pnpm build
```

### Backend

From `backend/`:

```bash
go fmt ./...
go test ./...
go build ./...
```

---

## Manual test checklist (minimum)

* MAIN loads and renders pages in continuous scroll (16px gap)
* Zoom works: `+` / `-`
* Fit-to-width works: `=`
* Focus toggles with `Tab` and MAIN/SUB remain clearly labeled
* Swap works: `s` (roles remain MAIN/SUB)
* Manual reload works: `r` reloads MAIN
* Reload failure keeps current rendering (no blank)
* Large PDFs scroll smoothly; memory remains bounded (best-effort)

---

## Debugging tips

### PDF.js worker issues

Symptoms:

* Blank pages
* Console errors like “API version does not match Worker version”

Fixes:

* Ensure `pdfjs-dist` core and worker are from the **same version**
* Avoid mixing CDN workers with bundled core
* Confirm `workerSrc` points to the built worker asset

### Range requests

* Serving PDFs with Range support improves large-file performance.
* Prefer Go `http.ServeContent` for `/api/main.pdf`.

---

## Notes on performance

Performance is a first-class requirement:

* Implement virtualization (visible pages + buffer only)
* Cancel in-flight renders when pages leave the buffer
* Avoid TextLayer by default
* Cap DPR (e.g. max 2.0)

---

## Commit hygiene

Follow `AGENTS.md`:

* Commit at each task boundary and after completing requested fixes
* Keep commits small and testable

---

## Documentation

When behavior changes, update:

* `README.md`
* `TECH_STACK.md`
* `PLAN.md`
* `AGENTS.md` (workflow/rules)

---

## Release Process

Releases are automated via GitHub Actions and GoReleaser.

1.  **Tag release**: Create and push a new tag (e.g., `v0.1.0`).
    ```bash
    git tag v0.1.0
    git push origin v0.1.0
    ```
2.  **CI/CD**:
    *   GitHub Actions detects the tag.
    *   Frontend is built.
    *   Backend is cross-compiled for Linux, macOS, and Windows.
    *   Version info is injected via `ldflags`.
    *   Binaries are uploaded to GitHub Releases.
    *   Homebrew formula is updated in `kyaoi/homebrew-tap`.
    *   **Note**: Binaries are uploaded to `kyaoi/zview-releases` (Public) to allow installation without authentication, while keeping `zview` source Private.

### Setup Requirements

1.  **Repositories**:
    *   `kyaoi/zview` (Private): Source code.
    *   `kyaoi/zview-releases` (Public): Binary releases (empty repo).
    *   `kyaoi/homebrew-tap` (Public): Homebrew formulae.


2.  **Secrets (in `zview` repo)**:
    *   **Name**: `GH_PAT`
    *   **Value**: A Personal Access Token (Fine-grained recommended) with the following permissions:
        *   `kyaoi/zview` (Private): **Read-only** (Metadata/Contents) to read tags.
        *   `kyaoi/zview-releases` (Public): **Read/Write** (Contents) to create releases.
        *   `kyaoi/homebrew-tap` (Public): **Read/Write** (Contents) to update formulae.

### Manual install via Homebrew

Once released, users can install via:

```bash
brew install kyaoi/tap/zview
```
