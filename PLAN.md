# PLAN.md

This plan breaks development of **zview** into small, reviewable tasks.

* Each task maps to **one branch/worktree** (recommended name: `task/<slug>`).
* This document focuses on **what to do in each worktree** (you manage worktree creation on your side).
* Mark tasks complete by checking the box.

---

## Progress tracking

* [x] **Milestone 0:** Repo + tooling bootstrapped
* [x] **Milestone 1:** Single-PDF viewer works end-to-end
* [x] **Milestone 2:** Keybindings + zoom/fit-width
* [x] **Milestone 3:** Two-pane MAIN/SUB + focus + swap
* [x] **Milestone 4:** Reload (manual + auto) + scroll restoration
* [x] **Milestone 5:** Performance hardening
* [x] **Milestone 6:** Packaging + CI + release readiness

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

### 17) Launch Viewer without specifying MAIN PDF via CLI

#### `task/dynamic-main-selection`

* [ ] Done

**Goal:** Allow opening the viewer without any CLI arguments and selecting the MAIN PDF from the web interface.

**Work:**

* Backend:
  * Allow starting without a default MAIN PDF path.
  * Serve a "No PDF Loaded" state or placeholder for MAIN.
  * Reuse/adapt the file upload endpoint (currently used for SUB) to support MAIN.
* Frontend:
  * Show a "Open Main PDF" button/UI when no MAIN PDF is loaded.
  * Ensure file selection triggers the normal loading/rendering flow.

**Acceptance:**

* Running `zview` (no args) opens the viewer.
* User can select a local file to populate the MAIN pane.
* Watch/reload functionality should ideally work for the selected file if possible (or gracefully degrade to manual reload).

---

### 18) Multi-tab support for SUB PDFs

#### `task/multi-tab-sub-pane`

* [ ] Done

**Goal:** Support loading multiple reference PDFs (SUB) and switching between them via tabs, while displaying at most one MAIN and one SUB pane at a time.

**Work:**

* Frontend:
  * Manage a list of loaded SUB PDFs (name, data/url).
  * Add a tab bar (or similar selector) in the SUB pane header area.
  * Switching tabs changes the active SUB PDF without reloading from disk if possible (cached).
  * "Open (Sub)" button adds a new tab instead of replacing the current one.
  * Add ability to close tabs.

**Acceptance:**

* User can load multiple files into the SUB pane.
* Tabs allow quick switching between loaded references.
* Zoom/scroll state is preserved per tab (ideally).

---

### 19) Improve focus indication

#### `task/improve-focus-visibility`

* [ ] Done

**Goal:** Make the active pane (MAIN vs SUB) more visually distinct than just dimming the inactive one.

**Work:**

* Frontend:
  * Design a clearer active state (e.g., prominent colored border, header highlight, or shadow elevation).
  * Ensure it remains accessible and visible in different lighting conditions.
  * Consider removing or reducing the dimming effect if the new indicator is strong enough, to improve readability of the reference pane.

**Acceptance:**

* Current active pane is instantly recognizable.
* Users don't struggle to read the inactive pane (due to excessive dimming).

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
