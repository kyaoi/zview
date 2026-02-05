package server

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFormatMessage(t *testing.T) {
	msg := FormatMessage("main-change", "")
	if msg != "event: main-change\ndata: \n\n" {
		t.Fatalf("FormatMessage empty data = %q", msg)
	}

	msg = FormatMessage("main-change", "hello")
	if msg != "event: main-change\ndata: hello\n\n" {
		t.Fatalf("FormatMessage data = %q", msg)
	}
}

func TestBroadcasterBroadcast(t *testing.T) {
	b := New()
	ch := make(chan string, 1)
	b.AddClient(ch)
	b.Broadcast("main-change", "data")

	select {
	case msg := <-ch:
		if msg != FormatMessage("main-change", "data") {
			t.Fatalf("unexpected message: %q", msg)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for broadcast")
	}

	b.RemoveClient(ch)
	_, ok := <-ch
	if ok {
		t.Fatalf("expected channel to be closed")
	}
}

func TestHandleSSE(t *testing.T) {
	b := New()
	req := httptest.NewRequest("GET", "/events", nil)
	ctx, cancel := context.WithCancel(req.Context())
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		b.HandleSSE(w, req)
		close(done)
	}()

	for i := 0; i < 50; i++ {
		b.mu.RLock()
		count := len(b.clients)
		b.mu.RUnlock()
		if count > 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	b.Broadcast("main-change", "")
	cancel()

	select {
	case <-done:
		// ok
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for handler to stop")
	}

	body := w.Body.String()
	if body == "" {
		t.Fatalf("expected SSE body to be written")
	}
}
