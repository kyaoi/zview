# PLAN.md

This plan breaks development of **zview** into small, reviewable tasks.

* Each task maps to **one branch/worktree** (recommended name: `task/<slug>`).
* This document focuses on **what to do in each worktree** (you manage worktree creation on your side).
* Mark tasks complete by checking the box.

---

## Progress tracking

* [x] **Milestone 0:** Repo + tooling bootstrapped
* [ ] **Milestone 1:** Single-PDF viewer works end-to-end
* [ ] **Milestone 2:** Keybindings + zoom/fit-width
* [ ] **Milestone 3:** Two-pane MAIN/SUB + focus + swap
* [ ] **Milestone 4:** Reload (manual + auto) + scroll restoration
* [ ] **Milestone 5:** Performance hardening
* [ ] **Milestone 6:** Packaging + CI + release readiness

---

## Definition of Done (applies to every task)

A task is “done” when:

* Builds locally (dev and prod path for the touched side)
* Formatting/lint pass for touched code
* Any new behavior has at least minimal tests **or** a documented manual test recipe
* Docs updated if user-facing behavior/CLI/keybindings changed

---

## Repository layout (target)

* `backend/` — Go CLI + local HTTP server
* `frontend/` — Vite + TS web app
* `docs/` — extra documentation (optional)

---

## Task list

### 0) Bootstrap & repo scaffolding

#### `task/bootstrap-repo`

* [x] Done

**Goal:** Establish a stable foundation.

**Work:**

* Create directories: `backend/`, `frontend/`
* Add `.editorconfig`, `.gitignore`
* Add basic `Makefile` (or `justfile`) targets:

  * `dev` (runs backend + frontend dev)
  * `build` (frontend build → backend build)
  * `fmt` / `lint` / `test`
* Decide license placeholder (can be `TBD` initially)

**Acceptance:**

* Running `make fmt` and `make lint` succeeds (even if minimal)
* Repo has clear entrypoints for dev/build

---

### 1) Frontend tooling (pnpm) and skeleton UI

#### `task/frontend-tooling-pnpm`

* [x] Done

**Goal:** Lock frontend tooling and confirm reproducible installs.

**Work:**

* Add `frontend/package.json` with:

  * scripts: `dev`, `build`, `lint`, `fmt`
* Add minimal ESLint + Prettier (keep rules light)
* Document Node version requirement (Node LTS) in `frontend/README.md` or root notes

**Acceptance:**

* `pnpm install` then `pnpm build` works on a clean machine

#### `task/frontend-vite-skeleton`

* [x] Done

**Goal:** Web app shell (no PDF yet).

**Work:**

* Vite + TS skeleton
* Layout:

  * Top toolbar: Open(Main), Open(Sub), Swap, Reload(Main), Help
  * Two-pane container (initially only MAIN visible)
  * Pane headers always show role badges: `MAIN` / `SUB`
  * Focus ring placeholder

**Acceptance:**

* `pnpm dev` shows the layout
* MAIN badge is visible and persistent

---

### 2) Backend skeleton (Go CLI + local server)

#### `task/backend-go-skeleton`

* [x] Done

**Goal:** Start server on localhost and serve a placeholder.

**Work:**

* `backend/go.mod`
* CLI args: positional `[MAIN.pdf]` (optional), plus flags stubs:

  * `--sub`, `--focus`, `--watch/--no-watch`, `--port`, `--no-open`
* Bind server to `127.0.0.1` only
* Serve `GET /` placeholder
* Optional: auto-open browser unless `--no-open`

**Acceptance:**

* `go run ./backend --port 0` starts and prints URL
* Browser opens when not `--no-open`

---

### 3) Production serving: embed `frontend/dist` into Go binary

#### `task/embed-frontend-dist`

* [ ] Done

**Goal:** Single-binary runtime (no Node/pnpm on user machines).

**Work:**

* Build frontend to `frontend/dist/`
* Use Go `embed` to include `dist/`
* Serve assets and SPA entry correctly

**Acceptance:**

* `pnpm build` then `go build` produces a binary that serves the UI without external files

---

### 4) PDF.js integration (worker correct) + render MAIN MVP

#### `task/pdfjs-worker-and-main-mvp`

* [ ] Done

**Goal:** Render a PDF (MAIN) reliably, including worker.

**Work:**

* Add `pdfjs-dist`
* Configure worker **from the same bundled version** (no CDN mixing)
* Implement a minimal renderer that loads `MAIN` from `/api/main.pdf` and displays page 1

**Acceptance:**

* No worker version mismatch errors in production build
* MAIN shows page 1

---

### 5) Serve MAIN PDF with Range support (important for performance)

#### `task/serve-main-pdf-range`

* [ ] Done

**Goal:** Backend serves MAIN as bytes with correct HTTP semantics.

**Work:**

* `GET /api/main.pdf` streams the file
* Use `http.ServeContent` (or equivalent) so Range requests work
* Handle missing/invalid MAIN path with a clear UI state

**Manual test recipe:**

* Open a large PDF and verify it loads quickly and doesn’t download the whole file upfront (best-effort)

**Acceptance:**

* `zview some.pdf` loads in UI
* Range requests function (as much as the environment allows)

---

### 6) Continuous scroll viewer (16px gap)

#### `task/continuous-scroll-view`

* [ ] Done

**Goal:** Continuous scroll with correct layout.

**Work:**

* Render multiple pages in a vertical list
* 16px gap between pages
* Track “current page” best-effort (viewport top)

**Acceptance:**

* Scrolling shows page sequence with stable gaps

---

### 7) Zoom model: `+/-` and `=` fit-to-width

#### `task/zoom-and-fit-width`

