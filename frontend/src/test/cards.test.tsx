import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BriefingCard } from "@/types/card";
import { ActionBadge, getActionBadgeColor } from "@/components/cards/ActionBadge";
import { ActionCardBody } from "@/components/cards/ActionCardBody";
import { LeadCard } from "@/components/cards/LeadCard";
import { RectangleCard } from "@/components/cards/RectangleCard";
import { SquareCard } from "@/components/cards/SquareCard";
import { BriefCard } from "@/components/cards/BriefCard";
import { CardDrawer } from "@/components/CardDrawer";

const mockCard: BriefingCard = {
  id: "card-123",
  title: "PostgreSQL 17 Released with Logical Replication Failover",
  source_url: "https://www.postgresql.org/about/news/postgresql-17-released-2722/",
  published_at: "Oct 24, 2026",
  target_role: "Staff Backend Engineer",
  target_stack: ["#PostgreSQL", "#Database"],
  card_content: {
    what_happened: [
      "Logical replication now supports failover control slots.",
      "Memory consumption for vacuuming reduced by up to 5x.",
    ],
    why_it_matters:
      "High availability clusters can now failover without desynchronizing subscriber downstream workers.",
    how_it_affects_you:
      "Upgrading to PG17 eliminates custom sync daemon workarounds in our replication topology.",
    what_to_do_next: {
      action_type: "apply",
      guidance: "Evaluate replication failover slot config in staging test cluster.",
    },
  },
  deep_detail: {
    full_description:
      "PostgreSQL 17 features significant query execution performance improvements and replication safeguards.",
    code_snippet: {
      language: "sql",
      code: "ALTER SUBSCRIPTION sub_prod REFRESH PUBLICATION WITH (failover = true);",
    },
    has_visual_diagram: true,
    diagram_title: "Failover Architecture Topology",
  },
};

describe("ActionBadge & Colors", () => {
  it("renders correct badge text and uppercase transformation", () => {
    render(<ActionBadge actionType="apply" />);
    expect(screen.getByText("APPLY")).toBeInTheDocument();
  });

  it("returns appropriate color tokens for all action types", () => {
    expect(getActionBadgeColor("apply")).toContain("emerald");
    expect(getActionBadgeColor("learn")).toContain("sky");
    expect(getActionBadgeColor("avoid")).toContain("rose");
    expect(getActionBadgeColor("prepare")).toContain("amber");
  });
});

describe("ActionCardBody", () => {
  it("renders all 4 parts in wide variant", () => {
    render(<ActionCardBody content={mockCard.card_content} variant="wide" />);

    expect(screen.getByText("WHAT HAPPENED:")).toBeInTheDocument();
    expect(screen.getByText(/Logical replication now supports/)).toBeInTheDocument();
    expect(screen.getByText(/Memory consumption for vacuuming/)).toBeInTheDocument();

    expect(screen.getByText("WHY IT MATTERS:")).toBeInTheDocument();
    expect(screen.getByText(/High availability clusters/)).toBeInTheDocument();

    expect(screen.getByText("HOW IT AFFECTS YOU:")).toBeInTheDocument();
    expect(screen.getByText(/Upgrading to PG17 eliminates/)).toBeInTheDocument();

    expect(screen.getByText("WHAT TO DO NEXT:")).toBeInTheDocument();
    expect(screen.getByText("APPLY")).toBeInTheDocument();
    expect(screen.getByText(/Evaluate replication failover slot/)).toBeInTheDocument();
  });

  it("renders compact 1-bullet + why it matters + how it affects you + action badge in compact variant (Task 6.1b)", () => {
    render(<ActionCardBody content={mockCard.card_content} variant="compact" />);

    expect(screen.getByText(/Logical replication now supports/)).toBeInTheDocument();
    expect(screen.queryByText(/Memory consumption for vacuuming/)).not.toBeInTheDocument();
    expect(screen.getByText("WHY IT MATTERS:")).toBeInTheDocument();
    expect(screen.getByText(/High availability clusters/)).toBeInTheDocument();
    expect(screen.getByText("HOW IT AFFECTS YOU:")).toBeInTheDocument();
    expect(screen.getByText(/Upgrading to PG17 eliminates/)).toBeInTheDocument();
    expect(screen.getByText("APPLY")).toBeInTheDocument();
    expect(screen.getByText(/Evaluate replication failover slot/)).toBeInTheDocument();
  });

  it("gracefully omits missing fields without blank headers", () => {
    const minimalContent = {
      what_happened: ["Single bullet"],
      why_it_matters: "",
      how_it_affects_you: "",
      what_to_do_next: {
        action_type: "learn" as const,
        guidance: "",
      },
    };
    render(<ActionCardBody content={minimalContent} variant="wide" />);

    expect(screen.getByText("WHAT HAPPENED:")).toBeInTheDocument();
    expect(screen.getByText("Single bullet")).toBeInTheDocument();
    expect(screen.queryByText("WHY IT MATTERS:")).not.toBeInTheDocument();
    expect(screen.queryByText("HOW IT AFFECTS YOU:")).not.toBeInTheDocument();
    expect(screen.queryByText("WHAT TO DO NEXT:")).not.toBeInTheDocument();
  });
});

