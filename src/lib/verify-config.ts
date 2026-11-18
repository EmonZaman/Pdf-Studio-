// Where the statement QR code points. Defaults to /qr-statement/verification
export const VERIFY_URL = process.env.NEXT_PUBLIC_VERIFY_URL || "http://localhost:3000/qr-statement/verification";

// Official short URLs for City Bank statements (matches printed text and custom QR short links)
export const CITY_BANK_PRINTED_VERIFY_URL = "http://t.cbll.fyi/i/10/stmt";

// The QR carries the reference number and account number,
// which is what the verification page looks up.
export const VERIFY_QR_TEMPLATE = "{{verifyUrl}}?ref={{referenceNo}}&acc={{accountNo}}";
