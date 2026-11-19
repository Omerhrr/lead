import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { explorerClusters, type MarketCluster } from "@/lib/ai"

export const dynamic = "force-dynamic"
export const maxDuration = 40

// Segments Explorer - mirrors /tools/explorer: keywords → market clusters,
// neighboring niches, TAM counts, plus counts from our own B2B database.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const query = String(body?.query ?? "").trim()
  if (!query) return Response.json({ error: "query is required" }, { status: 400 })

  const clusters = await explorerClusters(query)
  const tokens = query.toLowerCase().split(/[,;\s]+/).filter((t) => t.length > 2)

  const companies = await db.dbCompany.findMany()
  const peopleCount = await db.dbPerson.count()
  const dbMatches = companies.filter((c) => {
    const hay = `${c.industry} ${c.name}`.toLowerCase()
    return tokens.some((t) => hay.includes(t))
  })
  const byIndustry = new Map<string, number>()
  for (const c of dbMatches) {
    byIndustry.set(c.industry, (byIndustry.get(c.industry) ?? 0) + 1)
  }

  return Response.json({
    query,
    clusters,
    database: {
      companiesIndexed: companies.length,
      peopleIndexed: peopleCount,
      matches: dbMatches.length,
      matchedCompanies: dbMatches.slice(0, 8).map((c) => ({
        name: c.name,
        industry: c.industry,
        size: c.size,
        country: c.country,
        city: c.city,
      })),
      industryBreakdown: Array.from(byIndustry.entries()).map(([industry, count]) => ({ industry, count })),
    },
  })
}
