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

const DEFAULT_PASSWORD_HASHES = [
  "scrypt:7fb54b4751b86ceca3330b37a7f80691:f05dbbf0046b7e3513826412e212e222d6831840ed83ddcc6e298b81711e0721199efd136fe0bf2ba56f6991d537e417fe825454ce9d759655b340d07da0e9c7",
  "scrypt:9d112f1a28b9427c9d369ca45458e814:f2a469e54d0c97584d10bfb6baac858bd9f87c00070ad4e46f000372429c1629f01b906f45d245e4867814c09d2c0ff3f5df49ddfee8f16928839c0ee1ea28d1",
  "scrypt:66d19e4b71e55edbda4cd4c6c4f501ef:781428c2a99be2c62b12b09bd1e0744854004d2caaea45b84d4905be3636e98ab0de2d4d80014af41e095a5136b7d6ce36041c9b0dcd17aa451ba958f1c4ff20",
  "scrypt:6e15fc89278f45cdab240abe654bc60e:be176876b8787ac905679c12febf9aaff030d7ae44c563b5d5b4b34a146df74ab99261edcd0cd916deeb3e47320b23948bd0e5d97485b28b2db4d14887e48f95",
  "scrypt:582b88833e41785778dce1820b5a00bc:761e8ee1b719b90e5749133e7cf68d59d09aa0baa8b9dabbba587a10f70670593921e8563fd49453511de1fbc399f29e88202adffbbbaea1b73bcff5d1482f89",
].join(",");

// One or more comma-separated hashes in GT_STUDIO_PASSWORD_HASHES (each hash is one valid password)
function configuredHashes(): string[] {
  const list = process.env.GT_STUDIO_PASSWORD_HASHES || process.env.GT_STUDIO_PASSWORD_HASH || DEFAULT_PASSWORD_HASHES;
  return list.split(",").map((h) => h.trim()).filter(Boolean);
}

function getSessionSecret(): string {
  if (process.env.GT_STUDIO_SESSION_SECRET) {
    return process.env.GT_STUDIO_SESSION_SECRET;
  }
  const hashes = configuredHashes();
  if (hashes.length === 0) return "";
  return crypto.createHash("sha256").update(`gt-studio-session:${hashes.join(",")}`).digest("hex");
}

function sign(payload: string): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error("GT_STUDIO_SESSION_SECRET is not set");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: now + SESSION_TTL_MS, n: crypto.randomUUID() })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const secret = getSessionSecret();
  if (!token || !secret) return false;
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

export function verifyAnyPassword(password: string): boolean {
  return configuredHashes().some((hash) => verifyPassword(password, hash));
}

export function isPasswordConfigured(): boolean {
  return configuredHashes().length > 0 && Boolean(getSessionSecret());
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
