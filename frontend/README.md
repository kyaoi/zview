# Frontend (Vite + React + Tailwind CSS)

Web UI shell built with Vite + TypeScript, powered by PDF.js.

## Requirements

- Node.js **22.x or 24.x LTS** (developed on Node 22)
- pnpm **10.x** (matches the `packageManager` field)

## Scripts

```bash
cd frontend
pnpm install
pnpm dev       # Vite dev server
pnpm build     # Production build
pnpm preview   # Preview built assets
pnpm lint      # Biome lint
pnpm fmt       # Format check (no write)
pnpm fmt:write # Format with writes
pnpm check     # TypeScript noEmit check
pnpm test      # Placeholder
```

## Styling

- Tailwind CSS with a small theme extension (brand/accent colors, Space Grotesk font).
- Global styles live in `src/index.css` with Tailwind layers; avoid custom CSS files unless necessary.

## Fonts & i18n

- Bundles **Noto Sans JP Variable** for UI and PDF fallback to avoid tofu when offline.
- PDF.js CMaps and standard fonts are served from `public/pdfjs/` so builds work without network access.

## Current UI

- Top toolbar with actions: `Open(Main)`, `Open(Sub)`, `Swap`, `Reload`, `Help`.
- **MAIN Pane**: Displays the primary PDF, supports auto-reload.
- **SUB Pane**: Secondary view, supports multiple tabs.
- **Keybindings**: Vim-like navigation (j/k/d/u), distinct from browser defaults.