describe("Card Components (LeadCard, RectangleCard, SquareCard, BriefCard)", () => {
  it("LeadCard renders title button, role, and triggers onOpenDrawer", () => {
    const onOpen = vi.fn();
    render(<LeadCard card={mockCard} onOpenDrawer={onOpen} />);

    expect(screen.getByTestId("lead-card")).toBeInTheDocument();
    expect(screen.getByText("Staff Backend Engineer")).toBeInTheDocument();

    const titleBtn = screen.getByRole("button", { name: mockCard.title });
    fireEvent.click(titleBtn);
    expect(onOpen).toHaveBeenCalledWith(mockCard);
  });

  it("RectangleCard renders title, details button, and opens drawer", () => {
    const onOpen = vi.fn();
    render(<RectangleCard card={mockCard} onOpenDrawer={onOpen} />);

    expect(screen.getByTestId("rectangle-card")).toBeInTheDocument();
    const detailsBtn = screen.getByRole("button", { name: /Details/i });
    fireEvent.click(detailsBtn);
    expect(onOpen).toHaveBeenCalledWith(mockCard);
  });

  it("SquareCard renders compact body, Details button, Read source link, and triggers drawer", () => {
    const onOpen = vi.fn();
    render(<SquareCard card={mockCard} onOpenDrawer={onOpen} />);

    expect(screen.getByTestId("square-card")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Read source")).toBeInTheDocument();
    const titleBtn = screen.getByRole("button", { name: mockCard.title });
    fireEvent.click(titleBtn);
    expect(onOpen).toHaveBeenCalledWith(mockCard);
  });

  it("BriefCard renders rank badge, compact body, and unified 'Read source' label (not 'Resource')", () => {
    const onOpen = vi.fn();
    render(<BriefCard card={mockCard} rankNumber={2} onOpenDrawer={onOpen} />);

    expect(screen.getByTestId("brief-card")).toBeInTheDocument();
    expect(screen.getByText("#02")).toBeInTheDocument();
    expect(screen.getByText("Read source")).toBeInTheDocument();
    expect(screen.queryByText("Resource")).not.toBeInTheDocument();
    const titleBtn = screen.getByRole("button", { name: mockCard.title });
    fireEvent.click(titleBtn);
    expect(onOpen).toHaveBeenCalledWith(mockCard);
  });
});

describe("CardDrawer", () => {
  it("renders accessible modal with role=dialog, aria-modal, and all 4 parts in full", () => {
    const onClose = vi.fn();
    render(<CardDrawer card={mockCard} isOpen={true} onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "card-drawer-title");

    // Title & Domain
    expect(screen.getByText(mockCard.title)).toBeInTheDocument();
    expect(screen.getAllByText("postgresql.org").length).toBeGreaterThan(0);

    // All 4 parts in full
    expect(screen.getByText(/Logical replication now supports failover/)).toBeInTheDocument();
    expect(screen.getByText(/High availability clusters can now failover/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrading to PG17 eliminates custom sync/)).toBeInTheDocument();
    expect(screen.getByText(/Evaluate replication failover slot config/)).toBeInTheDocument();

    // Deep detail (code snippet + diagram)
    expect(screen.getByText(/ALTER SUBSCRIPTION sub_prod/)).toBeInTheDocument();
    expect(screen.getByText("Failover Architecture Topology")).toBeInTheDocument();

    // Big external link button
    const sourceLink = screen.getByRole("link", { name: /Read original source/i });
    expect(sourceLink).toHaveAttribute("href", mockCard.source_url);
    expect(sourceLink).toHaveAttribute("target", "_blank");
    expect(sourceLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("closes when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(<CardDrawer card={mockCard} isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<CardDrawer card={mockCard} isOpen={true} onClose={onClose} />);

    const backdrop = screen.getByTestId("card-drawer-backdrop");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render when isOpen is false", () => {
    render(<CardDrawer card={mockCard} isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
