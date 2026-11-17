import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Conversations inbox — mirrors explee's autogtm inbox group
// (conversations per lead, statuses, hot leads).
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) return Response.json({ conversations: [] })

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get("filter") ?? "all"
  const leadId = searchParams.get("leadId")

  if (leadId) {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      include: { campaign: { select: { name: true } } },
    })
    if (!lead || !(await projectOwnsLead(project.id, lead.campaignId))) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }
    const messages = await db.message.findMany({
      where: { leadId },
      orderBy: { createdAt: "asc" },
    })
    return Response.json({ lead, messages })
  }

  const campaigns = await db.campaign.findMany({
    where: { projectId: project.id },
    select: { id: true },
  })
  const campaignIds = campaigns.map((c) => c.id)
  const all = await db.lead.findMany({
    where: {
      campaignId: { in: campaignIds },
      convStatus: { not: null },
    },
    include: {
      campaign: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  })

  let conversations = all
  if (filter === "hot") conversations = all.filter((l) => l.isHot)
  else if (filter === "active") conversations = all.filter((l) => l.convStatus === "active" || l.convStatus === "question")
  else if (filter === "booked") conversations = all.filter((l) => l.convStatus === "booked")
  else if (filter === "closed") conversations = all.filter((l) => ["closed", "unsubscribed"].includes(l.convStatus ?? ""))

  return Response.json({
    conversations: conversations.map((l) => ({
      id: l.id,
      name: l.name,
      title: l.title,
      company: l.company,
      isHot: l.isHot,
      convStatus: l.convStatus,
      sentiment: l.sentiment,
      meetingAt: l.meetingAt,
      campaignName: l.campaign.name,
      lastMessage: l.messages[0]
        ? {
            direction: l.messages[0].direction,
            body: l.messages[0].body.slice(0, 140),
            createdAt: l.messages[0].createdAt,
          }
        : null,
    })),
  })
}

async function projectOwnsLead(projectId: string, campaignId: string) {
  const c = await db.campaign.findUnique({ where: { id: campaignId } })
  return c?.projectId === projectId
}
