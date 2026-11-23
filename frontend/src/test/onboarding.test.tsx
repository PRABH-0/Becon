import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import OnboardingPage from "@/app/onboarding/page";
import * as apiModule from "@/lib/api";
import { LeadCard } from "@/components/cards/LeadCard";
import { BriefCard } from "@/components/cards/BriefCard";
import { RectangleCard } from "@/components/cards/RectangleCard";
import { SquareCard } from "@/components/cards/SquareCard";
import { CardDrawer } from "@/components/CardDrawer";
import { BriefingCard } from "@/types/card";

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-123" },
    isAnonymous: false,
    me: { id: 1, role: "Software Engineer", interests: "TypeScript" },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

const sampleProfessions = [
  {
    id: 1,
    name: "Software Engineer",
    slug: "software-engineer",
    description: "Full stack, backend, frontend, systems.",
    suggested_topics: [
      { id: 101, name: "TypeScript", slug: "typescript", kind: "language" },
      { id: 102, name: "Python", slug: "python", kind: "language" },
      { id: 103, name: "PostgreSQL", slug: "postgresql", kind: "technology" },
    ],
  },
  {
    id: 2,
    name: "DevOps & Cloud Engineer",
    slug: "devops",
    description: "CI/CD, Kubernetes, cloud platforms.",
    suggested_topics: [
      { id: 201, name: "Kubernetes", slug: "kubernetes", kind: "technology" },
      { id: 202, name: "Docker", slug: "docker", kind: "technology" },
    ],
  },
];

const sampleCardWithMatchReason: BriefingCard = {
  id: "card-456",
  title: "Kubernetes 1.32 Released with In-Place Pod Resizing",
  source_url: "https://kubernetes.io/blog/2026/k8s-1-32/",
  published_at: "Nov 20, 2026",
  target_role: "DevOps Engineer",
  target_stack: ["#Kubernetes", "#Cloud"],
  match_reason: "Matches: Kubernetes, high severity",
  reading_time_minutes: 3,
  is_lead: true,
  card_content: {
    what_happened: ["In-place pod resource resizing is now generally available."],
    why_it_matters: "Nodes no longer need to restart pods when resizing CPU or memory limits.",
    how_it_affects_you: "Reduces downtime during high-load autoscaling events.",
    what_to_do_next: {
      action_type: "apply",
      guidance: "Test resizing on staging cluster.",
    },
  },
};

describe("F5 Frontend Split & Line Count Contract", () => {
  it("verifies frontend/src/app/page.tsx is strictly under 400 lines", () => {
    const pagePath = path.resolve(__dirname, "../app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    const lines = content.split("\n").length;
    expect(lines).toBeLessThan(400);
  });
});

describe("Card Components render match_reason and reading_time_minutes", () => {
  it("renders match_reason on LeadCard", () => {
    render(<LeadCard card={sampleCardWithMatchReason} onSelect={vi.fn()} />);
    const matchEl = screen.getByTestId("card-match-reason");
    expect(matchEl).toHaveTextContent("Matches: Kubernetes, high severity");
  });

  it("renders match_reason on BriefCard", () => {
    render(<BriefCard card={sampleCardWithMatchReason} onSelect={vi.fn()} />);
    const matchEl = screen.getByTestId("card-match-reason");
    expect(matchEl).toHaveTextContent("Matches: Kubernetes, high severity");
  });

  it("renders match_reason on RectangleCard", () => {
    render(<RectangleCard card={sampleCardWithMatchReason} onSelect={vi.fn()} />);
    const matchEl = screen.getByTestId("card-match-reason");
    expect(matchEl).toHaveTextContent("Matches: Kubernetes, high severity");
  });

  it("renders match_reason on SquareCard", () => {
    render(<SquareCard card={sampleCardWithMatchReason} onSelect={vi.fn()} />);
    const matchEl = screen.getByTestId("card-match-reason");
    expect(matchEl).toHaveTextContent("Matches: Kubernetes, high severity");
  });

  it("renders drawer-match-reason on CardDrawer", () => {
    render(<CardDrawer card={sampleCardWithMatchReason} isOpen={true} onClose={vi.fn()} />);
    const drawerMatch = screen.getByTestId("drawer-match-reason");
    expect(drawerMatch).toHaveTextContent("Matches: Kubernetes, high severity");
  });
});

describe("DB-Driven Onboarding Wizard (F5)", () => {
  let apiFetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchSpy = vi.spyOn(apiModule, "apiFetch").mockImplementation(async (url: string) => {
      if (url === "/api/professions") {
        return sampleProfessions as any;
      }
      if (url.startsWith("/api/topics/search")) {
        return { matches: ["Rust", "Redis"] } as any;
      }
      if (url === "/api/profile") {
        return { success: true } as any;
      }
      return {} as any;
    });
  });

  it("loads professions from /api/professions and executes 4-step wizard", async () => {
    render(<OnboardingPage />);

    // Step 1: Wait for professions to load and show up
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step-1")).toBeInTheDocument();
      expect(screen.getByText("Software Engineer")).toBeInTheDocument();
      expect(screen.getByText("DevOps & Cloud Engineer")).toBeInTheDocument();
    });

    // Select "DevOps & Cloud Engineer"
    fireEvent.click(screen.getByText("DevOps & Cloud Engineer"));

    // Advance to Step 2
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    // Step 2: Focus Topics
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step-2")).toBeInTheDocument();
      expect(screen.getByText("Kubernetes")).toBeInTheDocument();
      expect(screen.getByText("Docker")).toBeInTheDocument();
    });

    // Toggle Kubernetes chip
    const k8sChip = screen.getByTestId("topic-chip-Kubernetes");
    fireEvent.click(k8sChip);

    // Enter optional version for Kubernetes
    const k8sVersionInput = screen.getByTestId("topic-version-input-Kubernetes");
    fireEvent.change(k8sVersionInput, { target: { value: "1.32" } });

    // Advance to Step 3
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    // Step 3: Schedule
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step-3")).toBeInTheDocument();
    });

    // Set delivery time
    const timeInput = screen.getByDisplayValue("08:00");
    fireEvent.change(timeInput, { target: { value: "09:30" } });

    // Advance to Step 4
    fireEvent.click(screen.getByTestId("onboarding-next-button"));

    // Step 4: Review
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-step-4")).toBeInTheDocument();
      expect(screen.getByText("DevOps & Cloud Engineer")).toBeInTheDocument();
      expect(screen.getByText("09:30")).toBeInTheDocument();
    });

    // Save Profile
    fireEvent.click(screen.getByTestId("onboarding-save-button"));

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        "/api/profile",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"profession_id":2'),
        })
      );
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
