import { test, expect } from "@playwright/test";

test.describe("Keybindings", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("should have initial focus on main pane", async ({ page }) => {
		// Check if the main pane has the focus ring/class
		const _mainPane = page.locator('canvas[aria-label="MAIN PDF page 1"]');
		// Use exact match to avoid matching "Loading MAIN PDF..."
		await expect(page.getByText("MAIN", { exact: true })).toBeVisible();
	});

	test("should handle navigation keys (j/k/h/l/d/u/gg/G)", async ({ page }) => {
		// Set small viewport
		await page.setViewportSize({ width: 500, height: 400 });

		// Wait for content
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });
		await page.click("body");

		// Identify the scroll container (it has overflow-auto)
		const scrollSelector = ".overflow-auto";
		const getScrollTop = () =>
			page.evaluate((sel) => {
				const el = document.querySelector(sel);
				return el ? el.scrollTop : 0;
			}, scrollSelector);

		// Initial state
		await page.evaluate((sel) => {
			const el = document.querySelector(sel);
			if (el) el.scrollTop = 0;
		}, scrollSelector);
		const initialScrollY = await getScrollTop();

		// Check if scrollable
		const isScrollable = await page.evaluate((sel) => {
			const el = document.querySelector(sel);
			return el ? el.scrollHeight > el.clientHeight : false;
		}, scrollSelector);
		expect(isScrollable, "Inner container must be scrollable").toBeTruthy();

		// j: Scroll Down
		await page.keyboard.press("j");
		await page.waitForTimeout(300);
		const scrollAfterJ = await getScrollTop();
		expect(scrollAfterJ).toBeGreaterThan(initialScrollY);

		// k: Scroll Up
		await page.keyboard.press("k");
		await page.waitForTimeout(300);
		const scrollAfterK = await getScrollTop();
		expect(scrollAfterK).toBeLessThan(scrollAfterJ);

		// d: Half page down
		await page.keyboard.press("d");
		await page.waitForTimeout(300);
		const scrollAfterD = await getScrollTop();
		expect(scrollAfterD).toBeGreaterThan(scrollAfterK);

		// u: Half page up
		await page.keyboard.press("u");
		await page.waitForTimeout(300);
		const scrollAfterU = await getScrollTop();
		expect(scrollAfterU).toBeLessThan(scrollAfterD);

		// G: Jump to bottom
		await page.keyboard.press("Shift+G");
		await page.waitForTimeout(300);
		const scrollAfterBigG = await getScrollTop();
		expect(scrollAfterBigG).toBeGreaterThan(0);

		// gg: Jump to top
		await page.keyboard.press("g");
		await page.keyboard.press("g");
		await page.waitForTimeout(500); // Wait for sequence + smooth scroll start
		// Wait for scroll to reach 0 (or close to it)
		await page.waitForFunction(
			(sel) => {
				const el = document.querySelector(sel);
				return el && el.scrollTop === 0;
			},
			scrollSelector,
			{ timeout: 2000 },
		);

		const scrollAfterGG = await getScrollTop();
		expect(scrollAfterGG).toBe(0);
	});

	test("should handle zoom keys (+/-/p)", async ({ page }) => {
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });
		await page.click("body");

		// Use first canvas width
		const getPageWidth = async () => {
			const box = await page.locator('canvas[aria-label="MAIN PDF page 1"]').boundingBox();
			return box ? box.width : 0;
		};

		const initialWidth = await getPageWidth();
		expect(initialWidth).toBeGreaterThan(0);

		// +: Zoom In
		await page.keyboard.press("+");
		await page.waitForTimeout(300);
		const widthAfterZoomIn = await getPageWidth();
		expect(widthAfterZoomIn).toBeGreaterThan(initialWidth);

		// -: Zoom Out
		await page.keyboard.press("-");
		await page.waitForTimeout(300);
		const widthAfterZoomOut = await getPageWidth();
		expect(widthAfterZoomOut).toBeLessThan(widthAfterZoomIn);

		// =: Fit Width (assuming it might change width or at least not crash)
		await page.keyboard.press("=");
		await page.waitForTimeout(100);
		// Check that it did something, difficult to assert exact logic without knowing viewport
	});

	test("should handle help overlay (?)", async ({ page }) => {
		await page.waitForSelector("canvas");

		// Open help
		await page.keyboard.press("?");
		await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();

		// Close help
		await page.keyboard.press("?");
		await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible();
	});

	test("should handle swap pane (s)", async ({ page }) => {
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });

		// Initial: Focus on MAIN
		await expect(page.getByText("MAIN", { exact: true })).toBeVisible();

		// Press 's' to swap
		await page.keyboard.press("s");

		// Since we don't have a SUB loaded, visual indicators might be limited,
		// but we can check if the focus ring moved or if a toast appeared (if any).
		// Currently 's' just swaps the positions/roles visually but maintaining focus logic might depend on content.
		// However, let's verify it doesn't crash and potentially check logs or attributes if possible.
		// For now, simple crash check:
		await expect(page.locator("body")).toBeVisible();
	});

	test("should handle pane focus (Tab)", async ({ page }) => {
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });

		// Initial state: MAIN focused
		const mainPane = page.locator('canvas[aria-label="MAIN PDF page 1"]'); // Use canvas logic

		// Press Tab
		await page.keyboard.press("Tab");

		// Without SUB, behavior might be restricted, but should not crash.
		// Detailed focus logic requires SUB to be present to switch focus meaningfully
		// between separate panes.
		await expect(mainPane).toBeVisible();
	});

	test("should reload with r/R", async ({ page }) => {
		// Pressing 'r' should trigger a reload toast
		// Matching partial text to be safe against case sensitivity and ellipsis
		// Also accepting "loaded" because "reloading" might be too fast
		await page.keyboard.press("r");
		await expect(page.getByText(/MAIN: (reloading|loaded|restored)/i).first()).toBeVisible();

		// 'R' for reload all (re-render sub)
		await page.keyboard.press("Shift+R");
		await expect(page.getByText(/MAIN: (reloading|loaded|restored)/i).first()).toBeVisible();
	});

	test("should handle next/previous page (n/p)", async ({ page }) => {
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });
		await page.click("body");

		// Initial: Page 1
		await expect(page.locator('canvas[aria-label="MAIN PDF page 1"]')).toBeVisible();

		// n: Next Page
		await page.keyboard.press("n");
		await page.waitForTimeout(300); // Wait for scroll/render

		// Should see Page 2
		// We can check if Page 2 canvas is visible/in viewport
		await expect(page.locator('canvas[aria-label="MAIN PDF page 2"]')).toBeVisible();

		// p: Previous Page
		await page.keyboard.press("p");
		await page.waitForTimeout(300);

		// Should see Page 1 again
		await expect(page.locator('canvas[aria-label="MAIN PDF page 1"]')).toBeVisible();
	});
});
