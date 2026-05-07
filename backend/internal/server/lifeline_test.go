package server

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestLifelineDisabledWhenOnIdleNil(t *testing.T) {
	l := NewLifeline(10*time.Millisecond, nil)
	l.Connect()
	l.Disconnect()
	time.Sleep(30 * time.Millisecond)
	// Nothing to assert beyond "no panic"; callback is nil so disabled.
}

func TestLifelineDisabledWhenGraceNonPositive(t *testing.T) {
	var fired int32
	l := NewLifeline(0, func() { atomic.AddInt32(&fired, 1) })
	l.Connect()
	l.Disconnect()
	time.Sleep(30 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 0 {
		t.Fatalf("idle callback fired with non-positive grace period")
	}
}

func TestLifelineNoFireBeforeFirstConnect(t *testing.T) {
	var fired int32
	l := NewLifeline(20*time.Millisecond, func() { atomic.AddInt32(&fired, 1) })
	// Defensive Disconnect with no prior Connect should not arm the timer.
	l.Disconnect()
	time.Sleep(60 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 0 {
		t.Fatalf("idle callback fired before any client connected")
	}
}

func TestLifelineFiresAfterGracePeriod(t *testing.T) {
	fired := make(chan struct{}, 1)
	l := NewLifeline(20*time.Millisecond, func() { fired <- struct{}{} })
	l.Connect()
	l.Disconnect()
	select {
	case <-fired:
	case <-time.After(200 * time.Millisecond):
		t.Fatalf("idle callback did not fire within grace period")
	}
}

func TestLifelineCancelsOnReconnect(t *testing.T) {
	var fired int32
	l := NewLifeline(40*time.Millisecond, func() { atomic.AddInt32(&fired, 1) })
	l.Connect()
	l.Disconnect()
	// Reconnect quickly — simulates Ctrl+R reload.
	time.Sleep(10 * time.Millisecond)
	l.Connect()
	time.Sleep(80 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 0 {
		t.Fatalf("idle callback fired even though a client reconnected within the grace window")
	}
	l.Disconnect()
	time.Sleep(80 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 1 {
		t.Fatalf("expected exactly one fire after final disconnect, got %d", atomic.LoadInt32(&fired))
	}
}

func TestLifelineMultipleClients(t *testing.T) {
	var fired int32
	l := NewLifeline(20*time.Millisecond, func() { atomic.AddInt32(&fired, 1) })
	l.Connect()
	l.Connect()
	l.Disconnect() // 1 active still
	time.Sleep(60 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 0 {
		t.Fatalf("idle callback fired while a client was still connected")
	}
	l.Disconnect() // now 0
	time.Sleep(80 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 1 {
		t.Fatalf("expected callback after last client left, got %d", atomic.LoadInt32(&fired))
	}
}
