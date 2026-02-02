package main

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

func handleMainPDF(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := state.GetMainPath()
		if path == "" {
			http.Error(w, "MAIN not loaded", http.StatusNotFound)
			return
		}
		serveFile(w, r, path)
	}
}

func handleSubPDF(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		path := state.GetSubPath()
		if path == "" {
			http.Error(w, "SUB not loaded", http.StatusNotFound)
			return
		}
		serveFile(w, r, path)
	}
}

func handleBootstrap(state *AppState, opts options) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		resp := map[string]interface{}{
			"focus":   opts.focus,
			"hasMain": state.GetMainPath() != "",
			"hasSub":  state.GetSubPath() != "",
			"watch":   opts.watch,
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

func handleSubUpload(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		file, _, err := r.FormFile("file")
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

		state.SetSubPath(tmpFile.Name(), true)
		w.WriteHeader(http.StatusOK)
	}
}

func handleSubDelete(state *AppState) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		state.SetSubPath("", false)
		w.WriteHeader(http.StatusOK)
	}
}

func handleMainUpload(state *AppState, broadcaster *Broadcaster) http.HandlerFunc {
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

		state.SetMainPath(tmpFile.Name(), true)

		// Notify clients that MAIN has changed
		if broadcaster != nil {
			broadcaster.Broadcast("main-changed", "")
		}

		w.WriteHeader(http.StatusOK)
	}
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
