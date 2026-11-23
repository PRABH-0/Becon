import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import UnsubscribePage from "@/app/unsubscribe/page";
import * as apiModule from "@/lib/api";

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("UnsubscribePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("displays error when no token is present in search parameters", async () => {
    mockSearchParams = new URLSearchParams("");
    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to Unsubscribe")).toBeInTheDocument();
      expect(
        screen.getByText("No unsubscribe token was provided in the link.")
      ).toBeInTheDocument();
    });
  });

  it("successfully unsubscribes user when valid token is provided", async () => {
    mockSearchParams = new URLSearchParams("token=valid.12345.unsubscribe.sig");
    vi.spyOn(apiModule, "apiFetch").mockResolvedValueOnce({
      status: "unsubscribed",
      email: "reader@example.com",
    });

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Unsubscribed Successfully")).toBeInTheDocument();
      expect(screen.getByText("reader@example.com")).toBeInTheDocument();
      expect(
        screen.getByText(/has been removed from the Becon Daily Email Digest/i)
      ).toBeInTheDocument();
    });

    expect(apiModule.apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/unsubscribe?token="),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("displays error message when unsubscribe API call fails", async () => {
    mockSearchParams = new URLSearchParams("token=bad.token.signature");
    vi.spyOn(apiModule, "apiFetch").mockRejectedValueOnce(
      new Error("Invalid or expired unsubscribe link.")
    );

    render(<UnsubscribePage />);

    await waitFor(() => {
      expect(screen.getByText("Unable to Unsubscribe")).toBeInTheDocument();
      expect(
        screen.getByText("Invalid or expired unsubscribe link.")
      ).toBeInTheDocument();
    });
  });
});
