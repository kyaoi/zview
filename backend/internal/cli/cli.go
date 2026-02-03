// Package cli provides command-line interface parsing for zview.
package cli

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/kyaoi/zview/backend/internal/config"
)

// ErrShowHelp indicates that help was displayed and the program should exit.
var ErrShowHelp = errors.New("show help")

const DefaultPort = 8571

// CommandType represents the type of command to run.
type CommandType int

const (
	// CommandView is the default command to view PDFs.
	CommandView CommandType = iota
	// CommandPS lists running zview instances.
	CommandPS
	// CommandKill terminates zview instances.
	CommandKill
)

// Options holds the parsed command-line options.
type Options struct {
	Command       CommandType
	KillArgs      []string // args for kill command
	MainPath      string
	SubPath       string
	Focus         string
	Watch         bool
	Port          int
	PortSpecified bool
	OpenBrowser   bool
	Config        config.Config
}

var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

// Parse parses command-line arguments and returns Options.
func Parse(args []string) (Options, error) {
	// Check for subcommands first
	if len(args) > 0 {
		switch args[0] {
		case "ps":
			return Options{Command: CommandPS}, nil
		case "kill":
			return Options{Command: CommandKill, KillArgs: args[1:]}, nil
		}
	}

	// Parse as a view command
	fs := flag.NewFlagSet("zview", flag.ContinueOnError)
	fs.SetOutput(os.Stdout)
	fs.Usage = func() {
		fmt.Fprintf(fs.Output(), "Usage: zview [options] [MAIN.pdf] [SUB.pdf]\n")
		fmt.Fprintf(fs.Output(), "       zview ps                  - list running instances\n")
		fmt.Fprintf(fs.Output(), "       zview kill [port]         - terminate instance(s)\n")
		fmt.Fprintln(fs.Output(), "\nOptions:")
		fs.PrintDefaults()
		fmt.Fprintln(fs.Output(), "\nExamples:")
		fmt.Fprintln(fs.Output(), "  zview main.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf sub.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf --sub sub.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf sub.pdf --focus sub")
		fmt.Fprintln(fs.Output(), "  zview main.pdf --no-watch")
		fmt.Fprintln(fs.Output(), "  zview ps")
		fmt.Fprintln(fs.Output(), "  zview kill 8571")
	}

	// Load config first
	cfg, _ := config.Load()
	opts := Options{
		Command:     CommandView,
		Focus:       "main",
		Watch:       cfg.Watch,
		Port:        DefaultPort,
		OpenBrowser: true,
		Config:      cfg,
	}

	fs.StringVar(&opts.SubPath, "sub", "", "path to SUB PDF")
	fs.StringVar(&opts.Focus, "focus", opts.Focus, "initial focus: main|sub")
	helpFlag := fs.Bool("help", false, "show this help and exit")

	watchFlag := fs.Bool("watch", cfg.Watch, "enable file watching for MAIN (default)")
	noWatchFlag := fs.Bool("no-watch", false, "disable file watching for MAIN")

	fs.IntVar(&opts.Port, "port", opts.Port, "port to bind (0 = auto-select)")

	noOpenFlag := fs.Bool("no-open", false, "do not auto-open browser tab")
	versionFlag := fs.Bool("version", false, "print version and exit")

	reordered := reorderArgs(args)
	if err := fs.Parse(reordered); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			// Usage() is already called by flag package
			return Options{}, ErrShowHelp
		}
		return Options{}, err
	}
	if *helpFlag {
		fs.Usage()
		return Options{}, ErrShowHelp
	}
	if *versionFlag {
		fmt.Printf("zview %s (%s) built at %s\n", Version, Commit, Date)
		os.Exit(0)
	}

	remaining := fs.Args()
	if len(remaining) > 2 {
		return Options{}, fmt.Errorf("expected at most MAIN and SUB paths, got %d", len(remaining))
	}
	if len(remaining) >= 1 {
		opts.MainPath = remaining[0]
	}
	if len(remaining) == 2 && opts.SubPath == "" {
		opts.SubPath = remaining[1]
	}

	// Update watch based on flags
	opts.Watch = *watchFlag
	if *noWatchFlag {
		opts.Watch = false
	}
	// Update config with final watch state so frontend knows
	opts.Config.Watch = opts.Watch

	opts.OpenBrowser = !*noOpenFlag

	// Check if port was explicitly specified
	fs.Visit(func(f *flag.Flag) {
		if f.Name == "port" {
			opts.PortSpecified = true
		}
	})

	opts.Focus = strings.ToLower(opts.Focus)
	if opts.Focus != "main" && opts.Focus != "sub" {
		return Options{}, fmt.Errorf("invalid --focus value %q (use main or sub)", opts.Focus)
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
