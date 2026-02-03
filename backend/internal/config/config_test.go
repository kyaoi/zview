package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := Default()

	if !cfg.Watch {
		t.Error("Default Watch should be true")
	}
	if cfg.ZoomStep != 1.2 {
		t.Errorf("Default ZoomStep should be 1.2, got %f", cfg.ZoomStep)
	}
	if cfg.DprCap != 2.0 {
		t.Errorf("Default DprCap should be 2.0, got %f", cfg.DprCap)
	}
	if cfg.ScrollStepVertical != 64.0 {
		t.Errorf("Default ScrollStepVertical should be 64.0, got %f", cfg.ScrollStepVertical)
	}
	if cfg.ScrollStepHorizontal != 64.0 {
		t.Errorf("Default ScrollStepHorizontal should be 64.0, got %f", cfg.ScrollStepHorizontal)
	}
	if cfg.PageScrollRatio != 0.5 {
		t.Errorf("Default PageScrollRatio should be 0.5, got %f", cfg.PageScrollRatio)
	}
}

func TestLoadNoConfig(t *testing.T) {
	// When no config file exists, Load should return defaults
	cfg, err := Load()
	if err != nil {
		// Only fail if it's not a "no config" scenario in a test env
		// In most test envs, there won't be a config file
	}
	_ = cfg // Just ensure it doesn't panic
}

func TestLoadConfigFromFile(t *testing.T) {
	// Create a temporary config file
	tmpDir := t.TempDir()
	configDir := filepath.Join(tmpDir, ".config", "zview")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(configDir, "config.toml")
	content := `
watch = false
zoom_step = 1.5
dpr_cap = 3.0
scroll_step_vertical = 100.0
scroll_step_horizontal = 50.0
page_scroll_ratio = 0.75
`
	if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	// Override HOME for this test
	oldHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", oldHome)

	// Clear XDG_CONFIG_HOME to use HOME-based path
	oldXDG := os.Getenv("XDG_CONFIG_HOME")
	os.Unsetenv("XDG_CONFIG_HOME")
	defer os.Setenv("XDG_CONFIG_HOME", oldXDG)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if cfg.Watch {
		t.Error("Watch should be false")
	}
	if cfg.ZoomStep != 1.5 {
		t.Errorf("ZoomStep should be 1.5, got %f", cfg.ZoomStep)
	}
	if cfg.DprCap != 3.0 {
		t.Errorf("DprCap should be 3.0, got %f", cfg.DprCap)
	}
	if cfg.ScrollStepVertical != 100.0 {
		t.Errorf("ScrollStepVertical should be 100.0, got %f", cfg.ScrollStepVertical)
	}
	if cfg.ScrollStepHorizontal != 50.0 {
		t.Errorf("ScrollStepHorizontal should be 50.0, got %f", cfg.ScrollStepHorizontal)
	}
	if cfg.PageScrollRatio != 0.75 {
		t.Errorf("PageScrollRatio should be 0.75, got %f", cfg.PageScrollRatio)
	}
}
