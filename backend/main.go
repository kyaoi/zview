package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

const defaultPort = 8571
const maxUploadSize = 300 * 1024 * 1024 // 300MB

var (
	version     = "dev"
	commit      = "none"
	date        = "unknown"
	errShowHelp = errors.New("show help")
)

type options struct {
	mainPath    string
	subPath     string
	focus       string
	watch       bool
	port        int
	openBrowser bool
}

// AppState holds the runtime configuration of PDFs
type AppState struct {
	mu           sync.RWMutex
	mainPath     string
	subPath      string
	tempSubFiles []string // track temp files to clean up
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
	for _, path := range s.tempSubFiles {
		_ = os.Remove(path)
	}
	s.tempSubFiles = nil
}

func main() {
	opts, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	if err := run(opts); err != nil {
		log.Fatal(err)
	}
}

func parseArgs(args []string) (options, error) {
	fs := flag.NewFlagSet("zview", flag.ContinueOnError)
	fs.SetOutput(os.Stdout)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: zview [options] [MAIN.pdf] [SUB.pdf]\n\nOptions:\n")
		fs.PrintDefaults()
		fmt.Fprintln(fs.Output(), "\nExamples:")
		fmt.Fprintln(fs.Output(), "  zview main.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf sub.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf --sub sub.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf sub.pdf --focus sub")
		fmt.Fprintln(fs.Output(), "  zview main.pdf --no-watch")
	}

	opts := options{
		focus:       "main",
		watch:       true,
		port:        defaultPort,
		openBrowser: true,
	}

	fs.StringVar(&opts.subPath, "sub", "", "path to SUB PDF")
	fs.StringVar(&opts.focus, "focus", opts.focus, "initial focus: main|sub")
	helpFlag := fs.Bool("help", false, "show this help and exit")

	watchFlag := fs.Bool("watch", true, "enable file watching for MAIN (default)")
	noWatchFlag := fs.Bool("no-watch", false, "disable file watching for MAIN")

	fs.IntVar(&opts.port, "port", opts.port, "port to bind (0 = random)")

	noOpenFlag := fs.Bool("no-open", false, "do not auto-open browser tab")
	versionFlag := fs.Bool("version", false, "print version and exit")

	reordered := reorderArgs(args)
	if err := fs.Parse(reordered); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			fs.Usage()
			return options{}, errShowHelp
		}
		return options{}, err
	}
	if *helpFlag {
		fs.Usage()
		return options{}, errShowHelp
	}
	if *versionFlag {
		fmt.Printf("zview %s (%s) built at %s\n", version, commit, date)
		os.Exit(0)
	}

	remaining := fs.Args()
	if len(remaining) > 2 {
		return options{}, fmt.Errorf("expected at most MAIN and SUB paths, got %d", len(remaining))
	}
	if len(remaining) >= 1 {
		opts.mainPath = remaining[0]
	}
	if len(remaining) == 2 && opts.subPath == "" {
		opts.subPath = remaining[1]
	}

	opts.watch = *watchFlag
	if *noWatchFlag {
		opts.watch = false
	}
	opts.openBrowser = !*noOpenFlag

	opts.focus = strings.ToLower(opts.focus)
	if opts.focus != "main" && opts.focus != "sub" {
		return options{}, fmt.Errorf("invalid --focus value %q (use main or sub)", opts.focus)
	}

	return opts, nil
}

// reorderArgs permits flags to appear after positional paths by moving flag/value pairs
// before positional arguments so the stdlib flag parser can consume them.
func reorderArgs(args []string) []string {
	var flags []string
	var positionals []string

	needsValue := func(name string) bool {
		switch name {
		case "sub", "focus", "port":
			return true
		default:
			return false
		}
	}

	for i := 0; i < len(args); {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
			name := strings.TrimLeft(arg, "-")
			hasValueInline := strings.Contains(arg, "=")
			if !hasValueInline && needsValue(name) && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				flags = append(flags, args[i+1])
				i += 2
				continue
			}
			i++
			continue
		}
		positionals = append(positionals, arg)
		i++
	}

	return append(flags, positionals...)
}

