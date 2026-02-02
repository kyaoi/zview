package main

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Watch    bool    `toml:"watch" json:"watch"`
	ZoomStep float64 `toml:"zoom_step" json:"zoom_step"`
	DprCap   float64 `toml:"dpr_cap" json:"dpr_cap"`
}

func DefaultConfig() Config {
	return Config{
		Watch:    true,
		ZoomStep: 1.2,
		DprCap:   2.0,
	}
}

func LoadConfig() (Config, error) {
	cfg := DefaultConfig()

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
