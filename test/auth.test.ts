import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, unmetPasswordRules } from "../src/lib/auth";

beforeAll(() => {
  process.env.GT_STUDIO_SESSION_SECRET = "test-secret-for-vitest-only-0123456789";
});

describe("Access password", () => {
  it("accepts the right password and rejects others", () => {
    const stored = hashPassword("Correct-Horse-42!");
    expect(verifyPassword("Correct-Horse-42!", stored)).toBe(true);
    expect(verifyPassword("Correct-Horse-42", stored)).toBe(false);
    expect(verifyPassword("anything", undefined)).toBe(false);
  });

  it("requires a complex password", () => {
    expect(unmetPasswordRules("Abcdefghijk1!")).toEqual([]);
    expect(unmetPasswordRules("short1!A")).toContain("At least 12 characters");
    expect(unmetPasswordRules("alllowercase1!")).toContain("An uppercase letter");
    expect(unmetPasswordRules("NoDigitsHere!!")).toContain("A number");
    expect(unmetPasswordRules("NoSymbolsHere12")).toContain("A symbol (e.g. ! @ # $ %)");
  });
});

describe("Session token", () => {
  it("is valid until it expires", () => {
    const token = createSessionToken(1_000_000);
    expect(verifySessionToken(token, 1_000_000 + 60_000)).toBe(true);
    expect(verifySessionToken(token, 1_000_000 + 13 * 60 * 60 * 1000)).toBe(false);
  });

  it("rejects tampered or missing tokens", () => {
    const token = createSessionToken();
    const [payload] = token.split(".");
    const forged = `${payload}.bogus`;
    expect(verifySessionToken(forged)).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("not-a-token")).toBe(false);
  });
});
