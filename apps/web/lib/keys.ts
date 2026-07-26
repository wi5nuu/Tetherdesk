/** Redis key builders (Section 9.1). Namespace is overridable via `TETHERDESK_KEY_NAMESPACE`
 * so Vercel preview deployments can use a `preview:` prefix and never touch the production
 * mailbox/session namespace (Section 16.3). */
function namespace(): string {
  const ns = process.env["TETHERDESK_KEY_NAMESPACE"];
  if (ns && /^[a-zA-Z0-9_-]+$/.test(ns)) {
    return ns;
  }
  return "td";
}

export const redisKeys = {
  pairing: (token: string): string => `${namespace()}:pair:${token}`,
  pairingUsed: (token: string): string => `${namespace()}:pair:used:${token}`,
  session: (sessionId: string): string => `${namespace()}:session:${sessionId}`,
  mailbox: (sessionId: string, recipient: string): string =>
    `${namespace()}:mailbox:${sessionId}:${recipient}`,
  presence: (deviceId: string): string => `${namespace()}:presence:${deviceId}`,
  // Generic rate limit key (shared prefix, used in tests and generic lookups).
  rateLimitPair: (ip: string): string => `${namespace()}:ratelimit:pair:${ip}`,
  // Separate rate limit namespaces for start vs confirm so 5 start calls don't
  // block confirm (BUG-12: they shared the same key before this fix).
  rateLimitPairStart: (ip: string): string => `${namespace()}:ratelimit:pair:start:${ip}`,
  rateLimitPairConfirm: (ip: string): string => `${namespace()}:ratelimit:pair:confirm:${ip}`,
  revoked: (deviceId: string): string => `${namespace()}:revoked:${deviceId}`,
  // Approval request: laptop web UI polls this to know a phone is waiting
  approvalRequest: (sessionId: string): string => `${namespace()}:approval:req:${sessionId}`,
  // Approval result: agent polls this to know if the laptop approved or declined
  approvalResult: (sessionId: string): string => `${namespace()}:approval:res:${sessionId}`,
};
