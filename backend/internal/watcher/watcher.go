// Package watcher provides file system watching for zview.
package watcher

import (
	"log"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

// DefaultDebounce is the default debounce duration for file change events.
const DefaultDebounce = 300 * time.Millisecond

// OnChange is a callback function called when the target file changes.
type OnChange func()

// Watcher monitors a file for changes and calls the callback when detected.
type Watcher struct {
	fsWatcher *fsnotify.Watcher
	done      chan bool
	path      string
	onChange  OnChange
	debounce  time.Duration
}

// Start creates and starts a new file watcher.
// Returns a stop function to cleanly shut down the watcher.
func Start(path string, onChange OnChange) (stop func()) {
	return StartWithDebounce(path, onChange, DefaultDebounce)
}

// StartWithDebounce creates and starts a new file watcher with custom debounce.
func StartWithDebounce(path string, onChange OnChange, debounce time.Duration) (stop func()) {
	fsWatcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("failed to create watcher: %v", err)
		return func() {}
	}

	w := &Watcher{
		fsWatcher: fsWatcher,
		done:      make(chan bool),
		path:      path,
		onChange:  onChange,
		debounce:  debounce,
	}

	go w.loop()

	// Watch the directory containing the file to detect replace/rename.
	dir := filepath.Dir(path)
	if err := fsWatcher.Add(dir); err != nil {
		log.Printf("failed to add directory to watcher: %v", err)
	}

	return func() {
		w.done <- true
		w.fsWatcher.Close()
	}
}

func (w *Watcher) loop() {
	var debounceTimer *time.Timer

	baseName := filepath.Base(w.path)
	absTarget, _ := filepath.Abs(w.path)

	for {
		select {
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}

			// Check if the event affects our target file.
			if !matchesFile(event.Name, baseName, absTarget) {
				continue
			}

			// Debounce rapid events.
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(w.debounce, w.onChange)

		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)

		case <-w.done:
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return
		}
	}
}

func matchesFile(eventPath string, baseName string, absTarget string) bool {
	if filepath.Base(eventPath) == baseName {
		return true
	}
	absEvent, _ := filepath.Abs(eventPath)
	return absEvent == absTarget
}
