import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test.describe("Multi-tab SUB pane", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("should allow opening multiple SUB files and switching tabs", async ({ page }) => {
		// Define paths to test PDFs (relative to frontend/ dir)
		const pdf1 = path.resolve("e2e/pdfs/01_minimal.pdf");
		const pdf2 = path.resolve("e2e/pdfs/02_multipage_navigation.pdf");

		// Ensure files exist
		expect(fs.existsSync(pdf1)).toBe(true);
		expect(fs.existsSync(pdf2)).toBe(true);

		// 1. Upload first SUB PDF
		const fileInput = page.locator("#sub-file-input");
		await fileInput.setInputFiles(pdf1);

		// Verify first tab appears
		const tabs = page.locator(".group.relative.flex"); // Selector for tabs from SubTabBar
		await expect(tabs).toHaveCount(1);
		await expect(tabs.nth(0)).toContainText("01_minimal.pdf");

		// 2. Upload second SUB PDF
		await fileInput.setInputFiles(pdf2);

		// Verify second tab appears
		await expect(tabs).toHaveCount(2);
		await expect(tabs.nth(1)).toContainText("02_multipage_navigation.pdf");

		// Verify 2nd tab is active (highlighted)
		// Active tab has "bg-slate-800/80" class or "active" style logic
		// Checking for the indicator line
		const activeIndicator = page.locator(".bg-fuchsia-500");
		await expect(activeIndicator).toHaveCount(1);
		// The indicator should be inside the 2nd tab
		await expect(tabs.nth(1).locator(".bg-fuchsia-500")).toBeVisible();

		// 3. Switch to first tab via click
		await tabs.nth(0).click();
		await expect(tabs.nth(0).locator(".bg-fuchsia-500")).toBeVisible();
		await expect(tabs.nth(1).locator(".bg-fuchsia-500")).not.toBeVisible();

		// 4. Switch to next tab via keyboard (Shift+L)
		// Ensure focus is on SUB pane or global keys work
		// Default keys for next_tab are "L" (Shift+l)
		await page.keyboard.press("Shift+L");
		await expect(tabs.nth(1).locator(".bg-fuchsia-500")).toBeVisible();

		// 5. Switch to prev tab via keyboard (Shift+H)
		await page.keyboard.press("Shift+H");
		await expect(tabs.nth(0).locator(".bg-fuchsia-500")).toBeVisible();

		// 6. Close a tab
		// Hove over tab to see close button (if testing hover behavior) or just click it
		// The close button is the second button inside the tab div
		const closeBtn = tabs.nth(0).locator("button").nth(1);
		// Force click because it might be hidden until hover
		await closeBtn.click({ force: true });

		// Verify tab count reduced
		await expect(tabs).toHaveCount(1);
		// Verify remaining tab is the second one
		await expect(tabs.nth(0)).toContainText("02_multipage_navigation.pdf");
	});
});
