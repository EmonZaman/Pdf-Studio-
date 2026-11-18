import { describe, expect, it } from "vitest";
import {
  generateCityBankAccountNo,
  generateCityBankReferenceNo,
  isValidAccountNo,
  isValidReferenceNo,
} from "../src/lib/statement-identity";
import { findVerifiedStatement } from "../src/lib/verification";

describe("Statement Identity & Reference Pattern Validation", () => {
  it("generates a 13-char reference code starting with 0 matching City Bank pattern", () => {
    for (let i = 0; i < 20; i++) {
      const ref = generateCityBankReferenceNo();
      expect(ref).toHaveLength(13);
      expect(ref.startsWith("0")).toBe(true);
      expect(isValidReferenceNo(ref)).toBe(true);
      expect(/^0[A-Z0-9]{12}$/.test(ref)).toBe(true);
    }
  });

  it("validates official City Bank reference codes from statements", () => {
    expect(isValidReferenceNo("0RYYNJ4VANVZQ")).toBe(true);
    expect(isValidReferenceNo("0S18HDHYANSPV")).toBe(true);
    // Invalid checks
    expect(isValidReferenceNo("1RYYNJ4VANVZQ")).toBe(false); // Doesn't start with 0
    expect(isValidReferenceNo("0RYYNJ4VANVZ")).toBe(false); // Only 12 chars
    expect(isValidReferenceNo("0RYYNJ4VANVZQ1")).toBe(false); // 14 chars
    expect(isValidReferenceNo("0ryynj4vanvzq")).toBe(true); // Case-insensitive normalized
  });

  it("generates a 13-digit account number matching City Bank pattern", () => {
    for (let i = 0; i < 20; i++) {
      const acc = generateCityBankAccountNo();
      expect(acc).toHaveLength(13);
      expect(/^\d{13}$/.test(acc)).toBe(true);
      expect(isValidAccountNo(acc)).toBe(true);
    }
  });

  it("validates official City Bank account numbers from statements", () => {
    expect(isValidAccountNo("1781920006484")).toBe(true);
    expect(isValidAccountNo("2304435091001")).toBe(true);
    // Invalid checks
    expect(isValidAccountNo("178192000648")).toBe(false); // 12 digits
    expect(isValidAccountNo("17819200064845")).toBe(false); // 14 digits
    expect(isValidAccountNo("178192000648A")).toBe(false); // Contains letter
  });

  it("finds and validates matching statements by reference number and account number", async () => {
    const verified = await findVerifiedStatement("0RYYNJ4VANVZQ", "1781920006484");
    expect(verified).not.toBeNull();
    expect(verified?.accountName).toBe("MD. OMAR FARUQ CHOWDHURY");
    expect(verified?.accountNo).toBe("1781920006484");

    const verified2 = await findVerifiedStatement("0S18HDHYANSPV", "2304435091001");
    expect(verified2).not.toBeNull();
    expect(verified2?.accountName).toBe("MD. MONIRUZZAMAN EMON");
    expect(verified2?.accountNo).toBe("2304435091001");
  });

  it("rejects non-matching account and reference numbers", async () => {
    // Correct ref but wrong account
    const mismatch = await findVerifiedStatement("0RYYNJ4VANVZQ", "9999999999999");
    expect(mismatch).toBeNull();

    // Correct account but wrong ref
    const mismatch2 = await findVerifiedStatement("0INVALIDREF12", "1781920006484");
    expect(mismatch2).toBeNull();
  });

  it("exports official City Bank verification paths and short URLs", async () => {
    const { VERIFY_URL, CITY_BANK_PRINTED_VERIFY_URL } = await import("../src/lib/verify-config");
    expect(CITY_BANK_PRINTED_VERIFY_URL).toBe("http://t.cbll.fyi/i/10/stmt");
    expect(VERIFY_URL).toContain("/qr-statement/verification");
  });
});
