import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { SaveButton } from "@/components/cards/SaveButton";
import { CardDrawer } from "@/components/CardDrawer";
import { ReportModal } from "@/components/ReportModal";
import SavedPage from "@/app/saved/page";
import * as apiModule from "@/lib/api";
import { BriefingCard } from "@/types/card";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/saved",
}));

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-uuid" } },
    isLoading: false,
    user: { id: "test-user-uuid", email: "developer@example.com" },
    isAnonymous: false,
    me: { id: 1, name: "Test Developer", role: "Backend Engineer" },
    signOut: vi.fn(),
  }),
}));

const mockCard: BriefingCard = {
  id: "card-uuid-123",
  title: "FastAPI 0.115 Released with Performance Boosts",
  source_url: "https://fastapi.tiangolo.com/release-notes/",
  target_role: "Backend Engineer",
  target_stack: ["#FastAPI", "#Python"],
  published_at: "Nov 22, 2026",
  reading_time_minutes: 2,
  is_saved: false,
  my_feedback: null,
  card_content: {
    what_happened: ["FastAPI 0.115 reduces serialization latency by 30%."],
    why_it_matters: "Direct latency improvement for JSON responses.",
    how_it_affects_you: "Upgrade packages in requirements.txt.",
    what_to_do_next: {
      action_type: "apply",
      guidance: "Run poetry update fastapi.",
    },
  },
};

describe("SaveButton Component (F6)", () => {
  let apiFetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchSpy = vi.spyOn(apiModule, "apiFetch").mockResolvedValue({ saved: true });
  });

  it("toggles save state optimistically on click", async () => {
    const onToggle = vi.fn();
    render(<SaveButton cardId="card-uuid-123" initialSaved={false} onToggle={onToggle} />);

    const btn = screen.getByTestId("card-save-button");
    expect(btn).toHaveAttribute("aria-label", "Save card");

    // Click to save
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-label", "Remove from saved cards");
    expect(onToggle).toHaveBeenCalledWith(true);

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith("/api/cards/card-uuid-123/save", {
        method: "POST",
      });
    });
  });

  it("rolls back save state when API request fails", async () => {
    apiFetchSpy = vi.spyOn(apiModule, "apiFetch").mockRejectedValue(new Error("Network error"));
    const onToggle = vi.fn();
    render(<SaveButton cardId="card-uuid-123" initialSaved={false} onToggle={onToggle} />);

    const btn = screen.getByTestId("card-save-button");
    fireEvent.click(btn);

    // After failure, rolls back to false
    await waitFor(() => {
      expect(onToggle).toHaveBeenCalledWith(false);
      expect(btn).toHaveAttribute("aria-label", "Save card");
    });
  });
});

describe("CardDrawer Actions & Report Modal (F6)", () => {
  let apiFetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchSpy = vi.spyOn(apiModule, "apiFetch").mockResolvedValue({ success: true });
  });

  it("toggles save in drawer optimistically", async () => {
    render(<CardDrawer card={mockCard} isOpen={true} onClose={vi.fn()} />);

    const saveBtn = screen.getByTestId("drawer-save-button");
    expect(saveBtn).toHaveTextContent("Save");

    fireEvent.click(saveBtn);
    expect(saveBtn).toHaveTextContent("Saved");

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith("/api/cards/card-uuid-123/save", {
        method: "POST",
      });
    });
  });

  it("toggles useful and not_useful feedback optimistically", async () => {
    render(<CardDrawer card={mockCard} isOpen={true} onClose={vi.fn()} />);

    const usefulBtn = screen.getByTestId("drawer-useful-button");
    const notUsefulBtn = screen.getByTestId("drawer-not-useful-button");

    // Click useful
    fireEvent.click(usefulBtn);
    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        "/api/cards/card-uuid-123/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ value: "useful" }),
        })
      );
    });

    // Click not useful
    fireEvent.click(notUsefulBtn);
    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        "/api/cards/card-uuid-123/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ value: "not_useful" }),
        })
      );
    });
  });

  it("opens report modal from drawer and submits report", async () => {
    render(<CardDrawer card={mockCard} isOpen={true} onClose={vi.fn()} />);

    const reportBtn = screen.getByTestId("drawer-report-button");
    fireEvent.click(reportBtn);

    // Report modal should now be open
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /report factual error/i })).toBeInTheDocument();
    });

    // Enter details in textarea
    const noteInput = screen.getByPlaceholderText(/describe the discrepancy/i);
    fireEvent.change(noteInput, { target: { value: "Version was actually 0.116" } });

    // Submit report
    const submitBtn = screen.getByTestId("submit-report-button");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        "/api/cards/card-uuid-123/report",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Version was actually 0.116"),
        })
      );
      expect(screen.getByText("Report Received")).toBeInTheDocument();
    });
  });
});

describe("/saved Page (F6)", () => {
  let apiFetchSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchSpy = vi.spyOn(apiModule, "apiFetch").mockImplementation((async (url: string) => {
      if (url.startsWith("/api/saved")) {
        return {
          items: [mockCard],
          total: 1,
          page: 1,
          limit: 10,
          has_more: false,
        };
      }
      if (url.includes("/save")) {
        return { saved: false };
      }
      return {};
    }) as any);
  });

  it("renders saved cards list and handles unsave optimistically", async () => {
    render(<SavedPage />);

    // Wait for saved cards to load
    await waitFor(() => {
      expect(screen.getByTestId("saved-cards-list")).toBeInTheDocument();
      expect(screen.getByText("FastAPI 0.115 Released with Performance Boosts")).toBeInTheDocument();
    });

    // Click unsave button
    const unsaveBtn = screen.getByTestId("unsave-card-button");
    fireEvent.click(unsaveBtn);

    // Card removed optimistically
    await waitFor(() => {
      expect(screen.getByTestId("empty-saved-cards")).toBeInTheDocument();
      expect(apiFetchSpy).toHaveBeenCalledWith("/api/cards/card-uuid-123/save", {
        method: "DELETE",
      });
    });
  });
});
