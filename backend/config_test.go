package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	// Create a temporary directory for config
	tmpDir := t.TempDir()
	os.Setenv("XDG_CONFIG_HOME", tmpDir)
	defer os.Unsetenv("XDG_CONFIG_HOME")

	configDir := filepath.Join(tmpDir, "zview")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatal(err)
	}

	configFile := filepath.Join(configDir, "config.toml")
	content := []byte(`
watch = false
zoom_step = 1.5
dpr_cap = 1.0
`)
	if err := os.WriteFile(configFile, content, 0644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	if cfg.Watch {
		t.Errorf("Expected Watch to be false, got true")
	}
	if cfg.ZoomStep != 1.5 {
		t.Errorf("Expected ZoomStep to be 1.5, got %f", cfg.ZoomStep)
	}
	if cfg.DprCap != 1.0 {
		t.Errorf("Expected DprCap to be 1.0, got %f", cfg.DprCap)
	}
	// Default ScrollSteps since not in file
	if cfg.ScrollStepVertical != 64.0 {
		t.Errorf("Expected ScrollStepVertical to be 64.0, got %f", cfg.ScrollStepVertical)
	}
}

func TestDefaultConfig(t *testing.T) {
	// Ensure no config file exists in a new temp dir
	tmpDir := t.TempDir()
	os.Setenv("XDG_CONFIG_HOME", tmpDir)
	defer os.Unsetenv("XDG_CONFIG_HOME")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig failed: %v", err)
	}

	// Defaults: Watch=true, ZoomStep=1.2, DprCap=2.0
	if !cfg.Watch {
		t.Errorf("Expected Watch to be true by default")
	}
	if cfg.ZoomStep != 1.2 {
		t.Errorf("Expected ZoomStep to be 1.2")
	}
	if cfg.DprCap != 2.0 {
		t.Errorf("Expected DprCap to be 2.0")
	}
	if cfg.ScrollStepVertical != 64.0 {
		t.Errorf("Expected ScrollStepVertical to be 64.0")
	}
	if cfg.ScrollStepHorizontal != 64.0 {
		t.Errorf("Expected ScrollStepHorizontal to be 64.0")
	}
	if cfg.PageScrollRatio != 0.5 {
		t.Errorf("Expected PageScrollRatio to be 0.5")
	}
}
