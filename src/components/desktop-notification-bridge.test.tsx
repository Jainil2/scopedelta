import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));

import { DesktopNotificationBridge } from "@/components/desktop-notification-bridge";

describe("DesktopNotificationBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is inert in the normal browser product", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DesktopNotificationBridge />);

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads native preference state before polling", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { invoke: vi.fn() },
    });
    mocks.invoke.mockResolvedValue({ enabled: false, cursor: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<DesktopNotificationBridge />);

    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("remote_notification_context"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-establishes a baseline when the server rejects a stale cursor", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { invoke: vi.fn() },
    });
    mocks.invoke.mockResolvedValueOnce({ enabled: true, cursor: "stale" });
    mocks.invoke.mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        Response.json({
          data: { events: [], cursor: "fresh", hasMore: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DesktopNotificationBridge />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[0]![0])).toContain("cursor=stale");
    expect(String(fetchMock.mock.calls[1]![0])).not.toContain("cursor=");
    expect(mocks.invoke).toHaveBeenCalledWith("remote_submit_notifications", {
      cursor: "fresh",
      events: [],
    });
  });
});
