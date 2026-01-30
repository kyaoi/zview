package main

import (
	"errors"
	"flag"
	"fmt"
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
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", opts.port))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", opts.port, err)
	}

	addr := listener.Addr().String()
	url := "http://" + addr

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writePlaceholder(w, opts)
	})

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("zview backend starting at %s (focus=%s watch=%t)", url, opts.focus, opts.watch)

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

func writePlaceholder(w http.ResponseWriter, opts options) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	mainPath := opts.mainPath
	if mainPath == "" {
		mainPath = "(none)"
	}

	subPath := opts.subPath
	if subPath == "" {
		subPath = "(none)"
	}

	fmt.Fprintf(w, "zview backend skeleton\n\nMAIN: %s\nSUB: %s\nfocus: %s\nwatch: %t\n", mainPath, subPath, opts.focus, opts.watch)
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
