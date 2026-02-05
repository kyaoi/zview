package cli

import (
	"reflect"
	"testing"
)

func TestReorderArgs(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		expected []string
	}{
		{
			name:     "no flags",
			args:     []string{"main.pdf", "sub.pdf"},
			expected: []string{"main.pdf", "sub.pdf"},
		},
		{
			name:     "flags before args",
			args:     []string{"-watch", "main.pdf"},
			expected: []string{"-watch", "main.pdf"},
		},
		{
			name:     "flags after args",
			args:     []string{"main.pdf", "-watch"},
			expected: []string{"-watch", "main.pdf"},
		},
		{
			name:     "mixed flags and args",
			args:     []string{"main.pdf", "-focus", "sub", "sub.pdf"},
			expected: []string{"-focus", "sub", "main.pdf", "sub.pdf"},
		},
		{
			name:     "flags with values after args",
			args:     []string{"main.pdf", "-port", "8080", "sub.pdf"},
			expected: []string{"-port", "8080", "main.pdf", "sub.pdf"},
		},
		{
			name:     "flag with equal sign",
			args:     []string{"main.pdf", "-port=8080"},
			expected: []string{"-port=8080", "main.pdf"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := reorderArgs(tt.args)
			if !reflect.DeepEqual(got, tt.expected) {
				t.Errorf("reorderArgs(%v) = %v, want %v", tt.args, got, tt.expected)
			}
		})
	}
}

func TestParse(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		want    Options
		wantErr bool
	}{
		{
			name: "simple view",
			args: []string{"main.pdf"},
			want: Options{Command: CommandView, MainPath: "main.pdf", Focus: "main", Watch: true, Port: DefaultPort, OpenBrowser: true},
		},
		{
			name: "view with sub",
			args: []string{"main.pdf", "sub.pdf"},
			want: Options{Command: CommandView, MainPath: "main.pdf", SubPaths: []string{"sub.pdf"}, Focus: "main", Watch: true, Port: DefaultPort, OpenBrowser: true},
		},
		{
			name: "view with mixed flags",
			args: []string{"main.pdf", "--no-watch", "--focus", "sub"},
			want: Options{Command: CommandView, MainPath: "main.pdf", Focus: "sub", Watch: false, Port: DefaultPort, OpenBrowser: true},
		},
		{
			name: "multiple subs and active",
			args: []string{"-m", "main.pdf", "-s", "sub1.pdf", "--sub", "sub2.pdf", "--active-sub", "sub2.pdf"},
			want: Options{Command: CommandView, MainPath: "main.pdf", SubPaths: []string{"sub1.pdf", "sub2.pdf"}, ActiveSub: "sub2.pdf", Focus: "main", Watch: true, Port: DefaultPort, OpenBrowser: true},
		},
	}

	// Note: Config matching is tricky because it loads from file. We'll ignore Config in comparison or mock it if needed.
	// For now, we check key fields.

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Parse(tt.args)
			if (err != nil) != tt.wantErr {
				t.Errorf("Parse() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got.Command != tt.want.Command {
				t.Errorf("Parse().Command = %v, want %v", got.Command, tt.want.Command)
			}
			if got.MainPath != tt.want.MainPath {
				t.Errorf("Parse().MainPath = %v, want %v", got.MainPath, tt.want.MainPath)
			}
			if !reflect.DeepEqual(got.SubPaths, tt.want.SubPaths) {
				t.Errorf("Parse().SubPaths = %v, want %v", got.SubPaths, tt.want.SubPaths)
			}
			if got.ActiveSub != tt.want.ActiveSub {
				t.Errorf("Parse().ActiveSub = %v, want %v", got.ActiveSub, tt.want.ActiveSub)
			}
			if got.Focus != tt.want.Focus {
				t.Errorf("Parse().Focus = %v, want %v", got.Focus, tt.want.Focus)
			}
			if got.Watch != tt.want.Watch {
				t.Errorf("Parse().Watch = %v, want %v", got.Watch, tt.want.Watch)
			}
		})
	}
}
