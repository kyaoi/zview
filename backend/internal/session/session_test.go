package session

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRegisterListFindAndUnregister(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	if err := Register(8571, "/tmp/main.pdf", "/tmp/sub.pdf"); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	list, err := List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("List length = %d, want 1", len(list))
	}
	if list[0].Port != 8571 {
		t.Fatalf("Port = %d, want 8571", list[0].Port)
	}
	if list[0].MainPath != "/tmp/main.pdf" {
		t.Fatalf("MainPath = %q", list[0].MainPath)
	}
	if list[0].SubPath != "/tmp/sub.pdf" {
		t.Fatalf("SubPath = %q", list[0].SubPath)
	}
	if list[0].PID != os.Getpid() {
		t.Fatalf("PID = %d, want %d", list[0].PID, os.Getpid())
	}
	if list[0].StartTime.IsZero() {
		t.Fatalf("StartTime should be set")
	}

	found, err := FindByPort(8571)
	if err != nil {
		t.Fatalf("FindByPort failed: %v", err)
	}
	if found == nil || found.Port != 8571 {
		t.Fatalf("FindByPort returned %+v", found)
	}

	if err := UnregisterByPID(os.Getpid()); err != nil {
		t.Fatalf("UnregisterByPID failed: %v", err)
	}

	list, err = List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List length after unregister = %d, want 0", len(list))
	}
}

func TestListCleansStaleSessions(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	path := filepath.Join(tmp, ".config", "zview", "sessions.json")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}

	sf := SessionFile{
		Sessions: []Session{
			{
				PID:       999999,
				Port:      9999,
				MainPath:  "/tmp/stale.pdf",
				StartTime: time.Now(),
			},
		},
	}
	data, err := json.Marshal(sf)
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	list, err := List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List length = %d, want 0", len(list))
	}
}

func TestListHandlesCorruptedFile(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	path := filepath.Join(tmp, ".config", "zview", "sessions.json")
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if err := os.WriteFile(path, []byte("{not-json"), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	list, err := List()
	if err != nil {
		t.Fatalf("List failed: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("List length = %d, want 0", len(list))
	}
}
