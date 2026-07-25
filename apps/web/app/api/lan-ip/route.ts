import { NextResponse } from "next/server";
import { networkInterfaces } from "os";

export const runtime = "nodejs";

function getWifiIp(): string | null {
  const nets = networkInterfaces();

  // Known virtual/internal adapter name fragments to skip
  const virtualPatterns = [
    /virtualbox/i, /vmware/i, /vethernet/i, /hyper-v/i,
    /loopback/i, /docker/i, /vbox/i, /wsl/i,
  ];

  function isVirtual(name: string): boolean {
    return virtualPatterns.some(p => p.test(name));
  }

  // Pass 1: prefer interfaces named Wi-Fi / wlan* with a 192.168.x.x address
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    if (!/wi-?fi|wlan/i.test(name)) continue;
    const ifaces = nets[name];
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.internal || iface.family !== "IPv4") continue;
      if (iface.address.startsWith("192.168.")) return iface.address;
    }
  }

  // Pass 2: any non-virtual interface with a 192.168.x.x address
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    const ifaces = nets[name];
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.internal || iface.family !== "IPv4") continue;
      if (iface.address.startsWith("192.168.")) return iface.address;
    }
  }

  // Pass 3: any non-virtual, non-loopback IPv4
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    const ifaces = nets[name];
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === "IPv4") return iface.address;
    }
  }

  return null;
}

export async function GET() {
  const lanIp = getWifiIp();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  if (!lanIp) {
    return NextResponse.json({ ok: false, error: { code: "NO_LAN_IP", message: "Could not detect LAN IP" } });
  }

  return NextResponse.json({ ok: true, data: { lanIp, port } });
}
