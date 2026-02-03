// Package state provides application state management for zview.
package state

import (
	"os"
	"sync"

	"github.com/google/uuid"
)

// SubTab represents a loaded SUB PDF tab.
type SubTab struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Path   string `json:"-"` // internal path, not exposed to frontend
	IsTemp bool   `json:"-"` // whether this is a temporary file
}

// AppState holds the runtime state of the application.
type AppState struct {
	mu            sync.RWMutex
	mainPath      string
	subTabs       map[string]*SubTab // id -> SubTab
	activeSubId   string
	tempMainFiles []string // track temp files for MAIN to clean up
}

// New creates a new AppState with the given main PDF path.
func New(mainPath string) *AppState {
	return &AppState{
		mainPath: mainPath,
		subTabs:  make(map[string]*SubTab),
	}
}

// GetMainPath returns the current main PDF path.
func (s *AppState) GetMainPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mainPath
}

// SetMainPath sets the main PDF path.
func (s *AppState) SetMainPath(path string, isTemp bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mainPath = path
	if isTemp && path != "" {
		s.tempMainFiles = append(s.tempMainFiles, path)
	}
}

// GetSubTabs returns a copy of all sub tabs.
func (s *AppState) GetSubTabs() []SubTab {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tabs := make([]SubTab, 0, len(s.subTabs))
	for _, tab := range s.subTabs {
		tabs = append(tabs, *tab)
	}
	return tabs
}

// GetSubTab returns a single sub tab by ID.
func (s *AppState) GetSubTab(id string) *SubTab {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if tab, ok := s.subTabs[id]; ok {
		return tab
	}
	return nil
}

// AddSubTab adds a new SUB tab and returns its ID.
func (s *AppState) AddSubTab(name, path string, isTemp bool) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := uuid.New().String()
	s.subTabs[id] = &SubTab{
		ID:     id,
		Name:   name,
		Path:   path,
		IsTemp: isTemp,
	}
	s.activeSubId = id
	return id
}

// RemoveSubTab removes a SUB tab by ID and cleans up temp files.
func (s *AppState) RemoveSubTab(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	tab, ok := s.subTabs[id]
	if !ok {
		return false
	}
	if tab.IsTemp && tab.Path != "" {
		_ = os.Remove(tab.Path)
	}
	delete(s.subTabs, id)
	// If we removed the active tab, select another one
	if s.activeSubId == id {
		s.activeSubId = ""
		for newId := range s.subTabs {
			s.activeSubId = newId
			break
		}
	}
	return true
}

// HasSub returns true if there are any sub tabs.
func (s *AppState) HasSub() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.subTabs) > 0
}

// GetActiveSubId returns the active sub tab ID.
func (s *AppState) GetActiveSubId() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.activeSubId
}

// SetActiveSubId sets the active sub tab ID.
func (s *AppState) SetActiveSubId(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.subTabs[id]; ok {
		s.activeSubId = id
	}
}

// Cleanup removes all temporary files and resets state.
func (s *AppState) Cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, path := range s.tempMainFiles {
		_ = os.Remove(path)
	}
	for _, tab := range s.subTabs {
		if tab.IsTemp && tab.Path != "" {
			_ = os.Remove(tab.Path)
		}
	}
	s.tempMainFiles = nil
	s.subTabs = make(map[string]*SubTab)
}

// GetSubPath returns the path of the active sub tab (legacy compatibility).
func (s *AppState) GetSubPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.activeSubId == "" {
		return ""
	}
	if tab, ok := s.subTabs[s.activeSubId]; ok {
		return tab.Path
	}
	return ""
}
