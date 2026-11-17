import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { campaignAction, generateLeadPool } from "@/lib/engine"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const campaign = await db.campaign.findUnique({ where: { id }, include: { project: true } })
  if (!campaign || campaign.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "")
  const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds : []
  const approveAll = !!body?.all

  switch (action) {
    case "approve_leads": {
      const poolLeads = await db.lead.findMany({
        where: { campaignId: id, status: "pool" },
        select: { id: true },
      })
      const targets = approveAll
        ? poolLeads.map((l) => l.id)
        : leadIds.filter((lid) => poolLeads.some((p) => p.id === lid))
      if (targets.length === 0) {
        return Response.json({ error: "No pool leads selected" }, { status: 400 })
      }
      await db.lead.updateMany({
        where: { id: { in: targets }, campaignId: id, status: "pool" },
        data: { status: "approved" },
      })
      const remaining = await db.lead.count({ where: { campaignId: id, status: "pool" } })
      if (remaining === 0) {
        await db.campaign.update({
          where: { id },
          data: { state: "approved", nextAction: "Leads approved — press Start to begin outreach" },
        })
      } else {
        await db.campaign.update({
          where: { id },
          data: { nextAction: `${remaining} leads still in the pool — approve more or proceed` },
        })
      }
      return Response.json({ ok: true, approved: targets.length, remaining })
    }
    case "reject_leads": {
      const targets = approveAll
        ? (await db.lead.findMany({ where: { campaignId: id, status: "pool" }, select: { id: true } })).map((l) => l.id)
        : leadIds
      await db.lead.updateMany({
        where: { id: { in: targets }, campaignId: id, status: "pool" },
        data: { status: "rejected" },
      })
      return Response.json({ ok: true })
    }
    case "regenerate_pool": {
      const count = await generateLeadPool(id)
      return Response.json({ ok: true, poolSize: count })
    }
    case "approve":
    case "start":
    case "stop":
    case "resume":
    case "archive":
    case "unarchive": {
      const result = await campaignAction(id, action)
      if (!result.ok && "error" in result) {
        return Response.json({ error: result.error }, { status: 400 })
      }
      return Response.json({ ok: true })
    }
    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
