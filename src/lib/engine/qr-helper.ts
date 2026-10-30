import QRCode from "qrcode";

/**
 * Generates a PNG Data URL or Buffer for embedding in PDF / HTML
 */
export async function generateQrDataUrl(text: string, options?: { width?: number; margin?: number }): Promise<string> {
  if (!text) return "";
  try {
    return await QRCode.toDataURL(text, {
      width: options?.width || 256,
      margin: options?.margin ?? 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch (err) {
    console.error("Failed to generate QR code data URL", err);
    return "";
  }
}

/**
 * Generates raw PNG bytes buffer for pdf-lib embedding
 */
export async function generateQrBuffer(text: string): Promise<Uint8Array | null> {
  if (!text) return null;
  try {
    const dataUrl = await generateQrDataUrl(text);
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch (err) {
    console.error("Failed to generate QR buffer", err);
    return null;
  }
}
