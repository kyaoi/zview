package main

import (
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
)

const defaultPort = 8571
const maxUploadSize = 300 * 1024 * 1024 // 300MB

var (
	version = "dev"
	commit  = "none"
	date    = "unknown"
)

func main() {
	opts, err := parseArgs(os.Args[1:])
	if err != nil {
		if errors.Is(err, errShowHelp) {
			os.Exit(0)
		}
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Validate MAIN path if provided
	if opts.mainPath != "" {
		info, err := os.Stat(opts.mainPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: MAIN file %q does not exist\n", opts.mainPath)
			os.Exit(1)
		}
		if info.IsDir() {
			fmt.Fprintf(os.Stderr, "Error: MAIN path %q is a directory, expected file\n", opts.mainPath)
			os.Exit(1)
		}
	}

	// Validate SUB path if provided
	if opts.subPath != "" {
		info, err := os.Stat(opts.subPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: SUB file %q does not exist\n", opts.subPath)
			os.Exit(1)
		}
		if info.IsDir() {
			fmt.Fprintf(os.Stderr, "Error: SUB path %q is a directory, expected file\n", opts.subPath)
			os.Exit(1)
		}
	}

	// Initialize state
	state := &AppState{
		mainPath: opts.mainPath,
		subPath:  opts.subPath,
	}
	defer state.Cleanup()

	// Load embedded frontend
	dist, err := loadEmbeddedDist()
	if err != nil {
		log.Fatalf("failed to load embedded dist: %v", err)
	}

	// Set up broadcaster for SSE
	broadcaster := NewBroadcaster()

	// Start file watcher if enabled
	var stopWatcher func()
	if opts.watch && opts.mainPath != "" {
		stopWatcher = startWatcher(opts.mainPath, broadcaster)
		defer stopWatcher()
	}

	// Set up HTTP routes
	mux := http.NewServeMux()
	mux.Handle("/", spaHandler(dist))
	mux.HandleFunc("/api/main.pdf", handleMainPDF(state))
	mux.HandleFunc("/api/sub.pdf", handleSubPDF(state))
	mux.HandleFunc("/api/bootstrap", handleBootstrap(state, opts))
	mux.HandleFunc("/api/sub/upload", handleSubUpload(state))
	mux.HandleFunc("/api/sub", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handleSubDelete(state)(w, r)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/events", broadcaster.HandleSSE)

	// Start server
	addr := fmt.Sprintf("127.0.0.1:%d", opts.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("failed to listen on %s: %v", addr, err)
	}
	actualAddr := listener.Addr().String()
	url := fmt.Sprintf("http://%s", actualAddr)
	log.Printf("Serving at %s", url)

	// Open browser if requested
	if opts.openBrowser {
		openBrowser(url)
	}

	if err := http.Serve(listener, mux); err != nil {
		log.Fatal(err)
	}
}

func openBrowser(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "darwin":
		cmd = "open"
		args = []string{url}
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	default:
		cmd = "xdg-open"
		args = []string{url}
	}

	go func() {
		if err := exec.Command(cmd, args...).Run(); err != nil {
			log.Printf("failed to open browser: %v", err)
		}
	}()
}
