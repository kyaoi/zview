package cli

import (
	"os"
	"testing"
)

func TestParseHelp(t *testing.T) {
	tests := []struct {
		args []string
		want CommandType
	}{
		{[]string{"-h"}, CommandView}, // -h will trigger ErrShowHelp
		{[]string{"--help"}, CommandView},
	}

	for _, tt := range tests {
		opts, err := Parse(tt.args)
		// Help flags should return ErrShowHelp
		if err == ErrShowHelp {
			continue // Expected behavior for help
		}
		if err != nil {
			t.Errorf("Parse(%v) error = %v", tt.args, err)
			continue
		}
		_ = opts
	}
}

func TestParsePS(t *testing.T) {
	opts, err := Parse([]string{"ps"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if opts.Command != CommandPS {
		t.Errorf("Command = %v, want %v", opts.Command, CommandPS)
	}
}

func TestParseKill(t *testing.T) {
	opts, err := Parse([]string{"kill", "8080"})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if opts.Command != CommandKill {
		t.Errorf("Command = %v, want %v", opts.Command, CommandKill)
	}
	if len(opts.KillArgs) != 1 || opts.KillArgs[0] != "8080" {
		t.Errorf("KillArgs = %v, want [8080]", opts.KillArgs)
	}
}

func TestParseView(t *testing.T) {
	// Create temporary test files
	tmpDir := t.TempDir()
	mainFile := tmpDir + "/main.pdf"
	subFile := tmpDir + "/sub.pdf"
	os.WriteFile(mainFile, []byte{}, 0644)
	os.WriteFile(subFile, []byte{}, 0644)

	opts, err := Parse([]string{mainFile, subFile})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if opts.Command != CommandView {
		t.Errorf("Command = %v, want %v", opts.Command, CommandView)
	}
	if opts.MainPath != mainFile {
		t.Errorf("MainPath = %v, want %v", opts.MainPath, mainFile)
	}
	if opts.SubPath != subFile {
		t.Errorf("SubPath = %v, want %v", opts.SubPath, subFile)
	}
}

func TestParseWithFlags(t *testing.T) {
	tmpDir := t.TempDir()
	mainFile := tmpDir + "/main.pdf"
	os.WriteFile(mainFile, []byte{}, 0644)

	opts, err := Parse([]string{"-port", "3000", "--no-watch", mainFile})
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}
	if opts.Port != 3000 {
		t.Errorf("Port = %v, want 3000", opts.Port)
	}
	if opts.Watch {
		t.Error("Watch should be false when --no-watch is set")
	}
	if opts.MainPath != mainFile {
		t.Errorf("MainPath = %v, want %v", opts.MainPath, mainFile)
	}
}
