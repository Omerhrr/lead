import { db } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-auth"
import { campaignSpendUsd } from "@/lib/billing-ops"

export const dynamic = "force-dynamic"

// GET /api/public/v1/campaigns/[id] - one campaign with funnel + cost stats.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
  }
  const { id } = await params
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!campaign || campaign.project.userId !== auth.userId) {
    return Response.json({ error: "Campaign not found" }, { status: 404, headers: auth.headers })
  }
  const [approved, pool, hot, booked, replied, touches, linkedinCount, spend] = await Promise.all([
    db.lead.count({ where: { campaignId: id, status: "approved" } }),
    db.lead.count({ where: { campaignId: id, status: "pool" } }),
    db.lead.count({ where: { campaignId: id, isHot: true } }),
    db.lead.count({ where: { campaignId: id, convStatus: "booked" } }),
    db.lead.count({ where: { campaignId: id, messages: { some: { direction: "in" } } } }),
    db.message.count({ where: { campaignId: id, direction: "out", kind: "touch", channel: "email" } }),
    db.message.count({ where: { campaignId: id, direction: "out", kind: "touch", channel: "linkedin" } }),
    campaignSpendUsd(id),
  ])
  const warm = await db.lead.count({ where: { campaignId: id, OR: [{ isHot: true }, { convStatus: "booked" }] } })
  return Response.json(
    {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        state: campaign.state,
        language: campaign.language,
        verifyPolicy: campaign.verifyPolicy,
        nextAction: campaign.nextAction,
        createdAt: campaign.createdAt,
      },
      stats: {
        pool,
        approved,
        touches,
        emailTouches: touches,
        linkedinTouches: linkedinCount,
        hot,
        booked,
        replied,
        warm,
        spendUsd: spend,
        cplUsd: warm > 0 ? Math.round((spend / warm) * 100) / 100 : null,
      },
    },
    { headers: auth.headers }
  )
}
