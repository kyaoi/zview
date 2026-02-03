// Package config provides configuration loading and management for zview.
package config

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
)

// Keys holds keybinding configuration.
type Keys struct {
	ScrollDown   string `toml:"scroll_down" json:"scroll_down"`
	ScrollUp     string `toml:"scroll_up" json:"scroll_up"`
	ScrollLeft   string `toml:"scroll_left" json:"scroll_left"`
	ScrollRight  string `toml:"scroll_right" json:"scroll_right"`
	HalfPageDown string `toml:"half_page_down" json:"half_page_down"`
	HalfPageUp   string `toml:"half_page_up" json:"half_page_up"`
	JumpTop      string `toml:"jump_top" json:"jump_top"`
	JumpBottom   string `toml:"jump_bottom" json:"jump_bottom"`
	NextPage     string `toml:"next_page" json:"next_page"`
	PrevPage     string `toml:"prev_page" json:"prev_page"`
	ZoomIn       string `toml:"zoom_in" json:"zoom_in"`
	ZoomOut      string `toml:"zoom_out" json:"zoom_out"`
	FitWidth     string `toml:"fit_width" json:"fit_width"`
	ToggleFocus  string `toml:"toggle_focus" json:"toggle_focus"`
	SwapPanes    string `toml:"swap_panes" json:"swap_panes"`
	ReloadMain   string `toml:"reload_main" json:"reload_main"`
	ReloadAll    string `toml:"reload_all" json:"reload_all"`
	ToggleHelp   string `toml:"toggle_help" json:"toggle_help"`
	Quit         string `toml:"quit" json:"quit"`
}

// DefaultKeys returns the default keybinding configuration.
func DefaultKeys() Keys {
	return Keys{
		ScrollDown:   "j",
		ScrollUp:     "k",
		ScrollLeft:   "h",
		ScrollRight:  "l",
		HalfPageDown: "d",
		HalfPageUp:   "u",
		JumpTop:      "gg",
		JumpBottom:   "G",
		NextPage:     "n",
		PrevPage:     "p",
		ZoomIn:       "+",
		ZoomOut:      "-",
		FitWidth:     "=",
		ToggleFocus:  "Tab",
		SwapPanes:    "s",
		ReloadMain:   "r",
		ReloadAll:    "R",
		ToggleHelp:   "?",
		Quit:         "q",
	}
}

// Config holds the application configuration.
type Config struct {
	Watch                bool    `toml:"watch" json:"watch"`
	ZoomStep             float64 `toml:"zoom_step" json:"zoom_step"`
	DprCap               float64 `toml:"dpr_cap" json:"dpr_cap"`
	ScrollStepVertical   float64 `toml:"scroll_step_vertical" json:"scroll_step_vertical"`
	ScrollStepHorizontal float64 `toml:"scroll_step_horizontal" json:"scroll_step_horizontal"`
	PageScrollRatio      float64 `toml:"page_scroll_ratio" json:"page_scroll_ratio"`
	Keys                 Keys    `toml:"keys" json:"keys"`
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
		Keys:                 DefaultKeys(),
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

	return cfg, nil
}
