import { db } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-auth"
import { campaignSpendUsd } from "@/lib/billing-ops"

export const dynamic = "force-dynamic"

// GET /api/public/v1/campaigns - workspace campaigns with funnel stats + cost.
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
  }
  const projects = await db.project.findMany({
    where: { userId: auth.userId },
    select: { id: true },
  })
  const campaigns = await db.campaign.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, state: true, language: true, verifyPolicy: true,
      createdAt: true, nextAction: true,
    },
  })
  const out: Array<Record<string, unknown>> = []
  for (const c of campaigns) {
    const [approved, hot, booked, warm, spend] = await Promise.all([
      db.lead.count({ where: { campaignId: c.id, status: "approved" } }),
      db.lead.count({ where: { campaignId: c.id, isHot: true } }),
      db.lead.count({ where: { campaignId: c.id, convStatus: "booked" } }),
      db.lead.count({ where: { campaignId: c.id, OR: [{ isHot: true }, { convStatus: "booked" }] } }),
      campaignSpendUsd(c.id),
    ])
    const touches = await db.message.count({ where: { campaignId: c.id, direction: "out", kind: "touch" } })
    out.push({
      id: c.id,
      name: c.name,
      state: c.state,
      language: c.language,
      verifyPolicy: c.verifyPolicy,
      createdAt: c.createdAt,
      stats: {
        approved,
        touches,
        hot,
        booked,
        warm,
        spendUsd: spend,
        cplUsd: warm > 0 ? Math.round((spend / warm) * 100) / 100 : null,
      },
    })
  }
  return Response.json({ campaigns: out }, { headers: auth.headers })
}
