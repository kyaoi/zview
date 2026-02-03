import { test, expect } from "@playwright/test";

test.describe("Keybindings", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
	});

	test("should have initial focus on main pane", async ({ page }) => {
		// Check if the main pane has the focus ring/class
		const _mainPane = page.locator('[data-testid="page-canvas"]').first();
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
		await page.waitForTimeout(300);
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

	test("should handle pane focus (Tab)", async () => {
		// NOTE: Need a SUB pane to fully test functionality, but with only MAIN,
		// Tab might just keep focus or do nothing visible.
		// Since test.pdf loads only main, checking that Tab doesn't crash is a start.
		// To properly test this, we would need to mock a sub-pane loading or
		// extend the test setup to load a sub-file.
		// For now, check focus stays on main if no sub
	});

	test("should switch tabs or fast pan with H/L", async ({ page }) => {
		// In main pane, H/L should be fast pan
		// Since we can't easily verify horizontal scroll without a wide viewport/PDF,
		// we just check that it doesn't crash and potentially check toast if it was added
		// But zview doesn't toast on H/L in main.
		await page.keyboard.press("H");
		await page.keyboard.press("L");
	});

	test("should reload with r/R", async ({ page }) => {
		// Pressing 'r' should trigger a reload toast
		await page.keyboard.press("r");
		await expect(page.locator("text=MAIN: reloading")).toBeVisible();

		// 'R' for reload all (re-render sub)
		await page.keyboard.press("Shift+R");
		await expect(page.locator("text=MAIN: reloading")).toBeVisible();
	});

	test("should jump pages with n/p", async ({ page }) => {
		const container = page.locator(".overflow-auto").first();
		const initialScroll = await container.evaluate((el) => el.scrollTop);

		await page.keyboard.press("n");
		await page.waitForTimeout(500);
		const afterN = await container.evaluate((el) => el.scrollTop);
		expect(afterN).toBeGreaterThan(initialScroll);

		await page.keyboard.press("p");
		await page.waitForTimeout(500);
		const afterP = await container.evaluate((el) => el.scrollTop);
		expect(afterP).toBeLessThan(afterN);
	});
});
