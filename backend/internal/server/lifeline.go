package server

import (
	"sync"
	"time"
)

// Lifeline tracks long-lived browser connections (SSE clients) so the server
// can shut itself down once the user has closed all tabs pointing at it.
//
// Connect/Disconnect are called whenever a client joins or leaves. The
// onIdle callback fires once gracePeriod has elapsed with zero active
// clients — but only after at least one client has connected at least once,
// so a freshly started server doesn't quit before the browser opens.
type Lifeline struct {
	gracePeriod time.Duration
	onIdle      func()
	disabled    bool

	mu            sync.Mutex
	active        int
	everConnected bool
	timer         *time.Timer
}

// NewLifeline returns a Lifeline. If onIdle is nil or gracePeriod is
// non-positive, Connect/Disconnect become no-ops and onIdle is never
// invoked.
func NewLifeline(gracePeriod time.Duration, onIdle func()) *Lifeline {
	return &Lifeline{
		gracePeriod: gracePeriod,
		onIdle:      onIdle,
		disabled:    onIdle == nil || gracePeriod <= 0,
	}
}

// Connect registers a new client and cancels any pending shutdown.
func (l *Lifeline) Connect() {
	if l.disabled {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.active++
	l.everConnected = true
	if l.timer != nil {
		l.timer.Stop()
		l.timer = nil
	}
}

// Disconnect drops a client's slot. If that brings the count to zero (and a
// client has connected at some point already), the grace timer is armed.
func (l *Lifeline) Disconnect() {
	if l.disabled {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.active > 0 {
		l.active--
	}
	if l.active != 0 || !l.everConnected {
		return
	}
	if l.timer != nil {
		l.timer.Stop()
	}
	l.timer = time.AfterFunc(l.gracePeriod, l.fireIfStillIdle)
}

func (l *Lifeline) fireIfStillIdle() {
	l.mu.Lock()
	idle := l.active == 0 && l.everConnected
	l.mu.Unlock()
	if idle && l.onIdle != nil {
		l.onIdle()
	}
}
