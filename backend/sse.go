package main

import (
	"fmt"
	"net/http"
	"sync"
)

// Broadcaster handles SSE broadcasting to multiple clients.
type Broadcaster struct {
	mu      sync.RWMutex
	clients map[chan string]struct{}
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		clients: make(map[chan string]struct{}),
	}
}

func (b *Broadcaster) AddClient(ch chan string) {
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
}

func (b *Broadcaster) RemoveClient(ch chan string) {
	b.mu.Lock()
	delete(b.clients, ch)
	close(ch)
	b.mu.Unlock()
}

func (b *Broadcaster) Broadcast(event, data string) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	msg := formatSSEMessage(event, data)
	for ch := range b.clients {
		select {
		case ch <- msg:
		default:
			// Client too slow; skip
		}
	}
}

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
	defer b.RemoveClient(ch)

	// Keep-alive
	go func() {
		<-r.Context().Done()
		b.RemoveClient(ch)
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

func formatSSEMessage(event, data string) string {
	if data == "" {
		return fmt.Sprintf("event: %s\ndata: \n\n", event)
	}
	return fmt.Sprintf("event: %s\ndata: %s\n\n", event, data)
}
