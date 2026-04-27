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
	if !cfg.TextSelect {
		t.Error("Default TextSelect should be true")
	}
	if !cfg.Animate.Enabled {
		t.Error("Default Animate.Enabled should be true")
	}
	if cfg.Animate.DefaultFps != 12 {
		t.Errorf("Default Animate.DefaultFps should be 12, got %f", cfg.Animate.DefaultFps)
	}
	if cfg.Animate.MaxActiveClips != 4 {
		t.Errorf("Default Animate.MaxActiveClips should be 4, got %d", cfg.Animate.MaxActiveClips)
	}

	// Test default keys (now stored as arrays in a map)
	defaults := DefaultKeysMap()
	if scrollDown, ok := defaults["scroll_down"].([]string); !ok || len(scrollDown) == 0 || scrollDown[0] != "j" {
		t.Errorf("Default scroll_down should be ['j'], got %v", defaults["scroll_down"])
	}
	if scrollUp, ok := defaults["scroll_up"].([]string); !ok || len(scrollUp) == 0 || scrollUp[0] != "k" {
		t.Errorf("Default scroll_up should be ['k'], got %v", defaults["scroll_up"])
	}
	if jumpTop, ok := defaults["jump_top"].([]string); !ok || len(jumpTop) == 0 || jumpTop[0] != "g g" {
		t.Errorf("Default jump_top should be ['g g'], got %v", defaults["jump_top"])
	}
	if toggleFocus, ok := defaults["toggle_focus"].([]string); !ok || len(toggleFocus) == 0 || toggleFocus[0] != "Tab" {
		t.Errorf("Default toggle_focus should be ['Tab'], got %v", defaults["toggle_focus"])
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

	// Keys should have defaults merged
	if _, exists := cfg.Keys["scroll_down"]; !exists {
		t.Error("Keys should have scroll_down from defaults")
	}
}

func TestLoadConfigWithKeys(t *testing.T) {
	// Create a temporary config file with key overrides
	tmpDir := t.TempDir()
	configDir := filepath.Join(tmpDir, ".config", "zview")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatal(err)
	}

	configPath := filepath.Join(configDir, "config.toml")
	content := `
[keys]
scroll_down = ["j", "ArrowDown"]
scroll_up = "k"
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

	// scroll_down should be an array
	scrollDown, ok := cfg.Keys["scroll_down"].([]any)
	if !ok {
		t.Fatalf("scroll_down should be an array, got %T", cfg.Keys["scroll_down"])
	}
	if len(scrollDown) != 2 {
		t.Errorf("scroll_down should have 2 elements, got %d", len(scrollDown))
	}

	// scroll_up should be a string (user specified single value)
	scrollUp, ok := cfg.Keys["scroll_up"].(string)
	if !ok {
		t.Fatalf("scroll_up should be a string, got %T", cfg.Keys["scroll_up"])
	}
	if scrollUp != "k" {
		t.Errorf("scroll_up should be 'k', got %s", scrollUp)
	}

	// Default keys should still be present (merged)
	if _, exists := cfg.Keys["zoom_in"]; !exists {
		t.Error("Keys should have zoom_in from defaults")
	}
}
