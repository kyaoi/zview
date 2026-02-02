package main

import (
	"log"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

const watchDebounce = 300 * time.Millisecond

func startWatcher(path string, broadcaster *Broadcaster) func() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("failed to create watcher: %v", err)
		return func() {}
	}

	done := make(chan bool)

	go watchLoop(watcher, path, broadcaster, done)

	// Watch the directory containing the file so we detect replace/rename.
	dir := filepath.Dir(path)
	if err := watcher.Add(dir); err != nil {
		log.Printf("failed to add directory to watcher: %v", err)
	}

	return func() {
		done <- true
		watcher.Close()
	}
}

func watchLoop(watcher *fsnotify.Watcher, targetPath string, broadcaster *Broadcaster, done chan bool) {
	var debounceTimer *time.Timer

	baseName := filepath.Base(targetPath)
	absTarget, _ := filepath.Abs(targetPath)

	for {
		select {
		case event, ok := <-watcher.Events:
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
			debounceTimer = time.AfterFunc(watchDebounce, func() {
				broadcaster.Broadcast("main-change", "")
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)

		case <-done:
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
