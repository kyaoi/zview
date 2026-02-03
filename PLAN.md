# PLAN.md

This plan breaks development of **zview** into small, reviewable tasks.

* Each task maps to **one branch/worktree** (recommended name: `task/<slug>`).
* This document focuses on **what to do in each worktree** (you manage worktree creation on your side).
* Mark tasks complete by checking the box.

---

## Progress tracking

* [x] **Task 1:** Fix PDF darkening on swap
* [x] **Task 2:** Configurable Keybindings
* [x] **Task 3:** Enhance CI and Pre-commit/Pre-push hooks
* [x] **Task 4:** Documentation Maintenance
* [x] **Task 5:** Refactoring and Architecture cleanup

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

### 1) Fix PDF darkening on swap

#### `task/fix-swap-darkening`

* [x] Done

**Goal:** Fix the issue where the PDF becomes dark (dimmed) incorrectly when swapping panes.

**Work:**
* Investigate the `s` (swap) command logic.
* Ensure that the "active" and "inactive" states are correctly applied after the swap.
* The new active pane should be fully opaque, and the new inactive pane should handle dimming (if applicable) correctly without getting stuck in a darkened state.
* Verify focus indication logic works as intended after swap.

**Acceptance:**
* Swapping panes results in the new MAIN/SUB positions having correct visual brightness/opacity.
* No "stuck" darkened state.

---

### 2) Configurable Keybindings

#### `task/config-keybindings`

* [x] Done

**Goal:** Allow users to customize keybindings via the config file.

**Work:**
* Extend `~/.config/zview/config.toml` to support a `[keys]` section (or similar).
* Update `frontend` to read these key mappings.
* **Crucial:** Update the **Help Overlay** (triggered by `?`) to display the *actual* configured keys, not just hardcoded defaults.

**Acceptance:**
* Users can remap keys (e.g., `j/k` to `ArrowUp/ArrowDown` etc.).
* The Help menu reflects user changes.
* Defaults are strictly preserved if no config is present.

---

### 3) Enhance CI and Pre-commit/Pre-push hooks

#### `task/enhance-ci`

* [x] Done

**Goal:** strengthen the development workflow and ensure quality gates are automated locally and in CI.

**Work:**
* **Local:** Implement `Lefthook` (or similar) for pre-commit/pre-push checks (lint, fmt, build).
  * Manage tools via `mise.toml` if possible.
* **CI:** Review and strengthen GitHub Actions (or current CI system).
  * Ensure lint/test/build passes on every PR.
  * Check if existing workflows are sufficient or need expansion.

**Acceptance:**
* `git commit` / `git push` automatically runs checks locally (Lefthook).
* CI pipeline is robust and catches errors early.

---

### 4) Documentation Maintenance

#### `task/docs-maintenance`

* [x] Done

**Goal:** Clean up and standardize documentation.

**Work:**
* Review `README.md`, `AGENTS.md`, `DEVELOPMENT.md` etc.
* Remove outdated information.
* **AGENTS.md check:** Review if `AGENTS.md` contains sensitive or unnecessary "internal" instructions that shouldn't be in a public repo. Move sensitive parts to a private doc or delete if obsolete.
* Ensure all docs match the current v0.2.0+ reality.

**Acceptance:**
* Documentation is accurate and clean.
* No confusion about how to use or develop zview.

---

### 5) Refactoring and Architecture cleanup

#### `task/refactor-architecture`

* [x] Not Started

**Goal:** Improve code quality and remove technical debt.

**Work:**
* Identify dead code or unused files.
* Review architectural decisions (e.g., state management, backend-frontend communication).
* Refactor for readability and maintainability.
* "Cleaner way of writing code" — apply consistent patterns (e.g., in React components or Go handlers).

**Acceptance:**
* Codebase is cleaner and smaller (if dead code removed).
* No regression in functionality.
