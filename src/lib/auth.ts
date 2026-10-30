import crypto from "crypto";

// Studio access is protected by one password, stored only as a scrypt hash in .env.local.
// Sessions are HMAC-signed cookies, so they cannot be forged without GT_STUDIO_SESSION_SECRET.

export const SESSION_COOKIE = "gt_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

export const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 12, label: "At least 12 characters" },
  { test: (p: string) => /[a-z]/.test(p), label: "A lowercase letter" },
  { test: (p: string) => /[A-Z]/.test(p), label: "An uppercase letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: "A symbol (e.g. ! @ # $ %)" },
];

export function unmetPasswordRules(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sign(payload: string): string {
  const secret = process.env.GT_STUDIO_SESSION_SECRET;
  if (!secret) throw new Error("GT_STUDIO_SESSION_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS, n: crypto.randomUUID() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !process.env.GT_STUDIO_SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof exp === "number" && exp > now;
  } catch {
    return false;
  }
}

export function isPasswordConfigured(): boolean {
  return Boolean(process.env.GT_STUDIO_PASSWORD_HASH && process.env.GT_STUDIO_SESSION_SECRET);
}

// Simple in-memory brake on password guessing: 5 failures per IP per 15 minutes.
const failures = new Map<string, { count: number; since: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function isLockedOut(ip: string, now = Date.now()): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (now - entry.since > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry || now - entry.since > WINDOW_MS) {
    failures.set(ip, { count: 1, since: now });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}
