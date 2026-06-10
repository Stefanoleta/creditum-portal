import { NextResponse, type NextRequest } from "next/server"
import { fetchRecentAnalyses, supabase } from "@/lib/supabase-server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") ?? undefined

  const analyses = await fetchRecentAnalyses(date)

  return NextResponse.json({
    analyses,
    supabase_configured: !!supabase,
    date: date ?? new Date().toISOString().split("T")[0],
  })
}
