import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthForm } from "@/components/AuthForm";

const mockPush = vi.fn();
const mockSearchParamsGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

const mockSignInWithPassword = vi.fn();
const mockSignUpWithPassword = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockSignInAsGuest = vi.fn();
const mockUpgradeGuestWithEmail = vi.fn();

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    session: null,
    user: null,
    isAnonymous: false,
    signInWithPassword: mockSignInWithPassword,
    signUpWithPassword: mockSignUpWithPassword,
    signInWithGoogle: mockSignInWithGoogle,
    signInAsGuest: mockSignInAsGuest,
    upgradeGuestWithEmail: mockUpgradeGuestWithEmail,
  }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
  });

  it("renders login mode: email, password, Sign In button, Google button, Guest button, link to /register", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sign In$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue as Guest/i })).toBeInTheDocument();
    expect(screen.getByText(/Sign up/i)).toBeInTheDocument();
  });

  it("renders signup mode: shows Create Account button and link to /login", () => {
    render(<AuthForm mode="signup" />);

    expect(screen.getByRole("button", { name: /^Create Account$/i })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue as Guest/i })).toBeInTheDocument();
  });

  it("renders upgrade mode: hides Google and guest buttons, shows Upgrade button and history disclaimer", () => {
    render(<AuthForm mode="upgrade" />);

    expect(screen.getByRole("button", { name: /^Save Account$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue as Guest/i })).toBeNull();
    expect(
      screen.getByText(/Add your email and password to preserve your reading history and preferences/i)
    ).toBeInTheDocument();
  });

  it("validates form fields: rejects empty email, invalid email, and password under 8 chars", async () => {
    render(<AuthForm mode="login" />);

    const submitBtn = screen.getByRole("button", { name: /^Sign In$/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Email address is required\./i)).toBeInTheDocument();
    expect(await screen.findByText(/Password is required\./i)).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);

    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.change(passwordInput, { target: { value: "short" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Please enter a valid email address\./i)).toBeInTheDocument();
    expect(await screen.findByText(/Password must be at least 8 characters\./i)).toBeInTheDocument();
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("shows neutral confirmation message on successful signup", async () => {
    mockSignUpWithPassword.mockResolvedValue({
      data: { user: { id: "123", email: "newuser@becon.dev" } },
      error: null,
    });

    render(<AuthForm mode="signup" />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitBtn = screen.getByRole("button", { name: /^Create Account$/i });

    fireEvent.change(emailInput, { target: { value: "newuser@becon.dev" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/newuser@becon.dev/i)).toBeInTheDocument();
    expect(screen.getByText(/Resend available in/i)).toBeInTheDocument();
  });

  it("maps error codes to user-friendly messages", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    render(<AuthForm mode="login" />);

    const emailInput = screen.getByLabelText(/Email address/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitBtn = screen.getByRole("button", { name: /^Sign In$/i });

    fireEvent.change(emailInput, { target: { value: "user@becon.dev" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Invalid email or password\. Please verify your credentials\./i)).toBeInTheDocument();
  });

  it("calls signInAsGuest when clicking guest exploration button", async () => {
    mockSignInAsGuest.mockResolvedValue({});

    render(<AuthForm mode="login" />);

    const guestBtn = screen.getByRole("button", { name: /Continue as Guest/i });
    fireEvent.click(guestBtn);

    await waitFor(() => {
      expect(mockSignInAsGuest).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });
});
