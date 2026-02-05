import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { resetSubTabs } from "./helpers";

type ScrollInfo = {
	top: number;
	left: number;
	scrollHeight: number;
	scrollWidth: number;
	clientHeight: number;
	clientWidth: number;
};

const pdfPaths = {
	minimal: path.resolve("e2e/pdfs/01_minimal.pdf"),
	multipage: path.resolve("e2e/pdfs/02_multipage_navigation.pdf"),
	wide: path.resolve("e2e/pdfs/04_wide_landscape.pdf"),
};

const ensurePdfFiles = () => {
	expect(fs.existsSync(pdfPaths.minimal)).toBe(true);
	expect(fs.existsSync(pdfPaths.multipage)).toBe(true);
	expect(fs.existsSync(pdfPaths.wide)).toBe(true);
};

const getScrollInfo = async (page, paneTestId = "pane-main"): Promise<ScrollInfo> => {
	return page.evaluate((testId) => {
		const pane = document.querySelector(`[data-testid="${testId}"]`);
		const scroller = pane?.querySelector(".overflow-auto") as HTMLElement | null;
		if (!scroller) {
			return {
				top: 0,
				left: 0,
				scrollHeight: 0,
				scrollWidth: 0,
				clientHeight: 0,
				clientWidth: 0,
			};
		}
		return {
			top: scroller.scrollTop,
			left: scroller.scrollLeft,
			scrollHeight: scroller.scrollHeight,
			scrollWidth: scroller.scrollWidth,
			clientHeight: scroller.clientHeight,
			clientWidth: scroller.clientWidth,
		};
	}, paneTestId);
};

const setScroll = async (page, paneTestId: string, top: number, left: number) => {
	await page.evaluate(
		({ testId, topValue, leftValue }) => {
			const pane = document.querySelector(`[data-testid="${testId}"]`);
			const scroller = pane?.querySelector(".overflow-auto") as HTMLElement | null;
			if (!scroller) return;
			scroller.scrollTop = topValue;
			scroller.scrollLeft = leftValue;
		},
		{ testId: paneTestId, topValue: top, leftValue: left },
	);
};

const getCanvasWidth = async (page, role: "MAIN" | "SUB", pageIndex = 1) => {
	const box = await page
		.locator(`canvas[aria-label="${role} PDF page ${pageIndex}"]`)
		.boundingBox();
	return box?.width ?? 0;
};

const expectFocused = async (page, paneTestId: string) => {
	await expect
		.poll(async () =>
			page.getByTestId(paneTestId).evaluate((el) => el.classList.contains("ring-2")),
		)
		.toBe(true);
};

const getPaneOrder = async (page) => {
	return page.evaluate(() => {
		const container = document.querySelector("div.flex.flex-1.min-h-0.w-full.flex-row.gap-0");
		if (!container) return [] as string[];
		const children = Array.from(container.children);
		return children
			.map((child) => child.querySelector("[data-testid^=pane-]")?.getAttribute("data-testid"))
			.filter((id): id is string => Boolean(id));
	});
};

const toggleHelp = async (page) => {
	const help = page.getByText("Keyboard Shortcuts");
	const wasVisible = await help.isVisible();

	await page.keyboard.press("Shift+/");
	await page.waitForTimeout(50);

	if ((await help.isVisible()) === wasVisible) {
		await page.keyboard.press("?");
		await page.waitForTimeout(50);
	}
};

