/**
 * Cloudflare tunnel URL parser.
 * Exported separately so it can be unit-tested without importing the full start module.
 */

export function parseTunnelUrl(line: string): string | null {
  // Modern key=value form: url=https://xxx.trycloudflare.com
  const urlMatch = line.match(/url=(https:\/\/[^\s]+\.trycloudflare\.com)/);
  if (urlMatch) return urlMatch[1] ?? null;
  // Legacy box form: bare URL anywhere on the line
  const boxMatch = line.match(/(https:\/\/[^\s]+\.trycloudflare\.com)/);
  if (boxMatch) return boxMatch[1] ?? null;
  return null;
}
