package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const defaultPort = 8571

type options struct {
	mainPath    string
	subPath     string
	focus       string
	watch       bool
	port        int
	openBrowser bool
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

	opts := options{
		focus:       "main",
		watch:       true,
		port:        defaultPort,
		openBrowser: true,
	}

	fs.StringVar(&opts.subPath, "sub", "", "path to SUB PDF")
	fs.StringVar(&opts.focus, "focus", opts.focus, "initial focus: main|sub")

	watchFlag := fs.Bool("watch", true, "enable file watching for MAIN (default)")
	noWatchFlag := fs.Bool("no-watch", false, "disable file watching for MAIN")

	fs.IntVar(&opts.port, "port", opts.port, "port to bind (0 = random)")

	noOpenFlag := fs.Bool("no-open", false, "do not auto-open browser tab")

	if err := fs.Parse(args); err != nil {
		return options{}, err
	}

	remaining := fs.Args()
	if len(remaining) > 1 {
		return options{}, fmt.Errorf("expected at most one MAIN.pdf argument, got %d", len(remaining))
	}
	if len(remaining) == 1 {
		opts.mainPath = remaining[0]
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

func run(opts options) error {
	staticFS, err := loadEmbeddedDist()
	if err != nil {
		return err
	}

	bootstrap := bootstrapInfo{
		Focus:   opts.focus,
		HasMain: opts.mainPath != "",
		HasSub:  opts.subPath != "",
		Watch:   opts.watch,
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
	mux.Handle("/api/bootstrap", bootstrapHandler(bootstrap))
	mux.Handle("/api/main.pdf", pdfHandler("MAIN", opts.mainPath))
	mux.Handle("/api/sub.pdf", pdfHandler("SUB", opts.subPath))

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

func bootstrapHandler(info bootstrapInfo) http.Handler {
	payload, err := json.Marshal(info)
	if err != nil {
		panic(fmt.Errorf("failed to marshal bootstrap info: %w", err))
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(payload)
	})
}

func pdfHandler(role string, path string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
