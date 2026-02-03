package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kyaoi/zview/backend/internal/state"
)

func TestHandleBootstrap(t *testing.T) {
	// Setup
	s := state.New("")
	s.SetMainPath("/tmp/test.pdf", true)
	handler := HandleBootstrap(s, "main", true)

	// Execute
	req := httptest.NewRequest("GET", "/api/bootstrap", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	// Verify
	resp := w.Result()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var data BootstrapData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if !data.HasMain {
		t.Error("expected HasMain to be true")
	}
	if data.Focus != "main" {
		t.Errorf("expected focus 'main', got '%s'", data.Focus)
	}
	if !data.Watch {
		t.Error("expected Watch to be true")
	}
}

func TestHandleMainPDF(t *testing.T) {
	// Setup dummy file
	tmpFile, err := os.CreateTemp("", "zview-test-*.pdf")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.WriteString("dummy pdf content")
	tmpFile.Close()

	s := state.New("")
	handler := HandleMainPDF(s)

	t.Run("returns 404 when main not loaded", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/main.pdf", nil)
		w := httptest.NewRecorder()
		handler(w, req)

		if w.Result().StatusCode != http.StatusNotFound {
			t.Errorf("expected 404, got %d", w.Result().StatusCode)
		}
	})

	t.Run("returns file when loaded", func(t *testing.T) {
		s.SetMainPath(tmpFile.Name(), true)
		req := httptest.NewRequest("GET", "/api/main.pdf", nil)
		w := httptest.NewRecorder()
		handler(w, req)

		if w.Result().StatusCode != http.StatusOK {
			t.Errorf("expected 200, got %d", w.Result().StatusCode)
		}

		contentType := w.Result().Header.Get("Content-Type")
		if contentType != "application/pdf" {
			t.Errorf("expected application/pdf, got %s", contentType)
		}
	})
}
