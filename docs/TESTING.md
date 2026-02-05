# Testing

Quick reference for current automated tests and how to extend them.

## Prerequisites

- E2E tests start the `zview` binary from the repo root. Build it once with `mise run build:backend` or `mise run build`.
- If Playwright browsers are missing, install them with `npx playwright install`.

## Test Suites

Frontend unit tests (Vitest)
- `src/lib/config.test.ts`: key config normalization, conflicts, display format
- `src/lib/keyActions.test.ts`: key action definitions and categories
- `src/lib/keyMatcher.test.ts`: key matching, modifiers, special keys, shift rules
- `src/lib/keyBindings.defaultKeys.test.ts`: default bindings are matchable
- `src/lib/actionHandlers.test.ts`: action handler behavior and help overlay navigation
- `src/hooks/useKeyboardNavigation.test.tsx`: key handling, sequences (incl. `<Space>`), sequence timeout, blocked keys, help mode, conflict warnings, form-field ignore
- `src/hooks/useTabManager.test.ts`: tab switching, close behavior, snapshots, error paths
- `src/hooks/useFileWatcher.test.ts`: EventSource wiring for watch
- `src/hooks/useBootstrap.test.ts`: bootstrap fetch success/failure
- `src/hooks/useSwapPanes.test.tsx`: swap logic and snapshots

Frontend E2E (Playwright)
- `e2e/keybindings.spec.ts`: keyboard interactions against real rendered PDF
- `e2e/multi-tab.spec.ts`: SUB tabs and tab switching
- `e2e/password-protected.spec.ts`: password prompt flow with encrypted PDF

Backend unit tests (Go)
- `internal/cli/*_test.go`: CLI parsing
- `internal/config/*_test.go`: config loading
- `internal/state/*_test.go`: state management
- `internal/server/*_test.go`: HTTP handlers + SSE formatting
- `internal/session/*_test.go`: session file lifecycle
- `internal/watcher/*_test.go`: fsnotify debounce + matching

## Fixtures

- `frontend/e2e/pdfs/01_minimal.pdf`
- `frontend/e2e/pdfs/02_multipage_navigation.pdf`
- `frontend/e2e/pdfs/03_large_dimension.pdf`
- `frontend/e2e/pdfs/04_wide_landscape.pdf`
- `frontend/e2e/pdfs/05_password_protected.pdf` (password: `secret`)

If keybinding tests need a new fixture, generate it in `frontend/scripts/generate-test-pdfs.mjs` and place output under `frontend/e2e/pdfs/`.

## Running Tests

```bash
# Generate / refresh E2E PDF fixtures (run only when needed)
mise run fixtures:e2e

# Frontend unit tests
cd frontend && pnpm test

# Frontend typecheck
cd frontend && pnpm check

# Backend unit tests
cd backend && go test ./...

# E2E
cd frontend && npx playwright test

# E2E with Playwright logs and server stdout/stderr
cd frontend && pnpm test:e2e:debug

# E2E with Playwright logs via mise
mise run test:e2e:debug

# Build backend (required before E2E if binary is missing)
mise run build:backend

# Full suite
mise run test
```
