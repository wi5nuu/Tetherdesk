import { encodePairingQrPayload, type PairingQrPayload } from "@tetherdesk/protocol";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";

/**
 * Renders a pairing QR code to the terminal using ASCII/Unicode block art.
 */
export function renderQrToTerminal(payload: PairingQrPayload): void {
  const encoded = encodePairingQrPayload(payload);
  qrcodeTerminal.generate(encoded, { small: true });
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
