package main

import (
	"embed"
	"encoding/json"
	"fmt"
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

func spaHandler(staticFS fs.FS, config Config) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))

	// Marshal config to JSON for injection
	configJSON, _ := json.Marshal(config)
	configScript := fmt.Sprintf("<script>window.ZVIEW_CONFIG = %s;</script>", string(configJSON))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Serve index.html directly with config injection
		if path == "index.html" {
			data, err := fs.ReadFile(staticFS, "index.html")
			if err != nil {
				http.Error(w, "index.html missing in embedded assets", http.StatusInternalServerError)
				return
			}

			// Inject config script before </head>, or append to body if not found
			htmlContent := string(data)
			if strings.Contains(htmlContent, "</head>") {
				htmlContent = strings.Replace(htmlContent, "</head>", configScript+"</head>", 1)
			} else {
				htmlContent += configScript
			}

			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(htmlContent))
			return
		}

		if exists(staticFS, path) {
			r.URL.Path = "/" + path
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for unknown routes.
		r.URL.Path = "/index.html"
		// Recurse to handle index.html logic (injection)
		// But we can't easily recurse with modified request path to serve modified content.
		// Instead, we just call the injection logic again or refactor.
		// Refactoring:

		data, err := fs.ReadFile(staticFS, "index.html")
		if err != nil {
			http.Error(w, "index.html missing", http.StatusInternalServerError)
			return
		}

		htmlContent := string(data)
		if strings.Contains(htmlContent, "</head>") {
			htmlContent = strings.Replace(htmlContent, "</head>", configScript+"</head>", 1)
		} else {
			htmlContent += configScript
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(htmlContent))
	})
}

func exists(fsys fs.FS, name string) bool {
	_, err := fs.Stat(fsys, name)
	return err == nil
}
