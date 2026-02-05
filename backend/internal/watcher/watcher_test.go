package watcher

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMatchesFile(t *testing.T) {
	base := "test.pdf"
	absTarget := filepath.Join(t.TempDir(), base)

	if !matchesFile("/tmp/other/"+base, base, absTarget) {
		t.Fatalf("expected base name to match")
	}
	if !matchesFile(absTarget, base, absTarget) {
		t.Fatalf("expected absolute path to match")
	}
	if matchesFile("/tmp/other/other.pdf", base, absTarget) {
		t.Fatalf("expected mismatch for different file")
	}
}

func TestStartWithDebounceTriggersOnChange(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "watch.pdf")
	if err := os.WriteFile(path, []byte("initial"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	ch := make(chan struct{}, 1)
	stop := StartWithDebounce(path, func() {
		select {
		case ch <- struct{}{}:
		default:
		}
	}, 10*time.Millisecond)
	defer stop()

	if err := os.WriteFile(path, []byte("changed"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	select {
	case <-ch:
		// ok
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout waiting for watcher callback")
	}
}
