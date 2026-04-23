// Package config provides configuration loading and management for zview.
package config

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
)

// Config holds the application configuration.
type Config struct {
	Watch                   bool           `toml:"watch" json:"watch"`
	ZoomStep                float64        `toml:"zoom_step" json:"zoom_step"`
	DprCap                  float64        `toml:"dpr_cap" json:"dpr_cap"`
	ScrollStepVertical      float64        `toml:"scroll_step_vertical" json:"scroll_step_vertical"`
	ScrollStepHorizontal    float64        `toml:"scroll_step_horizontal" json:"scroll_step_horizontal"`
	PageScrollRatio         float64        `toml:"page_scroll_ratio" json:"page_scroll_ratio"`
	TextSelect              bool           `toml:"text_select" json:"text_select"`
	Keys                    map[string]any `toml:"keys" json:"keys"`
	BlockedKeys             []string       `toml:"blocked_keys" json:"blocked_keys"`
	DisableBrowserShortcuts bool           `toml:"disable_browser_shortcuts" json:"disable_browser_shortcuts"`
}

// DefaultKeysMap returns the default keybinding configuration as a map.
// Values are arrays to support multiple keybindings per action.
func DefaultKeysMap() map[string]any {
	return map[string]any{
		"scroll_down":    []string{"j"},
		"scroll_up":      []string{"k"},
		"scroll_left":    []string{"h"},
		"scroll_right":   []string{"l"},
		"half_page_down": []string{"d"},
		"half_page_up":   []string{"u"},
		"jump_top":       []string{"g g"},
		"jump_bottom":    []string{"G"},
		"next_page":      []string{"n"},
		"prev_page":      []string{"p"},
		"zoom_in":        []string{"+"},
		"zoom_out":       []string{"-"},
		"fit_width":      []string{"="},
		"toggle_focus":   []string{"Tab"},
		"swap_panes":     []string{"s"},
		"reload_main":    []string{"r"},
		"reload_all":     []string{"R"},
		"toggle_help":    []string{"?"},
		"quit":           []string{"q"},
	}
}

// Default returns the default configuration values.
func Default() Config {
	return Config{
		Watch:                true,
		ZoomStep:             1.2,
		DprCap:               2.0,
		ScrollStepVertical:   64.0,
		ScrollStepHorizontal: 64.0,
		PageScrollRatio:      0.5,
		TextSelect:           true,
		Keys:                 DefaultKeysMap(),
	}
}

// Load reads configuration from the user's config file.
// If no config file exists, default values are returned.
func Load() (Config, error) {
	cfg := Default()

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return cfg, err // Return default if we can't find home
	}

	configDir := os.Getenv("XDG_CONFIG_HOME")
	if configDir == "" {
		configDir = filepath.Join(homeDir, ".config")
	}

	configPath := filepath.Join(configDir, "zview", "config.toml")

	f, err := os.Open(configPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil // No config file is fine, return defaults
		}
		return cfg, err
	}
	defer f.Close()

	decoder := toml.NewDecoder(f)
	if err := decoder.Decode(&cfg); err != nil {
		return cfg, err
	}

	// Merge user keys with defaults (user config overrides defaults)
	defaults := DefaultKeysMap()
	if cfg.Keys == nil {
		cfg.Keys = defaults
	} else {
		for k, v := range defaults {
			if _, exists := cfg.Keys[k]; !exists {
				cfg.Keys[k] = v
			}
		}
	}

	return cfg, nil
}
