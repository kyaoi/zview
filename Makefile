SHELL := /bin/bash
MAKEFLAGS += --warn-undefined-variables
.DEFAULT_GOAL := help

FRONTEND_DIR := frontend
BACKEND_DIR := backend

.PHONY: help dev build fmt lint test clean

help:
	@echo "Targets:"
	@echo "  dev   - placeholder for combined frontend/backend dev servers"
	@echo "  build - placeholder for frontend build → backend build"
	@echo "  fmt   - format Go/TypeScript if present"
	@echo "  lint  - run Go/pnpm linters if present"
	@echo "  test  - run Go/pnpm tests if present"
	@echo "  clean - remove generated artifacts"

# Dummy targets; real logic will be wired in later tasks.
# For now they just succeed.

dev:
	@echo "Dev: frontend/backend dev servers will be wired here in later tasks"

build:
	@echo "Build: frontend (pnpm build) → backend (go build)"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm build; \
	  else \
	    echo 'pnpm not found: build aborted' >&2; exit 1; \
	  fi; \
	else \
	  echo 'frontend/package.json not found: skip frontend build'; \
	fi
	@if [ -f $(BACKEND_DIR)/go.mod ]; then \
	  if command -v go >/dev/null 2>&1; then \
	    cd $(BACKEND_DIR) && go build -o ../zview; \
	  else \
	    echo 'go command not found: build aborted' >&2; exit 1; \
	  fi; \
	else \
	  echo 'backend/go.mod not found: skip backend build'; \
	fi

fmt:
	@echo "fmt: formatting backend (Go)…"
	@if [ -d $(BACKEND_DIR) ] && find $(BACKEND_DIR) -type f -name '*.go' | read; then \
	  if command -v gofmt >/dev/null 2>&1; then \
	    gofmt -w $$(find $(BACKEND_DIR) -type f -name '*.go'); \
	  else \
	    echo 'gofmt not found: skip'; \
	  fi; \
	else \
	  echo 'No Go files: skip'; \
	fi
	@echo "fmt: formatting frontend (pnpm)…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm fmt || true; \
	  else \
	    echo 'pnpm not found: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json not found: skip'; \
	fi

lint:
	@echo "lint: checking backend (Go)…"
	@if [ -f $(BACKEND_DIR)/go.mod ]; then \
	  if command -v go >/dev/null 2>&1; then \
	    cd $(BACKEND_DIR) && go vet ./...; \
	  else \
	    echo 'go command not found: skip'; \
	  fi; \
	else \
	  echo 'backend/go.mod not found: skip'; \
	fi
	@echo "lint: checking frontend (pnpm)…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm lint || true; \
	  else \
	    echo 'pnpm not found: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json not found: skip'; \
	fi

test:
	@echo "test: running backend (Go)…"
	@if [ -f $(BACKEND_DIR)/go.mod ]; then \
	  if command -v go >/dev/null 2>&1; then \
	    cd $(BACKEND_DIR) && go test ./...; \
	  else \
	    echo 'go command not found: skip'; \
	  fi; \
	else \
	  echo 'backend/go.mod not found: skip'; \
	fi
	@echo "test: running frontend (pnpm)…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm test || true; \
	  else \
	    echo 'pnpm not found: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json not found: skip'; \
	fi

clean:
	@echo "clean: removing generated artifacts"
	@rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/node_modules $(BACKEND_DIR)/bin dist tmp
