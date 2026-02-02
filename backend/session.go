package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// Session represents a running zview instance
type Session struct {
	PID       int       `json:"pid"`
	Port      int       `json:"port"`
	MainPath  string    `json:"mainPath,omitempty"`
	SubPath   string    `json:"subPath,omitempty"`
	StartTime time.Time `json:"startTime"`
}

// SessionFile is the structure of ~/.config/zview/sessions.json
type SessionFile struct {
	Sessions []Session `json:"sessions"`
}

// getSessionFilePath returns the path to the sessions file
func getSessionFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(homeDir, ".config", "zview", "sessions.json"), nil
}

// ensureSessionDir creates the config directory if it doesn't exist
func ensureSessionDir() error {
	path, err := getSessionFilePath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	return os.MkdirAll(dir, 0755)
}

// loadSessions reads the sessions file
func loadSessions() (SessionFile, error) {
	path, err := getSessionFilePath()
	if err != nil {
		return SessionFile{}, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return SessionFile{Sessions: []Session{}}, nil
		}
		return SessionFile{}, err
	}

	var sf SessionFile
	if err := json.Unmarshal(data, &sf); err != nil {
		// If the file is corrupted, start fresh
		return SessionFile{Sessions: []Session{}}, nil
	}
	return sf, nil
}

// saveSessions writes the sessions file
func saveSessions(sf SessionFile) error {
	if err := ensureSessionDir(); err != nil {
		return err
	}

	path, err := getSessionFilePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(sf, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// isProcessRunning checks if a process with the given PID is running
func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds, so we send signal 0 to check
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// registerSession adds the current process to the sessions file
func registerSession(port int, mainPath, subPath string) error {
	sf, err := loadSessions()
	if err != nil {
		return err
	}

	session := Session{
		PID:       os.Getpid(),
		Port:      port,
		MainPath:  mainPath,
		SubPath:   subPath,
		StartTime: time.Now(),
	}

	sf.Sessions = append(sf.Sessions, session)
	return saveSessions(sf)
}

// unregisterSession removes the current process from the sessions file
func unregisterSession() error {
	return unregisterSessionByPID(os.Getpid())
}

// unregisterSessionByPID removes a specific PID from the sessions file
func unregisterSessionByPID(pid int) error {
	sf, err := loadSessions()
	if err != nil {
		return err
	}

	var remaining []Session
	for _, s := range sf.Sessions {
		if s.PID != pid {
			remaining = append(remaining, s)
		}
	}

	sf.Sessions = remaining
	return saveSessions(sf)
}

// listSessions returns all valid (running) sessions, cleaning up stale ones
func listSessions() ([]Session, error) {
	sf, err := loadSessions()
	if err != nil {
		return nil, err
	}

	var valid []Session
	var changed bool

	for _, s := range sf.Sessions {
		if isProcessRunning(s.PID) {
			valid = append(valid, s)
		} else {
			changed = true
		}
	}

	// Clean up stale sessions
	if changed {
		sf.Sessions = valid
		_ = saveSessions(sf)
	}

	return valid, nil
}

// findSessionByPort returns the session running on the given port
func findSessionByPort(port int) (*Session, error) {
	sessions, err := listSessions()
	if err != nil {
		return nil, err
	}

	for _, s := range sessions {
		if s.Port == port {
			return &s, nil
		}
	}
	return nil, nil
}
