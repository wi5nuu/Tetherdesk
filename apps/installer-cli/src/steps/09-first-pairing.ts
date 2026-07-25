import pc from "picocolors";
import type { InitState } from "./init.js";
import { generateX25519KeyPair, toBase64Url } from "@tetherdesk/crypto";

/**
 * Step 9: Start the first pairing session and display the QR code.
 *
 * Unlike a throwaway smoke-test, this step generates real X25519 keypairs
 * (identity + ephemeral) via @tetherdesk/crypto so the pairing token stored
 * in Redis is cryptographically bound to an actual key exchange, exactly as
 * the running agent would do (Section 10.2).
 *
 * The agent process, once started in step 7, will independently call
 * /api/pairing/start itself and render its own QR code in the terminal.
 * This step additionally starts a pairing session from the installer so the
 * user sees a working QR immediately — if the agent is already running it
 * will detect the session and display the same QR.
 */
export async function step09FirstPairing(state: InitState): Promise<void> {
  const backendOrigin = state.backendOrigin;
  if (!backendOrigin) {
    throw new Error("Backend origin not set — cannot start pairing session");
  }

  console.log(pc.bold("\n  Starting first pairing session...\n"));

  // Generate real X25519 keypairs (Section 10.2 steps 1–2)
  const laptopIdentity = generateX25519KeyPair();
  const laptopEphemeral = generateX25519KeyPair();

  const laptopPubKey = toBase64Url(laptopIdentity.publicKey);
  const laptopEphemeralPubKey = toBase64Url(laptopEphemeral.publicKey);

  // Call /api/pairing/start with real key material
  const resp = await fetch(`${backendOrigin}/api/pairing/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ laptopPubKey, laptopEphemeralPubKey }),
  });

  if (!resp.ok) {
    throw new Error(
      `Failed to start pairing session (${resp.status}). ` +
        `Check that the backend deployed successfully at ${backendOrigin}`,
    );
  }

  const result = (await resp.json()) as
    | { ok: true; data: { sessionId: string; pairingToken: string } }
    | { ok: false; error: { message: string } };

  if (!result.ok) {
    throw new Error(`Pairing start failed: ${result.error.message}`);
  }

  const { pairingToken, sessionId } = result.data;

  // Build the QR payload matching Section 10.2 step 3:
  //   { backendOrigin, pairingToken, sessionId, laptopEphemeralPubKey }
  // Base64url-encode as a URL-safe path segment for the /pair/[token] page.
  const pairingPayload = JSON.stringify({
    backendOrigin,
    pairingToken,
    sessionId,
    laptopEphemeralPubKey,
  });
  const b64 = Buffer.from(pairingPayload).toString("base64url");
  const pairingUrl = `${backendOrigin}/pair/${b64}`;

  // Render QR code in the terminal using the agent's QR renderer.
  // The agent process (started in step 7) will also render its own QR once it
  // is fully running — this gives the user something to scan right away.
  try {
    const { renderQrUrl } = await import("../../agent/src/qr/render.js" as string);
    await (renderQrUrl as (url: string) => Promise<void>)(pairingUrl);
  } catch {
    // Agent QR renderer not available in this context — print the URL instead.
    console.log(pc.cyan("\n  Pairing URL (scan with your phone or paste into a browser):"));
    console.log(pc.bold(`  ${pairingUrl}\n`));
  }

  console.log(pc.cyan("  Pairing URL (for manual entry if QR scan fails):"));
  console.log(pc.dim(`  ${pairingUrl}\n`));
  console.log(pc.yellow("  Scan the QR code above with your phone to complete pairing."));
  console.log(pc.yellow(`  The code expires in 90 seconds — run 'tetherdesk pair' to get a new one.\n`));
}
