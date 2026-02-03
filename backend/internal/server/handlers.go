package server

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/kyaoi/zview/backend/internal/config"
	"github.com/kyaoi/zview/backend/internal/state"
)

const maxUploadSize = 300 * 1024 * 1024 // 300MB

// LoadEmbeddedDist extracts the embedded frontend assets from an embed.FS.
func LoadEmbeddedDist(embeddedDist embed.FS) (fs.FS, error) {
	return fs.Sub(embeddedDist, "dist")
}

// BootstrapData represents initial app state for the frontend.
type BootstrapData struct {
	Focus       string         `json:"focus"`
	HasMain     bool           `json:"hasMain"`
	HasSub      bool           `json:"hasSub"`
	Watch       bool           `json:"watch"`
	SubTabs     []state.SubTab `json:"subTabs"`
	ActiveSubId string         `json:"activeSubId"`
}

// HandleMainPDF returns a handler for serving the MAIN PDF.
func HandleMainPDF(s *state.AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := s.GetMainPath()
		if path == "" {
			http.Error(w, "MAIN not loaded", http.StatusNotFound)
			return
		}
		serveFile(w, r, path)
	}
}

// HandleSubPDF returns a handler for serving SUB PDFs.
func HandleSubPDF(s *state.AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		var path string

		if id != "" {
			tab := s.GetSubTab(id)
			if tab != nil {
				path = tab.Path
			}
		} else {
			// Legacy/Compatibility: return active sub path if no ID provided
			path = s.GetSubPath()
		}

		if path == "" {
			http.Error(w, "SUB not loaded", http.StatusNotFound)
			return
		}
		serveFile(w, r, path)
	}
}

// HandleBootstrap returns a handler for the bootstrap endpoint.
func HandleBootstrap(s *state.AppState, focus string, watch bool) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		resp := BootstrapData{
			Focus:       focus,
			HasMain:     s.GetMainPath() != "",
			HasSub:      s.HasSub(),
			Watch:       watch,
			SubTabs:     s.GetSubTabs(),
			ActiveSubId: s.GetActiveSubId(),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// HandleSubUpload returns a handler for uploading SUB PDFs.
func HandleSubUpload(s *state.AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "failed to read file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		tmpDir := os.TempDir()
		tmpFile, err := os.CreateTemp(tmpDir, "zview-sub-*.pdf")
		if err != nil {
			http.Error(w, "failed to create temp file", http.StatusInternalServerError)
			return
		}

		if _, err := io.Copy(tmpFile, file); err != nil {
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			http.Error(w, "failed to write file", http.StatusInternalServerError)
			return
		}
		tmpFile.Close()

		// Add as new tab
		id := s.AddSubTab(header.Filename, tmpFile.Name(), true)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"id":   id,
			"name": header.Filename,
		})
	}
}

// HandleSubDelete returns a handler for deleting SUB tabs.
func HandleSubDelete(s *state.AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			// If no ID, clear all (legacy behavior was "close sub").
			s.Cleanup()
			w.WriteHeader(http.StatusOK)
			return
		}

		removed := s.RemoveSubTab(id)
		if !removed {
			http.Error(w, "Tab not found", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

// HandleMainUpload returns a handler for uploading MAIN PDFs.
func HandleMainUpload(s *state.AppState, broadcaster *Broadcaster) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "failed to read file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		tmpDir := os.TempDir()
		tmpFile, err := os.CreateTemp(tmpDir, "zview-main-*.pdf")
		if err != nil {
			http.Error(w, "failed to create temp file", http.StatusInternalServerError)
			return
		}

		if _, err := io.Copy(tmpFile, file); err != nil {
			tmpFile.Close()
			os.Remove(tmpFile.Name())
			http.Error(w, "failed to write file", http.StatusInternalServerError)
			return
		}
		tmpFile.Close()

		s.SetMainPath(tmpFile.Name(), true)

		// Notify clients that MAIN has changed
		if broadcaster != nil {
			broadcaster.Broadcast("main-changed", "")
		}

		w.WriteHeader(http.StatusOK)
	}
}

// SPAHandler creates an HTTP handler for serving the SPA with config injection.
func SPAHandler(staticFS http.FileSystem, cfg config.Config) http.Handler {
	fileServer := http.FileServer(staticFS)

	// Marshal config to JSON for injection
	configJSON, _ := json.Marshal(cfg)
	configScript := fmt.Sprintf("<script>window.ZVIEW_CONFIG = %s;</script>", string(configJSON))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" || path == "" {
			serveIndexWithConfig(w, staticFS, configScript)
			return
		}

		// Try to serve the file
		f, err := staticFS.Open(path)
		if err != nil {
			// SPA fallback: serve index.html for unknown routes
			serveIndexWithConfig(w, staticFS, configScript)
			return
		}
		f.Close()

		fileServer.ServeHTTP(w, r)
	})
}

func serveIndexWithConfig(w http.ResponseWriter, staticFS http.FileSystem, configScript string) {
	f, err := staticFS.Open("/index.html")
	if err != nil {
		http.Error(w, "index.html missing in embedded assets", http.StatusInternalServerError)
		return
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, "failed to read index.html", http.StatusInternalServerError)
		return
	}

	htmlContent := string(data)
	if idx := strings.Index(htmlContent, "</head>"); idx != -1 {
		htmlContent = htmlContent[:idx] + configScript + htmlContent[idx:]
	} else {
		htmlContent += configScript
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(htmlContent))
}

func serveFile(w http.ResponseWriter, r *http.Request, path string) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		http.Error(w, "invalid path", http.StatusInternalServerError)
		return
	}

	f, err := os.Open(absPath)
	if err != nil {
		http.Error(w, "file not found", http.StatusNotFound)
		return
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		http.Error(w, "stat failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
}
