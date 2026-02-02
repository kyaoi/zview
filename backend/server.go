package main

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

// Embedded frontend (built via `pnpm build` → backend/dist).
//
//go:embed dist/* dist/**/*
var embeddedDist embed.FS

func loadEmbeddedDist() (fs.FS, error) {
	dist, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		return nil, err
	}
	return dist, nil
}

func spaHandler(staticFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Serve index.html directly to avoid FileServer's redirect quirks on root.
		if path == "index.html" {
			data, err := fs.ReadFile(staticFS, "index.html")
			if err != nil {
				http.Error(w, "index.html missing in embedded assets", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(data)
			return
		}

		if exists(staticFS, path) {
			r.URL.Path = "/" + path
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for unknown routes.
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}

func exists(fsys fs.FS, name string) bool {
	_, err := fs.Stat(fsys, name)
	return err == nil
}
