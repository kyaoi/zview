import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		// Embed-ready: emit assets into backend/dist (Go embed target).
		outDir: "../backend/dist",
		emptyOutDir: true,
	},
});
