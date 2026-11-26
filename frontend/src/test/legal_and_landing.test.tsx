import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import { LandingView } from "@/components/landing/LandingView";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isLoading: false,
    isAnonymous: false,
    signInAsGuest: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("Legal & Landing Pages (Task S5)", () => {
  it("renders /terms with draft notice, sub-processors, and action card disclaimer", () => {
    render(<TermsPage />);
    expect(screen.getAllByText(/Terms of Service/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Draft Document — Pending Formal Legal Review/i)).toBeDefined();
    expect(screen.getByText(/Google Gemini API:/i)).toBeDefined();
    expect(screen.getByText(/Resend:/i)).toBeDefined();
    expect(screen.getByText(/Supabase:/i)).toBeDefined();
    expect(screen.getByText(/ACTION GUIDANCE/i)).toBeDefined();
  });

  it("renders /privacy with draft notice, honest data inventory, and deletion rights", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByText(/Privacy Policy/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Draft Document — Pending Formal Legal Review/i)).toBeDefined();
    expect(screen.getByText(/Zero behavioral tracking/i)).toBeDefined();
    expect(screen.getByText(/Saved Cards & Feedback/i)).toBeDefined();
    expect(screen.getByText(/Minimal Product Telemetry/i)).toBeDefined();
    expect(screen.getByText(/Complete Data Deletion/i)).toBeDefined();
  });

  it("renders LandingView with tagline, 4-part card demo, and signup CTA", () => {
    render(<LandingView />);
    const tagline = screen.getByTestId("landing-tagline");
    expect(tagline.textContent).toContain("Your stack changed overnight.");
    expect(tagline.textContent).toContain("Becon tells you what to do about it.");
    expect(screen.getByText(/The 4-Part Action Card Structure/i)).toBeDefined();
    expect(screen.getByText(/What Happened/i)).toBeDefined();
    expect(screen.getByText(/Why It Matters/i)).toBeDefined();
    expect(screen.getByText(/How It Affects You/i)).toBeDefined();
    expect(screen.getByText(/What To Do Next/i)).toBeDefined();
    expect(screen.getByTestId("landing-hero-signup-cta")).toBeDefined();
  });
});
