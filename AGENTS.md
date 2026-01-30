# AGENTS.md

This document defines how humans and AI agents should work in the **zview** repository.

zview is a **fast, lightweight, read-only PDF viewer** that runs in the browser. The CLI starts a local server and opens the Web UI.

---

## Project constraints (do not violate)

* **Read-only**: no editing/annotations/forms.
* **No in-document search**: do not add TextLayer/search UI by default.
* **Local files only**: no URL loading.
* **Two panes max**: roles are **MAIN** and **SUB**.

  * **SUB is static** (no re-read from disk). Replacing SUB is done via “Open Sub”.
* **Performance-first**: virtualization + render cancellation are core requirements.
* **Watch OFF means no detection**: when `--no-watch`, do not detect/indicate changes.

---

## Development workflow

### PLAN

- When a task is completed, mark the corresponding task in `PLAN.md` as complete.　

### Branch/worktree

* Work is organized by task branches/worktrees (recommended: `task/<slug>`).
* One task should be small and reviewable; split if it grows.

### Commit policy (important)

We commit at every meaningful development boundary:

* **After each task is completed** (per PLAN)
* **After each requested fix/refactor is completed**
* Also acceptable: commit when reaching a stable, testable intermediate state

Rules:

* Prefer **small, atomic commits** that build and run.
* Avoid long-running “WIP” commits on shared branches.
* Each commit message should describe *what changed and why*.

Recommended commit prefixes:

* `feat:` new user-visible functionality
* `fix:` bug fix
* `perf:` performance improvement
* `refactor:` internal restructure, no behavior change
* `docs:` documentation only
* `chore:` tooling/CI/maintenance
* `test:` tests only

Example:

* `feat: add fit-to-width (=) zoom mode`
* `perf: virtualize offscreen pages and cancel render tasks`

### Pull requests & review (Codex)

* If you are instructed to **create a PR** (or PR creation is part of the task), you must request an automated review by adding a PR comment containing **`@codex`**.
* The `@codex` comment triggers the automatic review workflow.
* Do this **on the PR** (not only in local notes), as soon as the PR is opened.
* When opening a PR, use the repository pull request template `.github/pull_request_template.md` to populate the description.

---

## Quality gates (before committing)

### Always run (for touched area)

* Frontend:

  * `pnpm lint` (or repo equivalent)
  * `pnpm fmt` (or repo equivalent)
  * `pnpm test` (if present)
  * `pnpm build`
* Backend:

  * `gofmt` (or `go fmt ./...`)
  * `go test ./...`
  * `go build ./...`

### Manual test checklist (minimum)

When changing viewer behavior, manually verify:

* MAIN loads a PDF and renders pages in continuous scroll
* `+` / `-` zoom and `=` fit-width work
* `Tab` toggles focus; MAIN/SUB labels remain clear
* `x` swaps panes (roles remain MAIN/SUB)
* `r` reloads MAIN; on load failure the old view remains
* Large PDF scroll remains responsive (no runaway memory)

---

## Repository rules

### Dependencies

* Frontend uses **pnpm**.
* Commit **only** `pnpm-lock.yaml` (do not add other lockfiles).
* Prefer minimal dependencies; justify any new dependency in the PR/commit.

### TypeScript/JS

* Keep rendering/state logic typed.
* Avoid global state where possible; centralize viewer state per pane.
* Do not add TextLayer by default.

### Go

* Keep the backend small: CLI + HTTP + (optional) file watch.
* Bind to **127.0.0.1 only**.
* Prefer `http.ServeContent` for serving PDFs (Range support).

---

## Architecture expectations

### Backend responsibilities

* Serve embedded frontend `dist/`.
* Serve MAIN PDF at `/api/main.pdf` (Range supported).
* Optionally serve SUB at `/api/sub.pdf` if provided via CLI.
* Watch MAIN when `--watch` (default) and notify via SSE `/events`.

  * Debounce file change notifications (200–500ms).
  * Updates may be atomic replace; watcher must handle rename/replace.

### Frontend responsibilities

* Continuous scroll with **16px** gap.
* Render using PDF.js with a correctly bundled worker (no CDN mixing).
* **Virtualization**: only render visible pages (+ small buffer).
* **Cancelable renders**: cancel in-flight render tasks when pages leave buffer.
* **DPR cap** to prevent memory blowups (e.g. max 2.0).
* Pane model:

  * MAIN reloadable (auto when watch ON; manual via `r` always)
  * SUB static (no disk re-read)
  * Swap changes only position; roles remain

---

## UX rules

* MAIN/SUB must always be distinguishable:

  * Persistent badges in pane headers: `MAIN` / `SUB`
  * Status labels: `watching` / `manual` / `static`
  * Focus ring for the focused pane
* Keybindings must not fight common browser shortcuts; only act when the app is active.
* Reload failure must never blank/crash the viewer.

---

## Performance rules (treat as requirements)

* Never render all pages at high resolution by default.
* Prefer incremental work:

  * placeholders → low-res → high-res on idle
* Always cancel useless work (renders, async tasks) when user scrolls quickly.
* Measure or at least reason about big-O and memory impacts when changing rendering.

---

## Documentation rules

Whenever behavior changes, update:

* `README.md` (user-facing usage/keys)
* `TECH_STACK.md` (stack/architecture decisions)
* `PLAN.md` (if task structure changes)

Keep docs short and practical.

---

## Security rules

* Server must bind to localhost only.
* Prefer a per-launch random token in the UI URL or headers to reduce accidental access.
* No remote URL fetching.

---

## Language

* Default to English for code, documentation, and UI text unless a task explicitly requests another language.
* Keep wording concise and clear when adding copy or comments.

## Tooling expectations

* Use **pnpm** for all Node package installs/updates; run installs from the frontend directory unless specified.
* Tailwind CSS should be version **4.x** for styling work (prefer the latest stable in the 4.x line).

---

## When in doubt

* Favor the simplest implementation that preserves performance constraints.
* Split the work into smaller tasks and commit at each stable boundary.
