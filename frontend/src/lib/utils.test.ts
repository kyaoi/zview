import { describe, it, expect } from "vitest";
import { classNames, clampScaleValue, withCacheBust } from "./utils";
import { ZOOM_MAX, ZOOM_MIN } from "./constants";

describe("utils", () => {
	describe("classNames", () => {
		it("should join valid class names", () => {
			expect(classNames("a", "b")).toBe("a b");
		});

		it("should filter out falsy values", () => {
			expect(classNames("a", false, null, undefined, "b")).toBe("a b");
		});

		it("should return empty string for no args", () => {
			expect(classNames()).toBe("");
		});
	});

	describe("clampScaleValue", () => {
		it("should clamp value within range", () => {
			expect(clampScaleValue(ZOOM_MIN - 0.1)).toBe(ZOOM_MIN);
			expect(clampScaleValue(ZOOM_MAX + 0.1)).toBe(ZOOM_MAX);
			expect(clampScaleValue(1.0)).toBe(1.0);
		});
	});

	describe("withCacheBust", () => {
		it("should append cache buster", () => {
			const url = "http://example.com/file.pdf";
			const token = 123;
			const result = withCacheBust(url, token);
			expect(result).toMatch(/http:\/\/example\.com\/file\.pdf\?cb=123-\d+/);
		});

		it("should append with & if query exists", () => {
			const url = "http://example.com/file.pdf?foo=bar";
			const token = 123;
			const result = withCacheBust(url, token);
			expect(result).toMatch(/http:\/\/example\.com\/file\.pdf\?foo=bar&cb=123-\d+/);
		});

		it("should return url as is if token <= 0", () => {
			expect(withCacheBust("url", 0)).toBe("url");
			expect(withCacheBust("url", -1)).toBe("url");
		});
	});
});
