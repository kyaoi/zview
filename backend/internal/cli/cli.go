// Package cli provides command-line interface parsing for zview.
package cli

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"runtime/debug"
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

// versionInfo returns version, commit, and date strings, preferring values
// injected via -ldflags (used by GoReleaser) and falling back to
// runtime/debug.ReadBuildInfo so `go install module@vX` and `go build` in a
// VCS checkout still produce meaningful output instead of "dev (none) ...".
func versionInfo() (version, commit, date string) {
	version, commit, date = Version, Commit, Date
	info, ok := debug.ReadBuildInfo()
	if !ok {
		return
	}
	if version == "dev" && info.Main.Version != "" && info.Main.Version != "(devel)" {
		version = info.Main.Version
	}
	for _, s := range info.Settings {
		switch s.Key {
		case "vcs.revision":
			if commit == "none" && s.Value != "" {
				commit = s.Value
				if len(commit) > 7 {
					commit = commit[:7]
				}
			}
		case "vcs.time":
			if date == "unknown" && s.Value != "" {
				date = s.Value
			}
		}
	}
	return
}

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
		out := fs.Output()
		fmt.Fprintf(out, "Usage: zview [options] [MAIN.pdf] [SUB.pdf...]\n")
		fmt.Fprintf(out, "       zview ps                  - list running instances\n")
		fmt.Fprintf(out, "       zview kill [port]         - terminate instance(s)\n")
		fmt.Fprintln(out, "\nOptions:")
		// Manually print flags to enforce double-hyphen style for long flags
		fmt.Fprintln(out, "  -m, --main <path>        path to MAIN PDF")
		fmt.Fprintln(out, "  -s, --sub <path>         path to SUB PDF (can be repeated)")
		fmt.Fprintln(out, "      --active-sub <path>  filename/path of SUB PDF to activate initially")
		fmt.Fprintln(out, "      --focus <pane>       initial focus: main|sub (default \"main\")")
		fmt.Fprintln(out, "      --help               show this help and exit")
		fmt.Fprintln(out, "      --watch              enable file watching for MAIN (default: true)")
		fmt.Fprintln(out, "      --no-watch           disable file watching for MAIN")
		fmt.Fprintln(out, "      --no-text-select     disable selectable text layer (smaller memory footprint)")
		fmt.Fprintln(out, "      --no-animate         disable Beamer `animate` playback layer")
		fmt.Fprintln(out, "      --port <int>         port to bind (0 = auto-select) (default 8571)")
		fmt.Fprintln(out, "      --no-open            do not auto-open browser tab")
		fmt.Fprintln(out, "      --version            print version and exit")

		fmt.Fprintln(out, "\nExamples:")
		fmt.Fprintln(out, "  zview main.pdf")
		fmt.Fprintln(out, "  zview -m main.pdf -s sub1.pdf -s sub2.pdf")
		fmt.Fprintln(out, "  zview main.pdf sub1.pdf sub2.pdf")
		fmt.Fprintln(out, "  zview main.pdf -s sub1.pdf --active-sub sub1.pdf")
		fmt.Fprintln(out, "  zview main.pdf --no-watch")
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

	// Standard flags - usage strings here are less important as we manualy print Usage,
	// but good to keep them for documentation/completeness if we revert to PrintDefaults.
	fs.StringVar(&opts.MainPath, "main", "", "path to MAIN PDF")
	fs.StringVar(&opts.MainPath, "m", "", "path to MAIN PDF")
	fs.Var(&subFlags, "sub", "path to SUB PDF")
	fs.Var(&subFlags, "s", "path to SUB PDF")
	fs.StringVar(&opts.ActiveSub, "active-sub", "", "filename/path of SUB PDF to activate initially")
	fs.StringVar(&opts.Focus, "focus", opts.Focus, "initial focus: main|sub")

	helpFlag := fs.Bool("help", false, "show this help and exit")
	watchFlag := fs.Bool("watch", cfg.Watch, "enable file watching for MAIN (default)")
	noWatchFlag := fs.Bool("no-watch", false, "disable file watching for MAIN")
	noTextSelectFlag := fs.Bool("no-text-select", false, "disable selectable text layer")
	noAnimateFlag := fs.Bool("no-animate", false, "disable Beamer animate playback layer")
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
		v, c, d := versionInfo()
		fmt.Printf("zview %s (%s) built at %s\n", v, c, d)
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
	if *noTextSelectFlag {
		opts.Config.TextSelect = false
	}
	if *noAnimateFlag {
		opts.Config.Animate.Enabled = false
	}
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
