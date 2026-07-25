# Troubleshooting Guide

## Setup fails

### "Node.js 20+ is required"

TetherDesk's installer requires Node.js 20 or later. Check your version:

```sh
node --version
```

Install or upgrade from [nodejs.org](https://nodejs.org). The LTS release is recommended.

---

### "Opening browser for Vercel auth — nothing happened"

The setup wizard uses a device-authorization flow that opens your browser automatically. If the browser doesn't open:

1. Look for a URL printed in the terminal — copy and paste it manually.
2. Complete the Vercel login in the browser.
3. Return to the terminal — it will detect the completed auth and continue automatically.

This is the only manual step in setup. Everything else is automated.

---

### "Redis provisioning failed"

The installer attempts to provision Upstash Redis via the Vercel Marketplace API. If this fails:

1. The installer will print a direct link to the Marketplace page.
2. Open the link, add Upstash to your project (one click).
3. Run `npx tetherdesk init` again — it will detect the completed Redis setup and skip to the next step.

---

### "Deploy health check timed out"

The deployment is taking longer than expected. This is usually a first-deployment cold-start issue:

1. Check your Vercel dashboard for build errors.
2. If the build succeeded but the health check is still failing, wait 60 seconds and run `npx tetherdesk init` again — idempotent resume will skip completed steps.
3. If the build is failing, check `vercel logs` for the error.

---

## Pairing fails

### QR code won't scan

- Increase the terminal font size or zoom in on the QR code.
- Ensure the terminal background is dark and the QR is rendered with sufficient contrast.
- Use the fallback pairing URL instead: the agent prints it alongside the QR code as `http://localhost:PORT/pair/TOKEN`.

### "Pairing token expired"

The QR code is only valid for 90 seconds. Generate a new one:

```sh
npx tetherdesk pair
```

---

### "Pairing token already used"

Someone else scanned the QR code, or the same code was scanned twice. This is a security feature — each QR code is single-use. Generate a new one:

```sh
npx tetherdesk pair
```

---

### "Rate limited — too many pairing attempts"

More than 5 pairing attempts were made from the same IP in 15 minutes. Wait 15 minutes, then try again. If this is unexpected, check whether anything is automatically retrying — the agent should not be generating pairing requests on its own.

---

## Connection fails after pairing

### Stuck on "Connecting..." / ICE failure

The phone and laptop cannot establish a direct peer-to-peer path. This is a NAT traversal issue.

See `docs/runbooks/nat-traversal.md` for:
- How to check your NAT type
- Whether you need a TURN relay
- How to configure one

### "Connection failed — no viable path found"

Direct connection failed and no TURN relay is configured. See `docs/runbooks/nat-traversal.md`.

---

## Session disconnects / reconnects frequently

### "Reconnecting (attempt N)..."

This is normal behavior — the signaling connection is designed to be short-lived and auto-reconnecting (the Vercel Functions underpinning it have a maximum lifetime). The reconnect should complete in under 3 seconds and be invisible to the user. If you see it repeatedly:

1. Check your internet connection stability.
2. Check `tetherdesk logs` for error details.
3. If reconnects take more than 3 seconds consistently, check whether an intermediate proxy or firewall is closing WebSocket connections early.

### Session ends after phone locks

This is expected by default — the PWA loses its network connection when the phone screen locks. When you unlock the phone:

1. The PWA will automatically reconnect within a few seconds.
2. You do not need to re-scan the QR code — sessions are valid for 24 hours by default.

---

## Permissions

### macOS: "Screen Recording permission denied"

1. Open **System Settings → Privacy & Security → Screen Recording**.
2. Enable the toggle next to **TetherDesk Agent**.
3. Restart the agent: `tetherdesk stop && tetherdesk-agent start`.

### macOS: "Accessibility permission denied" (input injection fails)

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable the toggle next to **TetherDesk Agent**.
3. Restart the agent.

### Windows: "Input injection requires administrator privileges"

The installer prompts you to run as administrator during setup to register the Windows Service. If you skipped this:

```sh
# Run in an elevated (Administrator) terminal
npx tetherdesk init
```

Input injection itself does not require elevation for normal (non-elevated) application windows. If you need to control an elevated application, the agent must also run elevated — this is a Windows UIPI security restriction.

### Linux (Wayland): "Input injection not supported"

Wayland input injection requires `xdg-remote-desktop-portal` and compositor support (GNOME 41+, KDE Plasma 5.27+). On older compositors or unsupported ones:

- Input injection is not available — this is a documented limitation, not a bug.
- Screen capture via PipeWire still works on supported compositors (GNOME 41+, KDE Plasma 5.27+).
- For full input support, an X11 session is recommended on affected systems.

---

## Removing TetherDesk

### Standard uninstall

```sh
npx tetherdesk destroy --yes
```

This removes the local agent service, revokes all pairings, and deletes the Vercel project and Redis instance. No residual cloud resources or charges remain.

### Manual cleanup if `destroy` fails

**Vercel:** Delete the project at vercel.com/dashboard.

**Redis (Upstash):** Delete the database from your Upstash dashboard or the Vercel Integrations page.

**macOS agent service:**
```sh
launchctl unload ~/Library/LaunchAgents/com.tetherdesk.agent.plist
rm ~/Library/LaunchAgents/com.tetherdesk.agent.plist
```

**Linux agent service:**
```sh
systemctl --user stop tetherdesk-agent
systemctl --user disable tetherdesk-agent
rm ~/.config/systemd/user/tetherdesk-agent.service
systemctl --user daemon-reload
```

**Windows agent service (run as administrator):**
```sh
sc stop TetherDeskAgent
sc delete TetherDeskAgent
```

**Local config files:**
```sh
rm -rf ~/.tetherdesk
```

---

## Getting help

- Review `tetherdesk logs` for the last 100 lines of agent output.
- Check the architecture documentation at `docs/architecture/overview.md` for system context.
- Open an issue on GitHub with the output of `tetherdesk status` and the relevant section of `tetherdesk logs` (redact any session IDs or tokens before sharing).
