package state

import (
	"testing"
)

func TestNewAppState(t *testing.T) {
	s := New("/path/to/main.pdf")
	if s.GetMainPath() != "/path/to/main.pdf" {
		t.Errorf("GetMainPath() = %q, want %q", s.GetMainPath(), "/path/to/main.pdf")
	}
	if s.HasSub() {
		t.Error("HasSub() should be false initially")
	}
}

func TestSetMainPath(t *testing.T) {
	s := New("")
	s.SetMainPath("/new/path.pdf", false)
	if s.GetMainPath() != "/new/path.pdf" {
		t.Errorf("GetMainPath() = %q, want %q", s.GetMainPath(), "/new/path.pdf")
	}
}

func TestAddSubTab(t *testing.T) {
	s := New("")

	id := s.AddSubTab("test.pdf", "/tmp/test.pdf", false)
	if id == "" {
		t.Error("AddSubTab should return a non-empty ID")
	}

	if !s.HasSub() {
		t.Error("HasSub() should be true after adding a tab")
	}

	tabs := s.GetSubTabs()
	if len(tabs) != 1 {
		t.Errorf("GetSubTabs() length = %d, want 1", len(tabs))
	}
	if tabs[0].Name != "test.pdf" {
		t.Errorf("SubTab Name = %q, want %q", tabs[0].Name, "test.pdf")
	}

	if s.GetActiveSubId() != id {
		t.Errorf("GetActiveSubId() = %q, want %q", s.GetActiveSubId(), id)
	}
}

func TestRemoveSubTab(t *testing.T) {
	s := New("")

	id1 := s.AddSubTab("first.pdf", "/tmp/first.pdf", false)
	id2 := s.AddSubTab("second.pdf", "/tmp/second.pdf", false)

	// Active should be the last added
	if s.GetActiveSubId() != id2 {
		t.Errorf("GetActiveSubId() = %q, want %q", s.GetActiveSubId(), id2)
	}

	// Remove the active tab
	removed := s.RemoveSubTab(id2)
	if !removed {
		t.Error("RemoveSubTab should return true")
	}

	tabs := s.GetSubTabs()
	if len(tabs) != 1 {
		t.Errorf("GetSubTabs() length = %d, want 1", len(tabs))
	}

	// Active should switch to remaining tab
	if s.GetActiveSubId() != id1 {
		t.Errorf("GetActiveSubId() = %q, want %q", s.GetActiveSubId(), id1)
	}

	// Remove non-existent tab
	removed = s.RemoveSubTab("non-existent")
	if removed {
		t.Error("RemoveSubTab should return false for non-existent ID")
	}
}

func TestGetSubPath(t *testing.T) {
	s := New("")

	// No sub tabs
	if s.GetSubPath() != "" {
		t.Errorf("GetSubPath() = %q, want empty", s.GetSubPath())
	}

	s.AddSubTab("test.pdf", "/tmp/test.pdf", false)
	if s.GetSubPath() != "/tmp/test.pdf" {
		t.Errorf("GetSubPath() = %q, want %q", s.GetSubPath(), "/tmp/test.pdf")
	}
}

func TestCleanup(t *testing.T) {
	s := New("")

	s.AddSubTab("test.pdf", "/tmp/nonexistent.pdf", false)
	s.Cleanup()

	if s.HasSub() {
		t.Error("HasSub() should be false after Cleanup")
	}
}
