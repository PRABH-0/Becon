import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RequireAuth } from "@/components/RequireAuth";
import type { Session, User } from "@supabase/supabase-js";
import type { UserMe } from "@/lib/api";

const mockReplace = vi.fn();
let mockPathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => mockPathname,
}));

let mockAuthState: {
  session: Session | null;
  isLoading: boolean;
  user: User | null;
  me: UserMe | null;
  isAnonymous: boolean;
} = {
  session: null,
  isLoading: false,
  user: null,
  me: null,
  isAnonymous: false,
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = "/";
    mockAuthState = {
      session: null,
      isLoading: false,
      user: null,
      me: null,
      isAnonymous: false,
    };
  });

  it("renders loader while isLoading without redirecting prematurely", () => {
    mockAuthState.isLoading = true;

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(screen.getByText(/Checking Credentials.../i)).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated user to /login?next=<path>", () => {
    mockPathname = "/profile";
    mockAuthState.isLoading = false;
    mockAuthState.session = null;

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(mockReplace).toHaveBeenCalledWith("/login?next=%2Fprofile");
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("redirects unauthenticated user on / to /login without next param", () => {
    mockPathname = "/";
    mockAuthState.isLoading = false;
    mockAuthState.session = null;

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(mockReplace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("renders children when user has an active session", () => {
    mockAuthState.isLoading = false;
    mockAuthState.session = { access_token: "active-token" } as unknown as Session;

    render(
      <RequireAuth>
        <div>Protected Content</div>
      </RequireAuth>
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
