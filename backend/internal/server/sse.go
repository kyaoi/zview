// Package server provides SSE broadcasting for zview.
package server

import (
	"fmt"
	"net/http"
	"sync"
)

// Broadcaster handles SSE broadcasting to multiple clients.
type Broadcaster struct {
	mu       sync.RWMutex
	clients  map[chan string]struct{}
	lifeline *Lifeline
}

// New creates a new Broadcaster.
func New() *Broadcaster {
	return &Broadcaster{
		clients: make(map[chan string]struct{}),
	}
}

// SetLifeline installs a Lifeline that will be notified about SSE
// connect/disconnect transitions. Must be called before HandleSSE accepts
// traffic; reading the field without a lock is safe under that constraint.
func (b *Broadcaster) SetLifeline(l *Lifeline) {
	b.lifeline = l
}

// AddClient registers a new client channel.
func (b *Broadcaster) AddClient(ch chan string) {
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
}

// RemoveClient unregisters a client channel and closes it.
func (b *Broadcaster) RemoveClient(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if _, ok := b.clients[ch]; ok {
		delete(b.clients, ch)
		close(ch)
	}
}

// Broadcast sends an event to all connected clients.
func (b *Broadcaster) Broadcast(event, data string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	msg := FormatMessage(event, data)
	for ch := range b.clients {
		select {
		case ch <- msg:
		default:
			// Client too slow; skip
		}
	}
}

// HandleSSE returns an HTTP handler for SSE connections.
func (b *Broadcaster) HandleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan string, 10)
	b.AddClient(ch)
	if b.lifeline != nil {
		b.lifeline.Connect()
	}
	defer func() {
		b.RemoveClient(ch)
		if b.lifeline != nil {
			b.lifeline.Disconnect()
		}
	}()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, _ = fmt.Fprint(w, msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// FormatMessage formats an SSE message with event and data.
func FormatMessage(event, data string) string {
	if data == "" {
		return fmt.Sprintf("event: %s\ndata: \n\n", event)
	}
	return fmt.Sprintf("event: %s\ndata: %s\n\n", event, data)
}
