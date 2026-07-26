import { encodePairingQrPayload, type PairingQrPayload } from "@tetherdesk/protocol";
import QRCode from "qrcode";

/**
 * Renders a pairing QR code to the terminal using ASCII block art.
 * Uses qrcode library to generate terminal-compatible output.
 */
export async function renderQrToTerminal(payload: PairingQrPayload): Promise<void> {
  const encoded = encodePairingQrPayload(payload);
  const qr = await QRCode.toString(encoded, { type: "terminal", small: true });
  console.log(qr);
}

/**
 * Generates a QR code as a data URL for embedding in a web page.
 */
export async function generateQrDataUrl(payload: PairingQrPayload): Promise<string> {
  const encoded = encodePairingQrPayload(payload);
  return QRCode.toDataURL(encoded, {
    errorCorrectionLevel: "M",
    width: 400,
    margin: 2,
  });
}

/**
 * Generates a QR code as an SVG string.
 */
export async function generateQrSvg(payload: PairingQrPayload): Promise<string> {
  const encoded = encodePairingQrPayload(payload);
  return QRCode.toString(encoded, {
    type: "svg",
    errorCorrectionLevel: "M",
    width: 400,
    margin: 2,
  });
}
