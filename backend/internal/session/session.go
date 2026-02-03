// Package session provides session management for zview instances.
package session

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

// Session represents a running zview instance.
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

// getFilePath returns the path to the sessions file.
func getFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(homeDir, ".config", "zview", "sessions.json"), nil
}

// ensureDir creates the config directory if it doesn't exist.
func ensureDir() error {
	path, err := getFilePath()
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	return os.MkdirAll(dir, 0755)
}

// load reads the sessions file.
func load() (SessionFile, error) {
	path, err := getFilePath()
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

// save writes the sessions file.
func save(sf SessionFile) error {
	if err := ensureDir(); err != nil {
		return err
	}

	path, err := getFilePath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(sf, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// IsProcessRunning checks if a process with the given PID is running.
func IsProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds, so we send signal 0 to check
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// Register adds the current process to the sessions file.
func Register(port int, mainPath, subPath string) error {
	sf, err := load()
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
	return save(sf)
}

// Unregister removes the current process from the sessions file.
func Unregister() error {
	return UnregisterByPID(os.Getpid())
}

// UnregisterByPID removes a specific PID from the sessions file.
func UnregisterByPID(pid int) error {
	sf, err := load()
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
	return save(sf)
}

// List returns all valid (running) sessions, cleaning up stale ones.
func List() ([]Session, error) {
	sf, err := load()
	if err != nil {
		return nil, err
	}

	var valid []Session
	var changed bool

	for _, s := range sf.Sessions {
		if IsProcessRunning(s.PID) {
			valid = append(valid, s)
		} else {
			changed = true
		}
	}

	// Clean up stale sessions
	if changed {
		sf.Sessions = valid
		_ = save(sf)
	}

	return valid, nil
}

// FindByPort returns the session running on the given port.
func FindByPort(port int) (*Session, error) {
	sessions, err := List()
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
