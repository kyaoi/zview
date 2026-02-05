import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, "../e2e/pdfs");
const execFileAsync = promisify(execFile);

async function ensureDir() {
	try {
		await fs.mkdir(OUT_DIR, { recursive: true });
	} catch (_e) {
		// ignore
	}
}

async function createMinimalPdf() {
	const pdfDoc = await PDFDocument.create();
	const page = pdfDoc.addPage([595.28, 841.89]); // A4
	const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

	page.drawText("Minimal Test PDF", {
		x: 50,
		y: 800,
		size: 24,
		font: helvetica,
		color: rgb(0, 0, 0),
	});

	page.drawText("This is page 1.", {
		x: 50,
		y: 750,
		size: 12,
		font: helvetica,
		color: rgb(0, 0, 0),
	});

	const pdfBytes = await pdfDoc.save();
	await fs.writeFile(path.join(OUT_DIR, "01_minimal.pdf"), pdfBytes);
	console.log("Created 01_minimal.pdf");
}

async function createMultipagePdf() {
	const pdfDoc = await PDFDocument.create();
	const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

	for (let i = 1; i <= 5; i++) {
		const page = pdfDoc.addPage([595.28, 841.89]);
		page.drawText(`Multipage Test PDF - Page ${i}`, {
			x: 50,
			y: 800,
			size: 24,
			font: helvetica,
			color: rgb(0, 0, 0),
		});

		// Add some content to scroll
		for (let j = 0; j < 20; j++) {
			page.drawText(`Line ${j + 1} on page ${i}. Needed for scroll testing.`, {
				x: 50,
				y: 750 - j * 20,
				size: 12,
				font: helvetica,
				color: rgb(0, 0, 0),
			});
		}

		// Mark bottom
		page.drawText(`Bottom of Page ${i}`, {
			x: 50,
			y: 50,
			size: 12,
			font: helvetica,
			color: rgb(0, 0, 0),
		});
	}

	const pdfBytes = await pdfDoc.save();
	await fs.writeFile(path.join(OUT_DIR, "02_multipage_navigation.pdf"), pdfBytes);
	console.log("Created 02_multipage_navigation.pdf");
}

async function createLargePdf() {
	const pdfDoc = await PDFDocument.create();
	const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

	// Large dimension page
	const page1 = pdfDoc.addPage([2000, 2000]);
	page1.drawText("Large Dimension Page (2000x2000)", {
		x: 50,
		y: 1900,
		size: 48,
		font: helvetica,
		color: rgb(0, 0, 0),
	});

	const pdfBytes = await pdfDoc.save();
	await fs.writeFile(path.join(OUT_DIR, "03_large_dimension.pdf"), pdfBytes);
	console.log("Created 03_large_dimension.pdf");
}

async function createWidePdf() {
	const pdfDoc = await PDFDocument.create();
	const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

	const page = pdfDoc.addPage([2200, 800]);
	page.drawText("Wide Landscape Page (2200x800)", {
		x: 60,
		y: 740,
		size: 36,
		font: helvetica,
		color: rgb(0, 0, 0),
	});

	for (let i = 0; i < 6; i++) {
		page.drawText(`Column ${i + 1}`, {
			x: 60 + i * 350,
			y: 600,
			size: 20,
			font: helvetica,
			color: rgb(0, 0, 0),
		});
	}

	const pdfBytes = await pdfDoc.save();
	await fs.writeFile(path.join(OUT_DIR, "04_wide_landscape.pdf"), pdfBytes);
	console.log("Created 04_wide_landscape.pdf");
}

async function createPasswordProtectedPdf() {
	const input = path.join(OUT_DIR, "01_minimal.pdf");
	const output = path.join(OUT_DIR, "05_password_protected.pdf");

	try {
		await execFileAsync("gs", [
			"-q",
			"-sDEVICE=pdfwrite",
			"-dNOPAUSE",
			"-dBATCH",
			"-dSAFER",
			"-dEncryptionR=3",
			"-dKeyLength=128",
			"-sOwnerPassword=owner",
			"-sUserPassword=secret",
			"-o",
			output,
			input,
		]);
		console.log("Created 05_password_protected.pdf (password: secret)");
	} catch (_err) {
		console.warn("Skipping password PDF generation (gs not available).");
	}
}

async function main() {
	await ensureDir();
	await createMinimalPdf();
	await createMultipagePdf();
	await createLargePdf();
	await createWidePdf();
	await createPasswordProtectedPdf();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
