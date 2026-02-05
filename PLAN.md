# PLAN.md

This plan breaks development of **zview** into small, reviewable tasks.

* Each task maps to **one branch/worktree** (recommended name: `task/<slug>`).
* This document focuses on **what to do in each worktree** (you manage worktree creation on your side).
* Mark tasks complete by checking the box.

---

## Definition of Done (applies to every task)

A task is "done" when:

* Builds locally (dev and prod path for the touched side)
* Formatting/lint pass for touched code
* Any new behavior has **automated tests** (manual test recipe is only a fallback for UI-heavy logic)
* Docs updated if user-facing behavior/CLI/keybindings changed

---

## Repository layout (target)

* `backend/` — Go CLI + local HTTP server
* `frontend/` — Vite + TS web app
* `docs/` — extra documentation (optional)

---

## Planned Tasks

* [x] **Task 1:** Multi-tab SUB PDF Support
* [x] **Task 2:** Password Protected PDF Support

---

## Task Format Example

When adding new tasks, please follow this format to maintain consistency with the project history:

### List Entry
* `* [ ] **Task N:** Task Name`

### Detailed Description (Optional, for active tasks)
#### `task/branch-slug`
* [ ] Not Started

**Goal:**
Brief description of the goal.

**Details:**
* Bullet points of specific requirements.

**Acceptance Criteria:**
* [ ] Criteria 1
* [ ] Criteria 2

---

## Task Details

#### `task/multi-tab-sub`
* [x] **Task 1:** Multi-tab SUB PDF Support

**Goal:**
Allow users to open multiple secondary PDFs and switch between them easily in the SUB pane, improving reference capabilities.

**Details:**
* Implement a tab bar or switcher in the SUB pane.
* Allow opening a new SUB PDF without replacing the existing one (add to tabs).
* Limit the number of open tabs if necessary to prevent memory issues.
* Keyboard shortcuts to switch tabs (e.g., `Shift+H`/`Shift+L` or similar).

**Acceptance Criteria:**
* [x] User can open multiple PDFs in the SUB pane.
* [x] User can switch between open SUB PDFs using UI/Keyboard.
* [x] Performance remains stable with multiple PDFs loaded.

#### `task/password-pdf`
* [x] **Task 2:** Password Protected PDF Support

**Goal:**
Allow users to view password-protected PDFs by providing a mechanism to enter the password.

**Details:**
* Detect when a PDF requires a password.
* Display a prompt (dialog or input field) to enter the password.
* Retry opening the PDF with the provided password.
* Handle incorrect passwords gracefully (re-prompt).

**Acceptance Criteria:**
* [x] Opening a locked PDF triggers a password prompt.
* [x] Entering the correct password opens the PDF successfully.
* [x] Entering an incorrect password shows an error and allows retry.
* [x] Canceling leaves the viewer in a safe state.
