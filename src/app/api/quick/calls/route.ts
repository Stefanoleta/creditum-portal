import { NextResponse } from "next/server"
import { fetchQickCalls } from "@/lib/qick/client"
import { computeSamanthaMetrics } from "@/lib/qick/metrics"

// Cache 5 minutes at the CDN / ISR layer.
// The component also re-fetches every 5 min client-side for live updates.
export const revalidate = 300

export async function GET() {
  try {
    const { calls, fonte } = await fetchQickCalls()
    const metrics = computeSamanthaMetrics(calls, fonte)

    return NextResponse.json(metrics, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    })
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar dados da Samantha" },
      { status: 500 }
    )
  }
}
