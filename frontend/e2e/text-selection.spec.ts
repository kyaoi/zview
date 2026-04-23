import { test, expect, type Page } from "@playwright/test";

/**
 * E2E coverage for Initiative A: Chrome-like text selection.
 *
 * The Playwright webServer is configured in playwright.config.ts to serve
 * `e2e/pdfs/02_multipage_navigation.pdf`, which contains predictable text
 * ("Line 1 on page 1. Needed for scroll testing." and so on).
 */

const waitForTextLayer = async (page: Page) => {
	const span = page.locator('[data-testid="pane-main"] .textLayer span').first();
	await expect(span).toBeVisible({ timeout: 10_000 });
};

test.describe("Text selection (TextLayer)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTextLayer(page);
	});

	test("renders TextLayer spans for the visible page", async ({ page }) => {
		const firstPageText = await page.evaluate(() => {
			const spans = document.querySelectorAll(
				'[data-testid="pane-main"] .textLayer span',
			);
			return Array.from(spans)
				.map((s) => s.textContent ?? "")
				.join("");
		});
		expect(firstPageText).toContain("Line 1 on page 1");
	});

	test("selecting TextLayer content yields readable text via Selection API", async ({
		page,
	}) => {
		const selected = await page.evaluate(() => {
			const textLayer = document.querySelector(
				'[data-testid="pane-main"] .textLayer',
			) as HTMLElement | null;
			if (!textLayer) return "";
			const range = document.createRange();
			range.selectNodeContents(textLayer);
			const selection = window.getSelection();
			if (!selection) return "";
			selection.removeAllRanges();
			selection.addRange(range);
			return selection.toString();
		});
		expect(selected).toContain("Multipage Test PDF - Page 1");
		expect(selected).toContain("Line 1 on page 1");
	});
});
