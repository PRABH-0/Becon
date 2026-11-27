import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportModal } from "@/components/ReportModal";
import { CardDrawer } from "@/components/CardDrawer";
import { BriefingCard } from "@/types/card";

// Mock API and Metrics to prevent real network calls
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/metrics", () => ({
  recordMetric: vi.fn(),
}));

const mockCard: BriefingCard = {
  id: "card-a11y-1",
  title: "Accessibility Guidelines Updated: WCAG 2.2 Standardized",
  source_url: "https://www.w3.org/WAI/standards-guidelines/wcag/",
  target_role: "Frontend Engineer",
  target_stack: ["#React", "#Accessibility"],
  published_at: "Nov 27, 2026",
  reading_time_minutes: 3,
  is_saved: false,
  my_feedback: null,
  card_content: {
    what_happened: ["W3C standardized WCAG 2.2 with new focus appearance and target size criteria."],
    why_it_matters: "All enterprise software interfaces must guarantee visible focus rings and minimum contrast.",
    how_it_affects_you: "Add visible focus-visible styles and ensure all interactive dialogs implement focus trapping.",
    what_to_do_next: {
      action_type: "apply",
      guidance: "Run automated token contrast checks and focus trap tests across modal components.",
    },
  },
};

// --- Color Contrast Formula Implementation (WCAG 2.1 / 2.2 relative luminance) ---
function getLuminance(hex: string): number {
  const cleanHex = hex.replace("#", "");
  const rgb = [
    parseInt(cleanHex.substring(0, 2), 16) / 255.0,
    parseInt(cleanHex.substring(2, 4), 16) / 255.0,
    parseInt(cleanHex.substring(4, 6), 16) / 255.0,
  ];
  const linear = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function getContrastRatio(hex1: string, hex2: string): number {
  let l1 = getLuminance(hex1);
  let l2 = getLuminance(hex2);
  if (l1 < l2) {
    [l1, l2] = [l2, l1];
  }
  return (l1 + 0.05) / (l2 + 0.05);
}

// Token palette from Tailwind CSS v4 / theme tokens
const DESIGN_TOKENS = {
  // Backgrounds
  lightCanvas: "#FAF8F5",
  lightCard: "#FFFFFF",
  darkCanvas: "#070b12",
  darkCard: "#0f172a",
  darkSurface: "#020617",

  // Text tokens
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1e293b",
  slate900: "#0f172a",
  slate950: "#020617",

  // Action badge tokens
  emerald400: "#34d399",
  emerald600: "#059669",
  emerald700: "#047857",
  amber400: "#fbbf24",
  amber600: "#d97706",
  amber700: "#b45309",
  sky400: "#38bdf8",
  sky600: "#0284c7",
  sky700: "#0369a1",
  rose400: "#fb7185",
  rose600: "#e11d48",
  rose700: "#be123c",
};

describe("Task 6.6 Accessibility Pass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  describe("WCAG AA Design Token Contrast Suite", () => {
    it("verifies light canvas text tokens meet 4.5:1 body contrast", () => {
      const ratio600 = getContrastRatio(DESIGN_TOKENS.slate600, DESIGN_TOKENS.lightCanvas);
      const ratio700 = getContrastRatio(DESIGN_TOKENS.slate700, DESIGN_TOKENS.lightCanvas);
      const ratio800 = getContrastRatio(DESIGN_TOKENS.slate800, DESIGN_TOKENS.lightCanvas);
      const ratio900 = getContrastRatio(DESIGN_TOKENS.slate900, DESIGN_TOKENS.lightCanvas);
      const ratio950 = getContrastRatio(DESIGN_TOKENS.slate950, DESIGN_TOKENS.lightCanvas);

      expect(ratio600).toBeGreaterThanOrEqual(4.5); // 7.15:1
      expect(ratio700).toBeGreaterThanOrEqual(4.5); // 9.77:1
      expect(ratio800).toBeGreaterThanOrEqual(4.5); // 13.06:1
      expect(ratio900).toBeGreaterThanOrEqual(4.5); // 15.65:1
      expect(ratio950).toBeGreaterThanOrEqual(4.5); // 19.34:1

      // Verify that slate-400 and slate-500 fail AA on light canvas (confirming why we replaced them)
      const ratio400 = getContrastRatio(DESIGN_TOKENS.slate400, DESIGN_TOKENS.lightCanvas);
      const ratio500 = getContrastRatio(DESIGN_TOKENS.slate500, DESIGN_TOKENS.lightCanvas);
      expect(ratio400).toBeLessThan(4.5); // 2.42:1
      expect(ratio500).toBeLessThan(4.5); // 4.49:1
    });

    it("verifies light action badges meet 4.5:1 AA contrast", () => {
      const emeraldRatio = getContrastRatio(DESIGN_TOKENS.emerald700, DESIGN_TOKENS.lightCanvas);
      const amberRatio = getContrastRatio(DESIGN_TOKENS.amber700, DESIGN_TOKENS.lightCanvas);
      const skyRatio = getContrastRatio(DESIGN_TOKENS.sky700, DESIGN_TOKENS.lightCanvas);
      const roseRatio = getContrastRatio(DESIGN_TOKENS.rose700, DESIGN_TOKENS.lightCanvas);

      expect(emeraldRatio).toBeGreaterThanOrEqual(4.5); // 5.17:1
      expect(amberRatio).toBeGreaterThanOrEqual(4.5); // 4.74:1
      expect(skyRatio).toBeGreaterThanOrEqual(4.5); // 5.60:1
      expect(roseRatio).toBeGreaterThanOrEqual(4.5); // 5.93:1
    });

    it("verifies dark canvas/card text tokens meet 4.5:1 AA contrast", () => {
      const ratio400 = getContrastRatio(DESIGN_TOKENS.slate400, DESIGN_TOKENS.darkCard);
      const ratio300 = getContrastRatio(DESIGN_TOKENS.slate300, DESIGN_TOKENS.darkCard);

      expect(ratio400).toBeGreaterThanOrEqual(4.5); // 6.96:1
      expect(ratio300).toBeGreaterThanOrEqual(4.5); // 12.02:1

      // Verify slate-500 fails AA on dark card (confirming why we upgraded dark text to slate-400/300)
      const ratio500 = getContrastRatio(DESIGN_TOKENS.slate500, DESIGN_TOKENS.darkCard);
      expect(ratio500).toBeLessThan(4.5); // 3.75:1
    });

    it("verifies dark action badge tokens meet 4.5:1 AA contrast", () => {
      const emeraldRatio = getContrastRatio(DESIGN_TOKENS.emerald400, DESIGN_TOKENS.darkCard);
      const amberRatio = getContrastRatio(DESIGN_TOKENS.amber400, DESIGN_TOKENS.darkCard);
      const skyRatio = getContrastRatio(DESIGN_TOKENS.sky400, DESIGN_TOKENS.darkCard);
      const roseRatio = getContrastRatio(DESIGN_TOKENS.rose400, DESIGN_TOKENS.darkCard);

      expect(emeraldRatio).toBeGreaterThanOrEqual(4.5); // 9.29:1
      expect(amberRatio).toBeGreaterThanOrEqual(4.5); // 10.69:1
      expect(skyRatio).toBeGreaterThanOrEqual(4.5); // 8.33:1
      expect(roseRatio).toBeGreaterThanOrEqual(4.5); // 6.63:1
    });
  });

  describe("ReportModal Accessibility & Focus Trap", () => {
    function HostWithReportModal() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button
            data-testid="trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Open Report
          </button>
          <ReportModal
            cardId="card-a11y-1"
            cardTitle="Accessibility Guidelines Updated"
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    it("renders with aria-modal='true' and aria-labelledby", () => {
      render(
        <ReportModal
          cardId="card-a11y-1"
          cardTitle="Accessibility Guidelines Updated"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "report-modal-title");
      expect(screen.getByText("Report Factual Error")).toHaveAttribute("id", "report-modal-title");
    });

    it("locks body scroll when open and unlocks when closed", () => {
      const { rerender } = render(
        <ReportModal
          cardId="card-a11y-1"
          cardTitle="Accessibility Guidelines Updated"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(document.body.style.overflow).toBe("hidden");

      rerender(
        <ReportModal
          cardId="card-a11y-1"
          cardTitle="Accessibility Guidelines Updated"
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(document.body.style.overflow).toBe("");
    });

    it("closes on Escape key press", () => {
      const handleClose = vi.fn();
      render(
        <ReportModal
          cardId="card-a11y-1"
          cardTitle="Accessibility Guidelines Updated"
          isOpen={true}
          onClose={handleClose}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("traps focus inside the modal with Tab and Shift+Tab", async () => {
      render(
        <ReportModal
          cardId="card-a11y-1"
          cardTitle="Accessibility Guidelines Updated"
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const select = screen.getByLabelText(/reason for report/i);
      expect(select).toBeInTheDocument();
      const closeBtn = screen.getByLabelText(/close report modal/i);
      const submitBtn = screen.getByTestId("submit-report-button");

      // Focus the last element (submit button) and press Tab -> should wrap to first element (close button)
      submitBtn.focus();
      expect(document.activeElement).toBe(submitBtn);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(closeBtn);

      // Focus the first element (close button) and press Shift+Tab -> should wrap to last element (submit button)
      closeBtn.focus();
      expect(document.activeElement).toBe(closeBtn);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(submitBtn);
    });

    it("returns focus to the trigger element when closed", async () => {
      render(<HostWithReportModal />);
      const trigger = screen.getByTestId("trigger-btn");

      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(trigger);

      // Modal is now open
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Press Escape to close
      fireEvent.keyDown(window, { key: "Escape" });

      // Modal unmounts/closes; focus should return to trigger
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      });
    });
  });

  describe("CardDrawer Accessibility & Focus Trap", () => {
    function HostWithCardDrawer() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button
            data-testid="drawer-trigger-btn"
            onClick={() => setIsOpen(true)}
          >
            Open Card Details
          </button>
          <CardDrawer
            card={mockCard}
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
          />
        </div>
      );
    }

    it("renders with aria-modal='true' and aria-labelledby", () => {
      render(
        <CardDrawer
          card={mockCard}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "card-drawer-title");
      expect(screen.getByText(mockCard.title)).toHaveAttribute("id", "card-drawer-title");
    });

    it("has accessible aria-labels on icon-only and action buttons", () => {
      render(
        <CardDrawer
          card={mockCard}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByLabelText("Close details")).toBeInTheDocument();
      expect(screen.getByLabelText("Save card")).toBeInTheDocument();
      expect(screen.getByLabelText("Mark card useful")).toBeInTheDocument();
      expect(screen.getByLabelText("Mark card not useful")).toBeInTheDocument();
      expect(screen.getByLabelText("Report issue with this card")).toBeInTheDocument();
    });

    it("locks body scroll when open and unlocks when closed", () => {
      const { rerender } = render(
        <CardDrawer
          card={mockCard}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      expect(document.body.style.overflow).toBe("hidden");

      rerender(
        <CardDrawer
          card={mockCard}
          isOpen={false}
          onClose={vi.fn()}
        />
      );

      expect(document.body.style.overflow).toBe("");
    });

    it("closes on Escape key press", () => {
      const handleClose = vi.fn();
      render(
        <CardDrawer
          card={mockCard}
          isOpen={true}
          onClose={handleClose}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("traps focus inside the drawer with Tab and Shift+Tab loop", () => {
      render(
        <CardDrawer
          card={mockCard}
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const closeBtn = screen.getByLabelText("Close details");
      const readSourceLink = screen.getByRole("link", { name: /read original source/i });

      // Focus last element (readSourceLink) and press Tab -> should wrap to first element (closeBtn)
      readSourceLink.focus();
      expect(document.activeElement).toBe(readSourceLink);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: false });
      expect(document.activeElement).toBe(closeBtn);

      // Focus first element (closeBtn) and press Shift+Tab -> should wrap to last element (readSourceLink)
      closeBtn.focus();
      expect(document.activeElement).toBe(closeBtn);

      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(readSourceLink);
    });

    it("returns focus to the trigger element when drawer is closed", async () => {
      render(<HostWithCardDrawer />);
      const trigger = screen.getByTestId("drawer-trigger-btn");

      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(trigger);

      // Drawer is open
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Press Escape to close
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(document.activeElement).toBe(trigger);
      });
    });
  });
});
