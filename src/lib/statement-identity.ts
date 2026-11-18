/**
 * Statement Identity & Verification Reference Generator
 * Matches City Bank PLC official account number and reference code patterns:
 * - Reference Code: 13 characters, starts with '0' followed by 12 uppercase alphanumeric characters (e.g. 0RYYNJ4VANVZQ, 0S18HDHYANSPV)
 * - Account Number: 13 numeric digits, starting with 3-digit branch/product code (e.g. 1781920006484, 2304435091001)
 */

const CITY_BANK_BRANCH_PREFIXES = ["178", "230", "126", "261", "100", "214", "290", "205", "105"];
const REF_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a unique 13-character reference code matching City Bank statement pattern (starts with 0).
 */
export function generateCityBankReferenceNo(): string {
  let ref = "0";
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * REF_CHARS.length);
    ref += REF_CHARS[randomIndex];
  }
  return ref;
}

/**
 * Generates a unique 13-digit account number matching City Bank statement pattern.
 */
export function generateCityBankAccountNo(preferredPrefix?: string): string {
  const prefix =
    preferredPrefix && /^\d{3}$/.test(preferredPrefix)
      ? preferredPrefix
      : CITY_BANK_BRANCH_PREFIXES[Math.floor(Math.random() * CITY_BANK_BRANCH_PREFIXES.length)];

  let acc = prefix;
  while (acc.length < 13) {
    acc += Math.floor(Math.random() * 10).toString();
  }
  return acc;
}

/**
 * Validates City Bank reference code format (13 chars, starts with 0, alphanumeric).
 */
export function isValidReferenceNo(val: string): boolean {
  return /^0[A-Z0-9]{12}$/.test(val.trim().toUpperCase());
}

/**
 * Validates City Bank account number format (13 numeric digits).
 */
export function isValidAccountNo(val: string): boolean {
  return /^\d{13}$/.test(val.trim());
}
