import { expect, type APIRequestContext } from "@playwright/test";

export const resetSubTabs = async (request: APIRequestContext) => {
	const res = await request.delete("/api/sub");
	expect(res.ok()).toBe(true);
};
