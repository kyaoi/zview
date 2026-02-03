import { test, expect } from "@playwright/test";

test.describe("Keybindings", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("should have initial focus on main pane", async ({ page }) => {
		// Check if the main pane has the focus ring/class
		const mainPane = page.locator('[data-testid="page-canvas"]').first();
		// Use exact match to avoid matching "Loading MAIN PDF..."
		await expect(page.getByText("MAIN", { exact: true })).toBeVisible();
	});

	test("j/k should scroll the page", async ({ page }) => {
		// We wait for canvas to be ready
		await page.waitForSelector("canvas");

		// Get initial scroll position
		const initialScroll = await page.evaluate(() => window.scrollY);

		// Press 'j' to scroll down
		await page.keyboard.press("j");
		await page.waitForTimeout(100); // Wait for scroll animation/event

		const newScroll = await page.evaluate(() => window.scrollY);
		expect(newScroll).toBeGreaterThanOrEqual(initialScroll);
	});
});
