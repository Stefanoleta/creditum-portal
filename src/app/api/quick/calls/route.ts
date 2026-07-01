import { NextResponse } from "next/server"
import { fetchQickCalls } from "@/lib/qick/client"
import { computeSamanthaMetrics } from "@/lib/qick/metrics"

// Sem cache — dados em tempo real da Qick
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const { calls, fonte } = await fetchQickCalls()
    const metrics = computeSamanthaMetrics(calls, fonte)

    return NextResponse.json({ ...metrics, calls }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    })
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar dados da Samantha" },
      { status: 500 }
    )
  }
}
