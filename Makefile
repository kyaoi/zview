SHELL := /bin/bash
MAKEFLAGS += --warn-undefined-variables
.DEFAULT_GOAL := help

FRONTEND_DIR := frontend
BACKEND_DIR := backend

.PHONY: help dev build fmt lint test clean

help:
	@echo "Targets:"
	@echo "  dev   - 開発サーバーのプレースホルダ"
	@echo "  build - ビルド手順のプレースホルダ"
	@echo "  fmt   - Go/TypeScript を整形 (存在する場合のみ)"
	@echo "  lint  - Go/pnpm の lint を実行 (存在する場合のみ)"
	@echo "  test  - Go/pnpm のテストを実行 (存在する場合のみ)"
	@echo "  clean - 生成物を削除"

# 後続タスクで frontend/backend の実処理を紐付ける前提のダミー
# いまは成功終了のみ保証する

dev:
	@echo "Dev: 後続タスクで frontend/backend の開発サーバーをここに統合予定です"

build:
	@echo "Build: 後続タスクで frontend build → backend build を追加予定です"

fmt:
	@echo "fmt: backend (Go) を整形…"
	@if [ -d $(BACKEND_DIR) ] && find $(BACKEND_DIR) -type f -name '*.go' | read; then \
	  if command -v gofmt >/dev/null 2>&1; then \
	    gofmt -w $$(find $(BACKEND_DIR) -type f -name '*.go'); \
	  else \
	    echo 'gofmt が見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'Go ファイルなし: skip'; \
	fi
	@echo "fmt: frontend (pnpm) を整形…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm fmt || true; \
	  else \
	    echo 'pnpm が見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json がまだありません: skip'; \
	fi

lint:
	@echo "lint: backend (Go) をチェック…"
	@if [ -f $(BACKEND_DIR)/go.mod ]; then \
	  if command -v go >/dev/null 2>&1; then \
	    cd $(BACKEND_DIR) && go vet ./...; \
	  else \
	    echo 'go コマンドが見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'backend/go.mod がまだありません: skip'; \
	fi
	@echo "lint: frontend (pnpm) をチェック…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm lint || true; \
	  else \
	    echo 'pnpm が見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json がまだありません: skip'; \
	fi

test:
	@echo "test: backend (Go) を実行…"
	@if [ -f $(BACKEND_DIR)/go.mod ]; then \
	  if command -v go >/dev/null 2>&1; then \
	    cd $(BACKEND_DIR) && go test ./...; \
	  else \
	    echo 'go コマンドが見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'backend/go.mod がまだありません: skip'; \
	fi
	@echo "test: frontend (pnpm) を実行…"
	@if [ -f $(FRONTEND_DIR)/package.json ]; then \
	  if command -v pnpm >/dev/null 2>&1; then \
	    cd $(FRONTEND_DIR) && pnpm test || true; \
	  else \
	    echo 'pnpm が見つかりませんでした: skip'; \
	  fi; \
	else \
	  echo 'frontend/package.json がまだありません: skip'; \
	fi

clean:
	@echo "clean: 一時生成物を削除します"
	@rm -rf $(FRONTEND_DIR)/dist $(FRONTEND_DIR)/node_modules $(BACKEND_DIR)/bin dist tmp
