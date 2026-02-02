package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
)

var errShowHelp = errors.New("show help")

// CommandType represents the type of command to run
type CommandType int

const (
	CommandView CommandType = iota
	CommandPs
	CommandKill
)

type options struct {
	command     CommandType
	killArgs    []string // args for kill command
	mainPath    string
	subPath     string
	focus       string
	watch       bool
	port        int
	openBrowser bool
}

func parseArgs(args []string) (options, error) {
	// Check for subcommands first
	if len(args) > 0 {
		switch args[0] {
		case "ps":
			return options{command: CommandPs}, nil
		case "kill":
			return options{command: CommandKill, killArgs: args[1:]}, nil
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

	opts := options{
		command:     CommandView,
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

	fs.IntVar(&opts.port, "port", opts.port, "port to bind (0 = auto-select)")

	noOpenFlag := fs.Bool("no-open", false, "do not auto-open browser tab")
	versionFlag := fs.Bool("version", false, "print version and exit")

	reordered := reorderArgs(args)
	if err := fs.Parse(reordered); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			// Usage() is already called by flag package
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
