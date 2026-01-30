# Frontend Tooling

This package uses pnpm and Node.js LTS.

## Requirements

- Node.js **22.x or 24.x LTS** (developed with Node 25 is fine, but LTS is recommended)
- pnpm (install via mise; any recent 10.x works — tested with 10.19.0; Corepack not required)

## Quick start

```bash
cd frontend
pnpm install
pnpm build  # currently a stub; replaced in the Vite skeleton task
```

`pnpm lint` and `pnpm fmt` run Biome (lint + format). Scripts are placeholders until the Vite skeleton is added in the next task.
