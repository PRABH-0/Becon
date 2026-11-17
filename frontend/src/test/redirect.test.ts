import { describe, it, expect } from "vitest";
import { getSafeRedirectUrl } from "@/lib/redirect";

describe("getSafeRedirectUrl", () => {
  it("returns valid relative paths as-is", () => {
    expect(getSafeRedirectUrl("/profile")).toBe("/profile");
    expect(getSafeRedirectUrl("/onboarding")).toBe("/onboarding");
    expect(getSafeRedirectUrl("/profile?setup=true")).toBe("/profile?setup=true");
    expect(getSafeRedirectUrl("/feed/article-123#summary")).toBe("/feed/article-123#summary");
  });

  it("rejects protocol-relative URLs and returns fallback", () => {
    expect(getSafeRedirectUrl("//evil.com")).toBe("/");
    expect(getSafeRedirectUrl("//evil.com/phish")).toBe("/");
    expect(getSafeRedirectUrl("///evil.com")).toBe("/");
  });

  it("rejects absolute URLs and schemes, returning fallback", () => {
    expect(getSafeRedirectUrl("https://evil.com")).toBe("/");
    expect(getSafeRedirectUrl("http://evil.com/steal")).toBe("/");
    expect(getSafeRedirectUrl("javascript:alert(1)")).toBe("/");
    expect(getSafeRedirectUrl("/javascript:alert(1)")).toBe("/");
    expect(getSafeRedirectUrl("/https://evil.com")).toBe("/");
  });

  it("rejects backslash evasion attempts", () => {
    expect(getSafeRedirectUrl("/\\evil.com")).toBe("/");
    expect(getSafeRedirectUrl("\\evil.com")).toBe("/");
    expect(getSafeRedirectUrl("/path\\evil.com")).toBe("/");
  });

  it("returns fallback for null, undefined, empty, or whitespace strings", () => {
    expect(getSafeRedirectUrl(null)).toBe("/");
    expect(getSafeRedirectUrl(undefined)).toBe("/");
    expect(getSafeRedirectUrl("")).toBe("/");
    expect(getSafeRedirectUrl("   ")).toBe("/");
    expect(getSafeRedirectUrl(null, "/custom-fallback")).toBe("/custom-fallback");
  });
});
