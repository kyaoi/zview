import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { resetSubTabs } from "./helpers";

/**
 * The fixture is a 4-frame inline `animate` PDF generated from
 * `frontend/e2e/pdfs/06_animate_inline.tex` (red → green → blue → orange,
 * 4 fps, autoplay, loop). Cycle length is 1 second.
 */
const fixturePath = path.resolve("e2e/pdfs/06_animate_inline.pdf");

const samplePixel = async (page: Page) => {
	return page.evaluate(() => {
		const button = document.querySelector(
			'[data-testid="pane-sub"] button[aria-label^="Animation"]',
		);
		if (!button) return null;
		const canvas = button.querySelector("canvas") as HTMLCanvasElement | null;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		const data = ctx.getImageData(
			Math.floor(canvas.width / 2),
			Math.floor(canvas.height / 2),
			1,
			1,
		).data;
		return [data[0], data[1], data[2], data[3]] as [number, number, number, number];
	});
};

test.describe("Beamer animate playback", () => {
	test.beforeEach(async ({ page, request }) => {
		expect(fs.existsSync(fixturePath)).toBe(true);
		await resetSubTabs(request);
		await page.goto("/");
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', {
			state: "visible",
		});
		const fileInput = page.locator("#sub-file-input");
		await fileInput.setInputFiles(fixturePath);
	});

	test("detects the clip and renders an animation overlay", async ({ page }) => {
		const player = page.locator('[data-testid="pane-sub"] button[aria-label^="Animation"]');
		await expect(player).toBeVisible({ timeout: 10_000 });
		const ariaLabel = await player.getAttribute("aria-label");
		expect(ariaLabel).toMatch(/^Animation 1 on page 1/);
	});

	test("animation actually advances frames over time", async ({ page }) => {
		// Wait for the player to mount.
		await expect(
			page.locator('[data-testid="pane-sub"] button[aria-label^="Animation"]'),
		).toBeVisible({ timeout: 10_000 });

		// Wait for the cache to produce its first paint.
		const firstPixel = await page.waitForFunction(
			async () => {
				const button = document.querySelector(
					'[data-testid="pane-sub"] button[aria-label^="Animation"]',
				);
				const canvas = button?.querySelector("canvas") as HTMLCanvasElement | null;
				if (!canvas || canvas.width === 0) return false;
				const ctx = canvas.getContext("2d");
				if (!ctx) return false;
				const px = ctx.getImageData(
					Math.floor(canvas.width / 2),
					Math.floor(canvas.height / 2),
					1,
					1,
				).data;
				// Reject fully-transparent / fully-black "no paint yet" pixels.
				if (px[3] === 0) return false;
				return [px[0], px[1], px[2], px[3]];
			},
			{ timeout: 15_000 },
		);

		const before = (await firstPixel.jsonValue()) as [number, number, number, number];

		// Sample again after enough wallclock for at least one frame change at
		// 4 fps. We allow up to 1.2 s and check repeatedly so the test is robust
		// against the cache still being warm.
		let after: [number, number, number, number] | null = null;
		const deadline = Date.now() + 2_500;
		while (Date.now() < deadline) {
			await page.waitForTimeout(150);
			const sample = await samplePixel(page);
			if (
				sample &&
				(sample[0] !== before[0] || sample[1] !== before[1] || sample[2] !== before[2])
			) {
				after = sample;
				break;
			}
		}

		expect(after, "expected the animation pixel to change over time").not.toBeNull();
	});
});