func run(opts options) error {
	staticFS, err := loadEmbeddedDist()
	if err != nil {
		return err
	}

	state := &AppState{
		mainPath: opts.mainPath,
		subPath:  opts.subPath,
	}
	defer state.Cleanup()

	watchEnabled := opts.watch && opts.mainPath != ""

	var broadcaster *eventBroadcaster
	var stopWatch func()
	if watchEnabled {
		broadcaster = newEventBroadcaster()
		stopWatch, err = startMainWatcher(opts.mainPath, broadcaster)
		if err != nil {
			return fmt.Errorf("failed to start watcher: %w", err)
		}
		defer stopWatch()
	}

	bootstrap := bootstrapInfo{
		Focus:   opts.focus,
		HasMain: opts.mainPath != "",
		HasSub:  opts.subPath != "",
		Watch:   watchEnabled,
	}
	if !bootstrap.HasSub && bootstrap.Focus == "sub" {
		bootstrap.Focus = "main"
	}

	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", opts.port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", opts.port, err)
	}

	addr := listener.Addr().String()
	url := "http://" + addr

	mux := http.NewServeMux()
	mux.Handle("/", spaHandler(staticFS))
	mux.Handle("/api/bootstrap", bootstrapHandler(state, bootstrap))
	mux.Handle("/api/main.pdf", pdfHandler(state, "MAIN"))
	mux.Handle("/api/sub.pdf", pdfHandler(state, "SUB"))
	mux.Handle("/api/sub/upload", uploadHandler(state))
	mux.Handle("/api/sub", deleteHandler(state))
	if watchEnabled && broadcaster != nil {
		mux.Handle("/events", broadcaster)
	}

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf(
		"zview backend starting at %s (focus=%s watch=%t sub=%t)",
		url,
		bootstrap.Focus,
		bootstrap.Watch,
		bootstrap.HasSub,
	)

	if opts.openBrowser {
		go func() {
			if err := openBrowser(url); err != nil {
				log.Printf("warn: failed to open browser automatically: %v", err)
			}
		}()
	}

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}

func openBrowser(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		return fmt.Errorf("auto-open is not supported on %s", runtime.GOOS)
	}

	return cmd.Start()
}

// Embedded frontend (built via `pnpm build` → backend/dist).
//
//go:embed dist/* dist/**/*
var embeddedDist embed.FS

func loadEmbeddedDist() (fs.FS, error) {
	dist, err := fs.Sub(embeddedDist, "dist")
	if err != nil {
		return nil, fmt.Errorf("frontend assets not embedded: %w", err)
	}
	return dist, nil
}

func spaHandler(staticFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// Serve index.html directly to avoid FileServer's redirect quirks on root.
		if path == "index.html" {
			data, err := fs.ReadFile(staticFS, "index.html")
			if err != nil {
				http.Error(w, "index.html missing in embedded assets", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(data)
			return
		}

		if exists(staticFS, path) {
			r.URL.Path = "/" + path
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for unknown routes.
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}

func exists(fsys fs.FS, name string) bool {
	_, err := fs.Stat(fsys, name)
	return err == nil
}

type bootstrapInfo struct {
	Focus   string `json:"focus"`
	HasMain bool   `json:"hasMain"`
	HasSub  bool   `json:"hasSub"`
	Watch   bool   `json:"watch"`
}

func bootstrapHandler(state *AppState, initial bootstrapInfo) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info := initial
		info.HasSub = state.GetSubPath() != ""

		payload, err := json.Marshal(info)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(payload)
	})
}

func pdfHandler(state *AppState, role string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		var path string
		if role == "MAIN" {
			path = state.GetMainPath()
		} else {
			path = state.GetSubPath()
		}

		if path == "" {
			http.Error(w, fmt.Sprintf("Missing PDF: %s not provided", role), http.StatusNotFound)
			return
		}

		file, err := os.Open(path)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				http.Error(w, fmt.Sprintf("%s PDF not found", role), http.StatusNotFound)
				return
			}

			log.Printf("failed to open %s PDF: %v", role, err)
			http.Error(w, fmt.Sprintf("failed to read %s PDF", role), http.StatusInternalServerError)
			return
		}
		defer file.Close()

		info, err := file.Stat()
		if err != nil {
			log.Printf("failed to stat %s PDF: %v", role, err)
			http.Error(w, fmt.Sprintf("failed to read %s PDF", role), http.StatusInternalServerError)
			return
		}
		if info.IsDir() {
			http.Error(w, fmt.Sprintf("%s PDF path is a directory", role), http.StatusNotFound)
			return
		}

		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
	})
}

