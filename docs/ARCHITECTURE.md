# Architecture

This document describes the architecture of zview.

## System Overview

```mermaid
graph TB
    subgraph CLI
        A[main.go] --> B[internal/cli]
        A --> C[internal/config]
    end
    
    subgraph Server
        A --> D[internal/server]
        D --> E[HTTP Handlers]
        D --> F[SSE Broadcaster]
        D --> G[SPA Handler]
    end
    
    subgraph State
        A --> H[internal/state]
        A --> I[internal/session]
    end
    
    subgraph Watcher
        A --> J[internal/watcher]
        J --> F
    end
    
    subgraph Frontend
        K[App.tsx] --> L[PdfViewer]
        K --> M[useKeyboardNavigation]
        K --> N[useBootstrap]
        K --> O[useFileWatcher]
    end
    
    E <-->|HTTP/SSE| K
```

## Backend Structure

```
backend/
├── main.go                    # Entry point (~80 lines)
└── internal/
    ├── cli/                   # CLI parsing
    │   ├── cli.go             # Options, Parse()
    │   ├── cli_test.go
    │   └── commands.go        # ps, kill subcommands
    ├── config/                # Configuration
    │   ├── config.go          # Config struct, Load()
    │   └── config_test.go
    ├── server/                # HTTP layer
    │   ├── handlers.go        # API handlers
    │   └── sse.go             # SSE broadcaster
    ├── session/               # Session management
    │   └── session.go         # Register/Unregister/List
    ├── state/                 # Application state
    │   ├── state.go           # AppState, SubTab
    │   └── state_test.go
    └── watcher/               # File watching
        └── watcher.go         # Start() with debouncing
```

## Frontend Structure

```
frontend/src/
├── App.tsx                    # Main orchestration
├── components/
│   ├── PdfViewer/             # PDF rendering
│   ├── Pane/                  # Container with header
│   ├── HelpOverlay/           # Keybinding help
│   ├── Menu/                  # Dropdown menu
│   ├── ToastContainer/        # Notifications
│   └── SubTabBar/             # SUB pane tabs
├── hooks/
│   ├── useKeyboardNavigation  # Keyboard handling
│   ├── useBootstrap           # Initial state loading
│   ├── useFileWatcher         # SSE file change watching
│   ├── useContinuousScroll    # Momentum-based scrolling
│   ├── useZoomManager         # Zoom state management
│   └── useTabManager          # SUB tab management
└── lib/
    ├── actionHandlers.ts      # Keyboard action handlers
    ├── config.ts              # Configuration loading
    ├── constants.ts           # Magic numbers
    ├── keyActions.ts          # Keybinding definitions
    ├── keyMatcher.ts          # Key matching utilities
    ├── types.ts               # Shared types
    └── utils.ts               # Utility functions
```

## Password-Protected PDFs

When PDF.js requests a password, the viewer overlays a password prompt in the active pane.
Incorrect entries re-open the prompt. Canceling leaves the current rendering intact.

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant FileSystem

    User->>Backend: Start zview main.pdf
    Backend->>Backend: Load config
    Backend->>Backend: Start HTTP server
    Backend->>Frontend: Serve SPA
    Frontend->>Backend: GET /api/bootstrap
    Backend-->>Frontend: {hasMain, watch, focus}
    Frontend->>Backend: GET /api/main.pdf
    Backend->>FileSystem: Read PDF
    FileSystem-->>Backend: PDF bytes
    Backend-->>Frontend: PDF (Range supported)
    
    Note over Frontend: Render PDF

    alt Watch enabled
        Backend->>FileSystem: Watch for changes
        FileSystem-->>Backend: File changed
        Backend->>Frontend: SSE: main-change
        Frontend->>Backend: GET /api/main.pdf?v=timestamp
    end
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single binary | Easy distribution, no runtime dependencies |
| Localhost only | Security, no network exposure |
| Embedded frontend | No separate file serving needed |
| Range request support | PDF.js partial loading |
| SSE for file watch | Simple, no websocket overhead |
| Virtualized rendering | Memory efficiency for large PDFs |
| DPR capping | Prevent memory blowups on high-DPI |
