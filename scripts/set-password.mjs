// Sets the GT-Pdf_Studio access password.
//   npm run set-password                 -> generates a strong password and prints it once
//   npm run set-password -- "My$ecret1!" -> uses the password you give (must meet the rules)
// Only a scrypt hash is written to .env.local. The plain password is never stored.

import crypto from "crypto";
import fs from "fs";
import path from "path";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const SYMBOLS = "!@#$%^&*-_=+?";

const RULES = [
  [(p) => p.length >= 12, "at least 12 characters"],
  [(p) => /[a-z]/.test(p), "a lowercase letter"],
  [(p) => /[A-Z]/.test(p), "an uppercase letter"],
  [(p) => /[0-9]/.test(p), "a number"],
  [(p) => /[^A-Za-z0-9]/.test(p), "a symbol"],
];

function generatePassword(length = 20) {
  const all = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789" + SYMBOLS;
  for (;;) {
    const chars = Array.from({ length }, () => all[crypto.randomInt(all.length)]);
    const candidate = chars.join("");
    if (RULES.every(([test]) => test(candidate))) return candidate;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const given = process.argv[2];
const password = given ?? generatePassword();
const unmet = RULES.filter(([test]) => !test(password)).map(([, label]) => label);
if (unmet.length) {
  console.error(`Password is too weak. It needs: ${unmet.join(", ")}.`);
  process.exit(1);
}

const env = readEnv();
env.GT_STUDIO_PASSWORD_HASH = hashPassword(password);
env.GT_STUDIO_SESSION_SECRET ||= crypto.randomBytes(32).toString("hex");
fs.writeFileSync(ENV_FILE, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 });

console.log(`Password saved to ${ENV_FILE} (hash only).`);
if (!given) console.log(`Generated password (shown once, store it safely): ${password}`);
