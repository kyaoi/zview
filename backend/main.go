package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
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

	// Handle subcommands
	switch opts.command {
	case CommandPs:
		if err := runPsCommand(); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		return
	case CommandKill:
		if err := runKillCommand(opts.killArgs); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		return
	}

	// CommandView: run the viewer server

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
	state := NewAppState(opts.mainPath)
	if opts.subPath != "" {
		// Use filename as tab name
		name := filepath.Base(opts.subPath)
		state.AddSubTab(name, opts.subPath, false)
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
	mux.HandleFunc("/api/main/upload", handleMainUpload(state, broadcaster))
	mux.HandleFunc("/api/sub", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			handleSubDelete(state)(w, r)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/events", broadcaster.HandleSSE)

	// Start server with dynamic port selection
	var listener net.Listener

	if opts.portSpecified {
		// User requested specific port (or 0 for random). Fail if unavailable.
		addr := fmt.Sprintf("127.0.0.1:%d", opts.port)
		listener, err = net.Listen("tcp", addr)
		if err != nil {
			log.Fatalf("failed to listen on %s: %v", addr, err)
		}
	} else {
		// Default behavior: try default port, fallback to random
		addr := fmt.Sprintf("127.0.0.1:%d", opts.port)
		listener, err = net.Listen("tcp", addr)
		if err != nil {
			// If default port failed, try random
			log.Printf("Port %d is busy, trying a random port...", opts.port)
			listener, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				log.Fatalf("failed to listen on random port: %v", err)
			}
		}
	}

	// Get actual port (important for dynamic port selection with port=0)
	tcpAddr := listener.Addr().(*net.TCPAddr)
	actualPort := tcpAddr.Port
	url := fmt.Sprintf("http://127.0.0.1:%d", actualPort)
	log.Printf("Serving at %s", url)

	// Register session
	// For session registration, we just pass the active/first sub path or empty
	initialSubPath := state.GetSubPath()
	if err := registerSession(actualPort, opts.mainPath, initialSubPath); err != nil {
		log.Printf("Warning: failed to register session: %v", err)
	}

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	server := &http.Server{Handler: mux}

	go func() {
		<-sigChan
		log.Println("Shutting down...")

		// Unregister session
		if err := unregisterSession(); err != nil {
			log.Printf("Warning: failed to unregister session: %v", err)
		}

		// Gracefully shutdown the server
		if err := server.Shutdown(context.Background()); err != nil {
			log.Printf("Error during shutdown: %v", err)
		}
	}()

	// Open browser if requested
	if opts.openBrowser {
		openBrowser(url)
	}

	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
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
