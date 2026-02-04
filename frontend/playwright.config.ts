import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "line",
	use: {
		trace: "on-first-retry",
		baseURL: "http://127.0.0.1:8571",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		// Note: We assume the backend is built correctly.
		// In a real local setup, we might want to build both or assume dev server.
		// For now, let's use the actual binary if available, or just skip if we assume user runs it?
		// User requested "automate", so better to have it self-contained.
		// We can rely on `mise run build` being run before test.
		command: "../zview -no-open e2e/pdfs/02_multipage_navigation.pdf",
		url: "http://127.0.0.1:8571",
		reuseExistingServer: !process.env.CI,
		stdout: "pipe",
		stderr: "pipe",
		// We need a dummy PDF for the command to work.
		// Or we rely on `mise run test:e2e` to set up environment.
		// Let's assume `mise run test:e2e` will handle the build and we just point to the binary.
		// Actually, zview needs a PDF to start.
	},
});
