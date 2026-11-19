import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

// GET /api/public/v1/leads?campaignId=&status=&verify=&take=
// Workspace leads with verification + conversation state.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
  }
  const url = new URL(req.url)
  const campaignId = url.searchParams.get("campaignId") ?? ""
  const status = url.searchParams.get("status") ?? ""
  const verify = url.searchParams.get("verify") ?? ""
  const take = Math.max(1, Math.min(200, Number(url.searchParams.get("take") ?? 50)))

  const projects = await db.project.findMany({ where: { userId: auth.userId }, select: { id: true } })
  const owned = await db.campaign.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((c) => c.id))
  if (campaignId && !ownedIds.has(campaignId)) {
    return Response.json({ error: "Campaign not found" }, { status: 404, headers: auth.headers })
  }

  const leads = await db.lead.findMany({
    where: {
      ...(campaignId ? { campaignId } : { campaignId: { in: [...ownedIds] } }),
      ...(status ? { status } : {}),
      ...(verify ? { verifyStatus: verify } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, campaignId: true, name: true, title: true, company: true,
      companyDomain: true, email: true, country: true, score: true,
      status: true, source: true, verifyStatus: true, verifyReason: true,
      convStatus: true, isHot: true, sentiment: true, touchCount: true,
      meetingAt: true, successFeeCharged: true, createdAt: true,
    },
  })
  return Response.json(
    {
      leads: leads.map((l) => ({
        ...l,
        meetingAt: l.meetingAt ? l.meetingAt.toISOString() : null,
      })),
      count: leads.length,
    },
    { headers: auth.headers }
  )
}