func uploadHandler(state *AppState) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
		if err := r.ParseMultipartForm(maxUploadSize); err != nil {
			http.Error(w, "file too large", http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "invalid file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		if filepath.Ext(header.Filename) != ".pdf" {
			http.Error(w, "only PDF files allowed", http.StatusBadRequest)
			return
		}

		// Create temp file
		tempFile, err := os.CreateTemp("", "zview-sub-*.pdf")
		if err != nil {
			log.Printf("failed to create temp file: %v", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		// Don't defer Remove here; handled by AppState.Cleanup

		_, err = io.Copy(tempFile, file)
		tempFile.Close()
		if err != nil {
			log.Printf("failed to save temp file: %v", err)
			_ = os.Remove(tempFile.Name())
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}

		state.SetSubPath(tempFile.Name(), true)
		log.Printf("Uploaded SUB PDF to %s", tempFile.Name())

		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})
}

func deleteHandler(state *AppState) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "DELETE" {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		state.SetSubPath("", false)
		log.Printf("Closed SUB PDF")

		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})
}

// SSE broadcaster for file change events.
// Sends `event: main-change` with a data payload (timestamp string) whenever MAIN changes.
type eventBroadcaster struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
}

func newEventBroadcaster() *eventBroadcaster {
	return &eventBroadcaster{
		clients: make(map[chan string]struct{}),
	}
}

func (b *eventBroadcaster) add(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.clients[ch] = struct{}{}
}

func (b *eventBroadcaster) remove(ch chan string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.clients, ch)
	close(ch)
}

func (b *eventBroadcaster) broadcast(payload string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- payload:
		default:
			// Drop if client is slow; keep overall responsiveness.
		}
	}
}

func (b *eventBroadcaster) notifyChange() {
	b.broadcast(fmt.Sprintf("%d", time.Now().UnixNano()))
}

func (b *eventBroadcaster) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan string, 8)
	b.add(ch)
	defer b.remove(ch)

	// Send initial comment to keep connection open.
	_, _ = fmt.Fprint(w, ": ok\n\n")
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case payload := <-ch:
			_, _ = fmt.Fprintf(w, "event: main-change\ndata: %s\n\n", payload)
			flusher.Flush()
		case <-ctx.Done():
			return
		}
	}
}

// startMainWatcher watches the MAIN PDF path and debounces change notifications.
// Returns a stop function that must be called to clean up.
func startMainWatcher(path string, broadcaster *eventBroadcaster) (func(), error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve MAIN path: %w", err)
	}
	dir := filepath.Dir(absPath)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("create watcher: %w", err)
	}
	if err := watcher.Add(dir); err != nil {
		_ = watcher.Close()
		return nil, fmt.Errorf("watch MAIN directory: %w", err)
	}

	stopCh := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)

	go func() {
		defer wg.Done()
		var debounce *time.Timer
		trigger := func() {
			if debounce == nil {
				debounce = time.NewTimer(300 * time.Millisecond)
			} else {
				if !debounce.Stop() {
					select {
					case <-debounce.C:
					default:
					}
				}
				debounce.Reset(300 * time.Millisecond)
			}
		}

		for {
			var timerC <-chan time.Time
			if debounce != nil {
				timerC = debounce.C
			}
			select {
			case ev, ok := <-watcher.Events:
				if !ok {
					return
				}
				if ev.Name == "" {
					continue
				}
				if filepath.Clean(ev.Name) != absPath {
					continue
				}
				switch {
				case ev.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename|fsnotify.Remove|fsnotify.Chmod) != 0:
					trigger()
				}
			case _, ok := <-watcher.Errors:
				if !ok {
					return
				}
				// swallow errors; keep watching best-effort
			case <-stopCh:
				if debounce != nil {
					debounce.Stop()
				}
				return
			case <-timerC:
				broadcaster.notifyChange()
			}
		}
	}()

	return func() {
		close(stopCh)
		_ = watcher.Close()
		wg.Wait()
	}, nil
}