* [ ] Done

**Goal:** Implement zoom and fit-to-width.

**Work:**

* Manual zoom steps: 1.1x per key press
* `=` sets fit-to-width
* When fit-to-width is active:

  * window resize recomputes scale
* Pressing `+/-` switches to manual zoom

**Acceptance:**

* Zoom feels responsive
* Fit-to-width behaves predictably

---

### 8) Keybinding engine (Vim-like subset)

#### `task/keybindings-core`

* [ ] Done

**Goal:** Reliable key handling for navigation and actions.

**Work:**

* Key handler with multi-key sequence support (`gg`)
* Implement commands:

  * `j/k`, `d/u`, `gg`, `G`, `n/p`
  * `+/-`, `=`
  * `Tab` (focus toggle)
  * `x` (swap)
  * `r` / `R` (reload semantics; see later tasks)
  * `?` help overlay, `q` quit
* Ensure keys only act when app is “active” (avoid fighting browser shortcuts)

**Acceptance:**

* Keybindings work consistently while viewer is focused
* `?` shows a help overlay listing current bindings

---

### 9) Two-pane: MAIN + SUB (static)

#### `task/two-pane-main-sub`

* [ ] Done

**Goal:** Optional second pane and consistent role labeling.

**Work:**

* Backend:

  * `--sub <PATH>` optional
  * `GET /api/sub.pdf` serves SUB bytes (Range supported if easy)
* Frontend:

  * Two-pane layout (when SUB exists)
  * Headers always show `MAIN` / `SUB`
  * SUB marked `static` (no reload)

**Acceptance:**

* Launch with `--sub` shows two PDFs side-by-side
* MAIN/SUB are always visually distinguishable

---

### 10) Focus toggle + swap polish

#### `task/focus-and-swap-polish`

* [ ] Done

**Goal:** Remove ambiguity when switching focus.

**Work:**

* `Tab` toggles focus MAIN ↔ SUB
* Focus ring + header emphasis for focused pane
* `x` swaps left/right positions while roles remain MAIN/SUB

**Acceptance:**

* Users can always identify MAIN vs SUB at a glance

---

### 11) Reload semantics (manual only)

#### `task/manual-reload-main`

* [ ] Done

**Goal:** Implement manual reload behavior, stable on failure.

**Work:**

* `r`: reload MAIN (cache-bust request)
* `R`: reload MAIN and re-render SUB (SUB does not re-read from disk)
* On MAIN reload failure: keep current display and show brief status

**Acceptance:**

* Reload never blanks the viewer on failure

---

### 12) Auto-reload (watch ON) via SSE

#### `task/watch-sse-autoreload`

* [ ] Done

**Goal:** MAIN auto-reloads when watching is enabled.

**Decisions:**

* When `--no-watch`: **no detection** and no “changed” indicator

**Work:**

* Backend:

  * Watch MAIN file when `--watch` (default)
  * Debounce change notifications (200–500ms)
  * SSE endpoint `/events`
* Frontend:

  * Connect to SSE when watch is ON
  * On event: reload MAIN (cache bust)

**Acceptance:**

* Rebuilding MAIN PDF triggers auto-reload
* Mid-write failure leaves old display intact

---

### 13) Scroll position restoration after reload

#### `task/restore-scroll-position`

* [ ] Done

**Goal:** After MAIN reload, return to the same reading location.

**Work:**

* Before reload snapshot:

  * `topPageIndex` (page nearest viewport top)
  * `offsetPx` within that page
  * zoom mode/state
  * fallback: scrollTop ratio
* After reload, once layout measured:

  * If page exists: restore by page top + offsetPx
  * If page count decreased: restore using height-only fallback (ratio/clamp)

**Acceptance:**

* Reload lands near the same vertical position

---

### 14) Performance hardening (must-have)

#### `task/perf-virtualization`

* [ ] Done

**Goal:** Smooth scrolling and bounded memory.

**Work (required):**

* Virtualize pages: render only visible + small buffer
* Placeholder for offscreen pages with stable height
* Cancel in-flight render tasks when page leaves buffer
* DPR cap (e.g. max 2.0)

**Optional (if easy):**

* Low-res while scrolling; high-res on idle

**Acceptance:**

* Large PDFs remain responsive
* Memory does not grow without bound after long scrolling

---

### 15) UI status + clarity

#### `task/ui-status-and-toasts`

* [ ] Done

**Goal:** Clear minimal UI without clutter.

**Work:**

* Pane header badges:

  * `MAIN • watching` or `MAIN • manual`
  * `SUB • static`
* Toast/status messages:

  * reload success/failure (brief)
* Toolbar buttons wired:

  * Open MAIN, Open SUB, Swap, Reload MAIN, Help

**Acceptance:**

* State is understandable without reading docs

---

### 16) CI + release readiness

#### `task/ci-release`

* [ ] Done

**Goal:** Repeatable builds and basic automation.

**Work:**

* CI pipeline:

  * Frontend: `pnpm install` + `pnpm build`
  * Backend: `go test` + `go build`
* Add `--version` output and simple versioning strategy
* Document build/release steps (short)

**Acceptance:**

* CI green on main
* Release binary is produced reliably

---

## Optional follow-ups (only after MVP)

#### `task/config-file`

* [ ] Done

**Goal:** Allow configuration (keymaps/defaults) without adding runtime deps.

**Scope idea:**

* Read `~/.config/zview/config.toml` (optional)
* Only safe toggles first (watch default, zoom step, DPR cap)

---

## Notes

* Keep PDF.js pinned to a known-good version to avoid worker mismatch surprises.
* Performance tasks are first-class: avoid implementing features that require a TextLayer.
