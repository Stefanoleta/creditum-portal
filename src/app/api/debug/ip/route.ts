import { NextResponse } from "next/server"

// Temporary endpoint — reveals the outbound IP Vercel uses to call external APIs.
// Remove after Argus whitelist is confirmed.
export async function GET() {
  const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" })
  const { ip } = await res.json()
  return NextResponse.json({ outbound_ip: ip, region: process.env.VERCEL_REGION ?? "unknown" })
}
