/**
 * One "device" in the two-process ECDH proof (see prove-handshake.ts). Run standalone as:
 *   tsx handshake-party.ts <role> <sessionSalt>
 * It generates its own ephemeral keypair, prints its public key to stdout (line 1) as the
 * only thing it ever shares, reads the peer's public key from a single line on stdin, derives
 * the session key locally, and prints it to stdout (line 2) so the parent process — playing
 * the role of the untrusted backend relay — can compare the two without ever having seen a
 * secret key.
 */
import { createInterface } from "node:readline";
import { deriveSharedSecret, generateX25519KeyPair } from "../src/x25519.js";
import { deriveSessionKey } from "../src/hkdf.js";
import { toBase64Url, fromBase64Url } from "../src/encoding.js";

async function main(): Promise<void> {
  const [role, sessionSalt] = process.argv.slice(2);
  if (!role || !sessionSalt) {
    throw new Error("usage: handshake-party.ts <role> <sessionSalt>");
  }

  const keyPair = generateX25519KeyPair();
  process.stdout.write(`${toBase64Url(keyPair.publicKey)}\n`);

  const rl = createInterface({ input: process.stdin });
  const peerPublicKeyLine = await new Promise<string>((resolve) => {
    rl.once("line", (line) => resolve(line));
  });
  rl.close();

  const peerPublicKey = fromBase64Url(peerPublicKeyLine.trim());
  const sharedSecret = deriveSharedSecret(keyPair.secretKey, peerPublicKey);
  const sessionKey = deriveSessionKey(sharedSecret, fromBase64Url(sessionSalt));

  process.stdout.write(`${toBase64Url(sessionKey)}\n`);
  process.stderr.write(`[${role}] derived session key independently\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`fatal: ${String(error)}\n`);
  process.exit(1);
});
