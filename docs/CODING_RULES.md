# Coding Rules

Guidelines for maintaining code quality in zview.

## File Size Limits

| Type | Max Lines | Recommended |
|------|-----------|-------------|
| Component | 300 | < 200 |
| Custom Hook | 200 | < 150 |
| Go file | 400 | < 300 |

If a file exceeds these limits, consider splitting it.

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React Component | PascalCase | `PageCanvas` |
| Custom Hook | use + verb/noun | `usePdfDocument` |
| Props type | Component + Props | `PageCanvasProps` |
| Go package | lowercase | `internal/server` |
| Go type | PascalCase | `AppState` |
| Constants | SCREAMING_SNAKE | `PAGE_GAP_PX` |

## Responsibility Separation

### Frontend

```
components/  → UI rendering only
hooks/       → Business logic & state
lib/         → Utilities, types, constants
```

- Components should be pure view logic
- Side effects belong in hooks
- No circular dependencies

### Backend

```
main.go           → Entry point only
internal/cli/     → CLI parsing
internal/config/  → Configuration
internal/server/  → HTTP handlers
internal/state/   → Application state
internal/watcher/ → File watching
internal/session/ → Session management
```

- Each package has a single responsibility
- `main` imports from `internal/`, not vice versa

## Error Handling

### Frontend
```typescript
try {
  const result = await fetch(...);
  if (!result.ok) throw new Error("Failed");
  // success
} catch (err) {
  addToast("Operation failed", "error");
}
```

### Backend
```go
if err != nil {
    http.Error(w, "description", http.StatusBadRequest)
    return
}
```

## Testing

- Unit tests alongside source files (`*_test.go`, `*.test.ts`)
- Test public interfaces, not internals
- Use table-driven tests in Go

## Git Commits

Use prefixes:
- `feat:` new functionality
- `fix:` bug fix
- `refactor:` internal restructure
- `docs:` documentation
- `test:` tests only
- `chore:` tooling/CI

Example: `feat: add fit-to-height zoom mode`

## Code Review Checklist

- [ ] No console.log / fmt.Printf left in
- [ ] Error cases handled
- [ ] Types are explicit (no `any`)
- [ ] Tests added for new logic
- [ ] Documentation updated if behavior changed
