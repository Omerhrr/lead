import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { providerStatus } from "@/lib/email-provider"

export const dynamic = "force-dynamic"

// Email delivery configuration + lifetime delivery counts for the user's campaigns.
export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const campaigns = await db.campaign.findMany({
    where: { project: { userId: user.id } },
    select: { id: true },
  })
  const ids = campaigns.map((c) => c.id)
  const grouped = ids.length
    ? await db.message.groupBy({
        by: ["deliveryStatus"],
        where: { campaignId: { in: ids }, kind: "touch", channel: "email" },
        _count: { _all: true },
      })
    : []
  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.deliveryStatus] = g._count._all

  return Response.json({
    ...providerStatus(),
    counts: {
      simulated: counts.simulated ?? 0,
      delivered: counts.delivered ?? 0,
      failed: counts.failed ?? 0,
    },
  })
}