test.describe("Keybindings", () => {
	test.beforeEach(async ({ page, request }) => {
		ensurePdfFiles();
		await resetSubTabs(request);
		await page.setViewportSize({ width: 640, height: 480 });
		await page.goto("/");
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });
		await page.getByTestId("pane-main").click();
	});

	test("navigation keys (j/k/d/u/g g/G)", async ({ page }) => {
		await setScroll(page, "pane-main", 0, 0);
		const before = await getScrollInfo(page, "pane-main");
		expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

		await page.keyboard.press("j");
		await page.waitForTimeout(200);
		const afterJ = await getScrollInfo(page, "pane-main");
		expect(afterJ.top).toBeGreaterThan(before.top);

		await page.keyboard.press("k");
		await page.waitForTimeout(200);
		const afterK = await getScrollInfo(page, "pane-main");
		expect(afterK.top).toBeLessThan(afterJ.top);

		await page.keyboard.press("d");
		await page.waitForTimeout(200);
		const afterD = await getScrollInfo(page, "pane-main");
		expect(afterD.top).toBeGreaterThan(afterK.top);

		await page.keyboard.press("u");
		await page.waitForTimeout(200);
		const afterU = await getScrollInfo(page, "pane-main");
		expect(afterU.top).toBeLessThan(afterD.top);

		await page.keyboard.press("Shift+G");
		await page.waitForTimeout(300);
		const afterG = await getScrollInfo(page, "pane-main");
		expect(afterG.top).toBeGreaterThan(0);

		await page.keyboard.press("g");
		await page.keyboard.press("g");
		await page.waitForFunction(() => {
			const pane = document.querySelector('[data-testid="pane-main"]');
			const scroller = pane?.querySelector(".overflow-auto") as HTMLElement | null;
			return scroller ? scroller.scrollTop === 0 : false;
		});
		const afterGG = await getScrollInfo(page, "pane-main");
		expect(afterGG.top).toBe(0);
	});

	test("page jump keys (n/p)", async ({ page }) => {
		await expect(page.locator('canvas[aria-label="MAIN PDF page 1"]')).toBeVisible();

		await page.keyboard.press("n");
		await page.waitForTimeout(200);
		await expect(page.locator('canvas[aria-label="MAIN PDF page 2"]')).toBeVisible();

		await page.keyboard.press("p");
		await page.waitForTimeout(200);
		await expect(page.locator('canvas[aria-label="MAIN PDF page 1"]')).toBeVisible();
	});

	test("zoom and horizontal scroll keys (+/-/=, h/l)", async ({ page }) => {
		const initialWidth = await getCanvasWidth(page, "MAIN", 1);
		expect(initialWidth).toBeGreaterThan(0);

		await page.keyboard.press("+");
		await page.waitForTimeout(200);
		const afterZoomIn = await getCanvasWidth(page, "MAIN", 1);
		expect(afterZoomIn).toBeGreaterThan(initialWidth);

		await page.keyboard.press("-");
		await page.waitForTimeout(200);
		const afterZoomOut = await getCanvasWidth(page, "MAIN", 1);
		expect(afterZoomOut).toBeLessThan(afterZoomIn);

		await page.keyboard.press("=");
		await page.waitForTimeout(200);
		const fitWidth = await getCanvasWidth(page, "MAIN", 1);
		expect(fitWidth).toBeGreaterThan(0);

		await page.keyboard.press("+");
		await page.keyboard.press("+");
		await page.waitForTimeout(200);
		const afterZoom = await getScrollInfo(page, "pane-main");
		if (afterZoom.scrollWidth <= afterZoom.clientWidth + 2) {
			return;
		}

		await setScroll(page, "pane-main", afterZoom.top, 0);
		await page.keyboard.press("l");
		await page.waitForTimeout(150);
		const afterL = await getScrollInfo(page, "pane-main");
		expect(afterL.left).toBeGreaterThan(0);

		await page.keyboard.press("h");
		await page.waitForTimeout(150);
		const afterH = await getScrollInfo(page, "pane-main");
		expect(afterH.left).toBeLessThan(afterL.left);
	});

	test("help and quit keys (?, q)", async ({ page }) => {
		await toggleHelp(page);
		await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();

		await toggleHelp(page);
		await expect(page.getByText("Keyboard Shortcuts")).not.toBeVisible();

		await page.keyboard.press("q");
		await expect(page.getByText("Close the tab to quit")).toBeVisible();
	});

	test("reload keys (r, R)", async ({ page }) => {
		await page.keyboard.press("r");
		await expect(page.getByText(/MAIN: (reloading|loaded|restored)/i).first()).toBeVisible();

		await page.keyboard.press("Shift+R");
		await expect(page.getByText(/MAIN: (reloading|loaded|restored)/i).first()).toBeVisible();
	});

	test.describe("with SUB", () => {
		test.beforeEach(async ({ page }) => {
			const fileInput = page.locator("#sub-file-input");
			await fileInput.setInputFiles(pdfPaths.minimal);
			await expect(page.getByTestId("pane-label-sub")).toBeVisible();
			await page.getByTestId("pane-main").click();
		});

		test("focus toggle (Tab) and swap panes (s)", async ({ page }) => {
			await expectFocused(page, "pane-main");

			await page.keyboard.press("Tab");
			await expectFocused(page, "pane-sub");

			const beforeOrder = await getPaneOrder(page);
			await page.keyboard.press("s");
			await expect.poll(async () => getPaneOrder(page)).not.toEqual(beforeOrder);
		});

		test("tab switching keys (H/L)", async ({ page }) => {
			const fileInput = page.locator("#sub-file-input");
			await fileInput.setInputFiles(pdfPaths.wide);

			const wideTab = page.locator(".group.relative.flex", {
				hasText: "04_wide_landscape.pdf",
			});
			await expect(wideTab).toBeVisible();
			await expect(wideTab.locator(".bg-fuchsia-500")).toBeVisible();

			await page.getByTestId("pane-sub").click();
			await expectFocused(page, "pane-sub");

			await page.keyboard.press("Shift+H");
			await expect(wideTab.locator(".bg-fuchsia-500")).not.toBeVisible();
			await expect(page.locator(".bg-fuchsia-500")).toBeVisible();

			await page.keyboard.press("Shift+L");
			await expect(wideTab.locator(".bg-fuchsia-500")).toBeVisible();
		});
	});
});
