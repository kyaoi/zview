package main

import (
	"os"
	"sync"
)

// AppState holds the runtime configuration of PDFs
type AppState struct {
	mu            sync.RWMutex
	mainPath      string
	subPath       string
	tempMainFiles []string // track temp files for MAIN to clean up
	tempSubFiles  []string // track temp files for SUB to clean up
}

func (s *AppState) GetMainPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mainPath
}

func (s *AppState) GetSubPath() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.subPath
}

func (s *AppState) SetMainPath(path string, isTemp bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.mainPath = path
	if isTemp && path != "" {
		s.tempMainFiles = append(s.tempMainFiles, path)
	}
}

func (s *AppState) SetSubPath(path string, isTemp bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subPath = path
	if isTemp && path != "" {
		s.tempSubFiles = append(s.tempSubFiles, path)
	}
}

func (s *AppState) Cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, path := range s.tempMainFiles {
		_ = os.Remove(path)
	}
	for _, path := range s.tempSubFiles {
		_ = os.Remove(path)
	}
	s.tempMainFiles = nil
	s.tempSubFiles = nil
}
