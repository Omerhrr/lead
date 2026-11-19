import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { campaignAction, generateLeadPool } from "@/lib/engine"
import { logAudit } from "@/lib/audit"

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
        orderBy: { score: "desc" },
        select: { id: true, score: true },
      })
      const targets = approveAll
        ? poolLeads.map((l) => l.id)
        : leadIds.filter((lid) => poolLeads.some((p) => p.id === lid))
      if (targets.length === 0) {
        return Response.json({ error: "No pool leads selected" }, { status: 400 })
      }

      // balanced A/B assignment (highest-scored lead first) when a split test is on
      const variantMap = new Map<string, string>()
      if (campaign.variantTest) {
        const variants = await db.copyVariant.findMany({
          where: { campaignId: id },
          orderBy: { label: "asc" },
        })
        if (variants.length >= 2) {
          const grouped = await db.lead.groupBy({
            by: ["variantId"],
            where: { campaignId: id, variantId: { not: null } },
            _count: { _all: true },
          })
          const counts = new Map<string, number>()
          for (const g of grouped) if (g.variantId) counts.set(g.variantId, g._count._all)
          const targetSet = new Set(targets)
          for (const lead of poolLeads) {
            if (!targetSet.has(lead.id)) continue
            const v = [...variants].sort(
              (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)
            )[0]
            variantMap.set(lead.id, v.id)
            counts.set(v.id, (counts.get(v.id) ?? 0) + 1)
          }
        }
      }

      await db.lead.updateMany({
        where: { id: { in: targets }, campaignId: id, status: "pool" },
        data: { status: "approved" },
      })
      if (variantMap.size > 0) {
        await db.$transaction(
          [...variantMap].map(([leadId, variantId]) =>
            db.lead.update({ where: { id: leadId }, data: { variantId } })
          )
        )
      }
      const remaining = await db.lead.count({ where: { campaignId: id, status: "pool" } })
      if (remaining === 0) {
        await db.campaign.update({
          where: { id },
          data: { state: "approved", nextAction: "Leads approved - press Start to begin outreach" },
        })
      } else {
        await db.campaign.update({
          where: { id },
          data: { nextAction: `${remaining} leads still in the pool - approve more or proceed` },
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
    case "promote_variant": {
      const variantId = String(body?.variantId ?? "")
      const variant = await db.copyVariant.findFirst({ where: { id: variantId, campaignId: id } })
      if (!variant) {
        return Response.json({ error: "Variant not found" }, { status: 404 })
      }
      await db.campaign.update({
        where: { id },
        data: {
          copySubject: variant.subject,
          copyBody: variant.body,
          variantTest: false,
          nextAction: `Variant ${variant.label} promoted - split test closed, the winner is now "My copy"`,
        },
      })
      return Response.json({ ok: true, winner: variant.label })
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
      await logAudit({
        ownerId: user.id,
        actorEmail: user.email,
        actorName: user.name ?? "",
        action: "campaign.updated",
        target: campaign.name,
        detail: `action ${action}`,
      })
      return Response.json({ ok: true })
    }
    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
