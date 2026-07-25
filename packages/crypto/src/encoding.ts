/** base64url (RFC 4648 §5) helpers, isomorphic across Node and browsers, with no dependency
 * on Node's Buffer so this package stays usable from the PWA bundle. */
const BASE64URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** BASE64URL_CHARS has exactly 64 entries and every call site masks its index to 0..63,
 * so this indexed access is always in bounds. */
function char(sextet: number): string {
  return BASE64URL_CHARS[sextet & 0x3f]!;
}

export function toBase64Url(bytes: Uint8Array): string {
  let result = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    result += char(chunk >> 18) + char(chunk >> 12) + char(chunk >> 6) + char(chunk);
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const chunk = bytes[i]! << 16;
    result += char(chunk >> 18) + char(chunk >> 12);
  } else if (remaining === 2) {
    const chunk = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    result += char(chunk >> 18) + char(chunk >> 12) + char(chunk >> 6);
  }
  return result;
}

export function fromBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]*$/.test(encoded)) {
    throw new TypeError(`invalid base64url string: ${encoded}`);
  }
  const byteLength = Math.floor((encoded.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (const char of encoded) {
    const value = BASE64URL_CHARS.indexOf(char);
    // value is always 0-63 because the regex guard above ensures only valid chars reach here.
    // Use >>> 0 to keep bitBuffer in the unsigned 32-bit domain so left-shifts beyond bit 30
    // don't produce a negative number when coerced back to a signed 32-bit int by subsequent
    // bitwise ops (JavaScript bitwise operators operate on signed 32-bit integers).
    bitBuffer = (((bitBuffer << 6) >>> 0) | value) >>> 0;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[byteIndex++] = (bitBuffer >>> bitCount) & 0xff;
    }
  }
  return bytes;
}
