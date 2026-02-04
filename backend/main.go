package main

import (
	"context"
	"embed"
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

	"github.com/kyaoi/zview/backend/internal/cli"
	"github.com/kyaoi/zview/backend/internal/server"
	"github.com/kyaoi/zview/backend/internal/session"
	"github.com/kyaoi/zview/backend/internal/state"
	"github.com/kyaoi/zview/backend/internal/watcher"
)

// Embedded frontend (built via `pnpm build` → backend/dist).
//
//go:embed dist/* dist/**/*
var embeddedDist embed.FS

func main() {
	opts, err := cli.Parse(os.Args[1:])
	if err != nil {
		if errors.Is(err, cli.ErrShowHelp) {
			os.Exit(0)
		}
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}

	// Handle subcommands
	switch opts.Command {
	case cli.CommandPS:
		if err := cli.RunPS(); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		return
	case cli.CommandKill:
		if err := cli.RunKill(opts.KillArgs); err != nil {
			fmt.Fprintln(os.Stderr, "Error:", err)
			os.Exit(1)
		}
		return
	}

	// CommandView: run the viewer server

	// Validate MAIN path if provided
	if opts.MainPath != "" {
		info, err := os.Stat(opts.MainPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: MAIN file %q does not exist\n", opts.MainPath)
			os.Exit(1)
		}
		if info.IsDir() {
			fmt.Fprintf(os.Stderr, "Error: MAIN path %q is a directory, expected file\n", opts.MainPath)
			os.Exit(1)
		}
	}

	// Validate SUB paths if provided
	for _, subPath := range opts.SubPaths {
		info, err := os.Stat(subPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: SUB file %q does not exist\n", subPath)
			os.Exit(1)
		}
		if info.IsDir() {
			fmt.Fprintf(os.Stderr, "Error: SUB path %q is a directory, expected file\n", subPath)
			os.Exit(1)
		}
	}

	// Initialize state
	appState := state.New(opts.MainPath)

	activeSubSet := false
	for _, subPath := range opts.SubPaths {
		name := filepath.Base(subPath)
		id := appState.AddSubTab(name, subPath, false)

		// If active-sub matches this path or filename, set it as active
		if opts.ActiveSub != "" && !activeSubSet {
			if subPath == opts.ActiveSub || name == opts.ActiveSub {
				appState.SetActiveSubId(id)
				activeSubSet = true
			}
		}
	}

	// If active-sub was specified but not found in the list, try to add it now
	if opts.ActiveSub != "" && !activeSubSet {
		info, err := os.Stat(opts.ActiveSub)
		if err == nil && !info.IsDir() {
			name := filepath.Base(opts.ActiveSub)
			id := appState.AddSubTab(name, opts.ActiveSub, false)
			appState.SetActiveSubId(id)
			activeSubSet = true
		} else {
			// If we can't load it, just warn but continue
			fmt.Fprintf(os.Stderr, "Warning: --active-sub %q not found or invalid\n", opts.ActiveSub)
		}
	}
	defer appState.Cleanup()

	// Load embedded frontend
	dist, err := server.LoadEmbeddedDist(embeddedDist)
	if err != nil {
		log.Fatalf("failed to load embedded dist: %v", err)
	}

	// Set up broadcaster for SSE
	broadcaster := server.New()

	// Start file watcher if enabled
	if opts.Watch && opts.MainPath != "" {
		stopWatcher := watcher.Start(opts.MainPath, func() {
			broadcaster.Broadcast("main-change", "")
		})
		defer stopWatcher()
	}

	// Set up HTTP routes
	mux := http.NewServeMux()
	mux.Handle("/", server.SPAHandler(http.FS(dist), opts.Config))
	mux.HandleFunc("/api/main.pdf", server.HandleMainPDF(appState))
	mux.HandleFunc("/api/sub.pdf", server.HandleSubPDF(appState))
	mux.HandleFunc("/api/bootstrap", server.HandleBootstrap(appState, opts.Focus, opts.Watch))
	mux.HandleFunc("/api/sub/upload", server.HandleSubUpload(appState))
	mux.HandleFunc("/api/main/upload", server.HandleMainUpload(appState, broadcaster))
	mux.HandleFunc("/api/sub", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			server.HandleSubDelete(appState)(w, r)
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/events", broadcaster.HandleSSE)

	// Start server with dynamic port selection
	var listener net.Listener

	if opts.PortSpecified {
		// User requested specific port (or 0 for random). Fail if unavailable.
		addr := fmt.Sprintf("127.0.0.1:%d", opts.Port)
		listener, err = net.Listen("tcp", addr)
		if err != nil {
			log.Fatalf("failed to listen on %s: %v", addr, err)
		}
	} else {
		// Default behavior: try default port, fallback to random
		addr := fmt.Sprintf("127.0.0.1:%d", opts.Port)
		listener, err = net.Listen("tcp", addr)
		if err != nil {
			// If default port failed, try random
			log.Printf("Port %d is busy, trying a random port...", opts.Port)
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
	initialSubPath := appState.GetSubPath()
	if err := session.Register(actualPort, opts.MainPath, initialSubPath); err != nil {
		log.Printf("Warning: failed to register session: %v", err)
	}

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	srv := &http.Server{Handler: mux}

	go func() {
		<-sigChan
		log.Println("Shutting down...")

		// Unregister session
		if err := session.Unregister(); err != nil {
			log.Printf("Warning: failed to unregister session: %v", err)
		}

		// Gracefully shutdown the server
		if err := srv.Shutdown(context.Background()); err != nil {
			log.Printf("Error during shutdown: %v", err)
		}
	}()

	// Open browser if requested
	if opts.OpenBrowser {
		openBrowser(url)
	}

	if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
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
