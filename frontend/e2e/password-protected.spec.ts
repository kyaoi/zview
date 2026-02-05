import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { resetSubTabs } from "./helpers";

test.describe("Password-protected PDF", () => {
	test.beforeEach(async ({ page, request }) => {
		const pdfPath = path.resolve("e2e/pdfs/05_password_protected.pdf");
		expect(fs.existsSync(pdfPath)).toBe(true);

		await resetSubTabs(request);
		await page.goto("/");
		await page.waitForSelector('canvas[aria-label="MAIN PDF page 1"]', { state: "visible" });

		const fileInput = page.locator("#sub-file-input");
		await fileInput.setInputFiles(pdfPath);
	});

	test("prompts for password and unlocks with correct entry", async ({ page }) => {
		await expect(page.getByText("Unlock SUB PDF")).toBeVisible();
		await expect(page.getByText("This PDF is password-protected.")).toBeVisible();

		const input = page.getByTestId("pdf-password-input");
		await input.fill("wrong");
		await input.press("Enter");
		await expect(page.getByText("Incorrect password. Try again.")).toBeVisible();

		await input.fill("secret");
		await input.press("Enter");
		await expect(page.getByText("Unlock SUB PDF")).not.toBeVisible();
	});
});
