package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// runPsCommand lists all running zview sessions
func runPsCommand() error {
	sessions, err := listSessions()
	if err != nil {
		return fmt.Errorf("failed to list sessions: %w", err)
	}

	if len(sessions) == 0 {
		fmt.Println("No running zview instances found.")
		return nil
	}

	// Print header
	fmt.Printf("%-6s  %-6s  %-30s  %-30s  %s\n", "INDEX", "PORT", "MAIN", "SUB", "STARTED")
	fmt.Println(strings.Repeat("-", 100))

	for i, s := range sessions {
		mainPath := truncatePath(s.MainPath, 30)
		subPath := truncatePath(s.SubPath, 30)
		startTime := s.StartTime.Format("2006-01-02 15:04:05")
		fmt.Printf("%-6d  %-6d  %-30s  %-30s  %s\n", i+1, s.Port, mainPath, subPath, startTime)
	}

	return nil
}

// runKillCommand terminates zview instances
func runKillCommand(args []string) error {
	if len(args) > 0 {
		// Kill by port
		port, err := strconv.Atoi(args[0])
		if err != nil {
			return fmt.Errorf("invalid port number: %s", args[0])
		}
		return killByPort(port)
	}

	// Interactive mode
	return killInteractive()
}

// killByPort terminates the session running on the given port
func killByPort(port int) error {
	session, err := findSessionByPort(port)
	if err != nil {
		return err
	}
	if session == nil {
		return fmt.Errorf("no zview instance found on port %d", port)
	}

	if err := terminateProcess(session.PID); err != nil {
		return fmt.Errorf("failed to terminate process %d: %w", session.PID, err)
	}

	if err := unregisterSessionByPID(session.PID); err != nil {
		return fmt.Errorf("failed to unregister session: %w", err)
	}

	fmt.Printf("Terminated zview on port %d (PID: %d)\n", port, session.PID)
	return nil
}

// killInteractive shows a list of sessions and prompts for selection
func killInteractive() error {
	sessions, err := listSessions()
	if err != nil {
		return fmt.Errorf("failed to list sessions: %w", err)
	}

	if len(sessions) == 0 {
		fmt.Println("No running zview instances found.")
		return nil
	}

	// Print header
	fmt.Println("Running zview instances:")
	fmt.Printf("%-6s  %-6s  %-30s  %-30s  %s\n", "INDEX", "PORT", "MAIN", "SUB", "STARTED")
	fmt.Println(strings.Repeat("-", 100))

	for i, s := range sessions {
		mainPath := truncatePath(s.MainPath, 30)
		subPath := truncatePath(s.SubPath, 30)
		startTime := s.StartTime.Format("2006-01-02 15:04:05")
		fmt.Printf("%-6d  %-6d  %-30s  %-30s  %s\n", i+1, s.Port, mainPath, subPath, startTime)
	}

	fmt.Println()
	fmt.Print("Enter index(es) to kill (comma-separated, e.g., 1,3) or 'all': ")
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return fmt.Errorf("failed to read input: %w", err)
	}

	input = strings.TrimSpace(input)
	if input == "" {
		fmt.Println("No selection made. Exiting.")
		return nil
	}

	var indices []int
	if strings.ToLower(input) == "all" {
		for i := range sessions {
			indices = append(indices, i)
		}
	} else {
		parts := strings.Split(input, ",")
		for _, p := range parts {
			p = strings.TrimSpace(p)
			idx, err := strconv.Atoi(p)
			if err != nil || idx < 1 || idx > len(sessions) {
				fmt.Printf("Invalid index: %s (skipping)\n", p)
				continue
			}
			indices = append(indices, idx-1)
		}
	}

	if len(indices) == 0 {
		fmt.Println("No valid selection made. Exiting.")
		return nil
	}

	killed := 0
	for _, idx := range indices {
		s := sessions[idx]
		if err := terminateProcess(s.PID); err != nil {
			fmt.Printf("Failed to terminate PID %d: %v\n", s.PID, err)
			continue
		}
		if err := unregisterSessionByPID(s.PID); err != nil {
			fmt.Printf("Failed to unregister PID %d: %v\n", s.PID, err)
		}
		fmt.Printf("Terminated zview on port %d (PID: %d)\n", s.Port, s.PID)
		killed++
	}

	fmt.Printf("\nTerminated %d instance(s).\n", killed)
	return nil
}

// terminateProcess sends SIGTERM to the given PID
func terminateProcess(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}

	// Give process time to clean up gracefully
	if err := process.Signal(syscall.SIGTERM); err != nil {
		return err
	}

	// Wait briefly for the process to terminate
	done := make(chan struct{})
	go func() {
		for i := 0; i < 10; i++ {
			if !isProcessRunning(pid) {
				close(done)
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		close(done)
	}()
	<-done

	return nil
}

// truncatePath shortens a path for display
func truncatePath(path string, maxLen int) string {
	if path == "" {
		return "(none)"
	}
	if len(path) <= maxLen {
		return path
	}
	return "..." + path[len(path)-maxLen+3:]
}
