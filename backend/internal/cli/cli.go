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

// RepeatedString captures multiple flag occurrences.
type RepeatedString []string

func (r *RepeatedString) String() string {
	return strings.Join(*r, ", ")
}

func (r *RepeatedString) Set(value string) error {
	*r = append(*r, value)
	return nil
}

// Options holds the parsed command-line options.
type Options struct {
	Command       CommandType
	KillArgs      []string // args for kill command
	MainPath      string
	SubPaths      []string
	ActiveSub     string
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
		fmt.Fprintf(fs.Output(), "Usage: zview [options] [MAIN.pdf] [SUB.pdf...]\n")
		fmt.Fprintf(fs.Output(), "       zview ps                  - list running instances\n")
		fmt.Fprintf(fs.Output(), "       zview kill [port]         - terminate instance(s)\n")
		fmt.Fprintln(fs.Output(), "\nOptions:")
		fs.PrintDefaults()
		fmt.Fprintln(fs.Output(), "\nExamples:")
		fmt.Fprintln(fs.Output(), "  zview main.pdf")
		fmt.Fprintln(fs.Output(), "  zview -m main.pdf -s sub1.pdf -s sub2.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf sub1.pdf sub2.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf -s sub1.pdf --active-sub sub1.pdf")
		fmt.Fprintln(fs.Output(), "  zview main.pdf --no-watch")
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

	var subFlags RepeatedString

	// Standard flags
	fs.StringVar(&opts.MainPath, "main", "", "path to MAIN PDF")
	fs.StringVar(&opts.MainPath, "m", "", "path to MAIN PDF (short)")
	fs.Var(&subFlags, "sub", "path to SUB PDF (can be repeated)")
	fs.Var(&subFlags, "s", "path to SUB PDF (short, can be repeated)")
	fs.StringVar(&opts.ActiveSub, "active-sub", "", "filename/path of SUB PDF to activate initially")
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

	// Consolidate arguments
	// Positionals
	positionals := fs.Args()

	// 1. Resolve MAIN
	// If flag not set, take first positional
	if opts.MainPath == "" && len(positionals) > 0 {
		opts.MainPath = positionals[0]
		positionals = positionals[1:]
	}

	// 2. Resolve SUBs
	// Add flags first
	opts.SubPaths = append(opts.SubPaths, subFlags...)
	// Add remaining positionals
	opts.SubPaths = append(opts.SubPaths, positionals...)

	// Update watch based on flags
	opts.Watch = *watchFlag
	if *noWatchFlag {
		opts.Watch = false
	}
	opts.Config.Watch = opts.Watch
	opts.OpenBrowser = !*noOpenFlag

	// Check port
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
		case "sub", "s", "main", "m", "active-sub", "focus", "port":
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
