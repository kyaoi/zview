import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocumentMock, triggerRef } = vi.hoisted(() => ({
	getDocumentMock: vi.fn(),
	triggerRef: { current: null as ((reason: number) => void) | null },
}));

vi.mock("pdfjs-dist", () => ({
	getDocument: getDocumentMock,
	GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => {
	return { default: "worker" };
});

import { PdfViewer } from "./index";

describe("PdfViewer password prompt", () => {
	beforeEach(() => {
		getDocumentMock.mockReset();
		triggerRef.current = null;
		getDocumentMock.mockImplementation(() => {
			const loadingTask: {
				onPassword?: (updatePassword: (password: string) => void, reason: number) => void;
				promise: Promise<unknown>;
				destroy: () => void;
			} = {
				promise: new Promise(() => {}),
				destroy: vi.fn(),
			};
			const updatePassword = (password: string) => {
				if (password !== "secret") {
					loadingTask.onPassword?.(updatePassword, 2);
				}
			};
			triggerRef.current = (reason: number) => {
				loadingTask.onPassword?.(updatePassword, reason);
			};
			return loadingTask;
		});

		if (!globalThis.ResizeObserver) {
			class TestResizeObserver {
				private readonly callback: ResizeObserverCallback;
				constructor(callback: ResizeObserverCallback) {
					this.callback = callback;
				}
				observe() {
					this.callback([], this as unknown as ResizeObserver);
				}
				unobserve() {}
				disconnect() {}
			}
			globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
		}
		if (!globalThis.requestAnimationFrame) {
			globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
				setTimeout(cb, 0) as unknown as number;
		}
		if (!HTMLCanvasElement.prototype.getContext) {
			const getContextMock = vi.fn().mockReturnValue({
				fillRect: () => {},
				clearRect: () => {},
			} as unknown as CanvasRenderingContext2D);
			HTMLCanvasElement.prototype.getContext =
				getContextMock as unknown as HTMLCanvasElement["getContext"];
		}
	});

	it("prompts for password and re-prompts on incorrect entry", async () => {
		const onNotify = vi.fn();
		render(<PdfViewer paneRole="MAIN" url="/api/main.pdf" onNotify={onNotify} />);

		await waitFor(() => expect(getDocumentMock).toHaveBeenCalled());
		await act(async () => {
			triggerRef.current?.(1);
		});

		expect(screen.getByText("Unlock MAIN PDF")).toBeInTheDocument();
		expect(screen.getByText("This PDF is password-protected.")).toBeInTheDocument();

		const input = screen.getByTestId("pdf-password-input");
		await act(async () => {
			fireEvent.change(input, { target: { value: "wrong" } });
			fireEvent.submit(input.closest("form") as HTMLFormElement);
		});

		expect(screen.getByText("Incorrect password. Try again.")).toBeInTheDocument();
	});
});
