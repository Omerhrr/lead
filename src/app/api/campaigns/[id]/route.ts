import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { allowedActions } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      project: true,
      leads: {
        orderBy: [{ status: "asc" }, { score: "desc" }],
      },
    },
  })
  if (!campaign || campaign.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }
  const messages = await db.message.findMany({
    where: { campaignId: id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { lead: { select: { name: true, company: true } } },
  })
  const warnings = campaign.copyWarnings ? JSON.parse(campaign.copyWarnings) : []

  // per-variant A/B stats (replies measured as leads with >=1 inbound message)
  const variantRows = await db.copyVariant.findMany({
    where: { campaignId: id },
    orderBy: { label: "asc" },
  })
  let variantStats: Array<{
    id: string; label: string; assigned: number; sent: number
    replied: number; replyRate: number; hot: number; booked: number
  }> = []
  if (variantRows.length > 0) {
    const vm = await db.message.findMany({
      where: { campaignId: id, kind: { in: ["touch", "reply"] } },
      select: { direction: true, leadId: true },
    })
    const inboundLeadIds = new Set(vm.filter((m) => m.direction === "in").map((m) => m.leadId))
    variantStats = variantRows.map((v) => {
      const vLeads = campaign.leads.filter((l) => l.variantId === v.id)
      const sent = vLeads.filter((l) => l.touchCount > 0).length
      const replied = vLeads.filter((l) => inboundLeadIds.has(l.id)).length
      return {
        id: v.id,
        label: v.label,
        assigned: vLeads.length,
        sent,
        replied,
        replyRate: sent > 0 ? replied / sent : 0,
        hot: vLeads.filter((l) => l.isHot).length,
        booked: vLeads.filter((l) => l.convStatus === "booked").length,
      }
    })
  }

  return Response.json({
    campaign: {
      ...campaign,
      copyWarnings: warnings,
      allowedActions: allowedActions(campaign.state),
      variants: variantRows.map((v) => ({ id: v.id, label: v.label, subject: v.subject, body: v.body })),
      variantStats,
    },
    messages,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const existing = await db.campaign.findUnique({ where: { id }, include: { project: true } })
  if (!existing || existing.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 })

  const updatable = [
    "name", "offer", "customerProblem", "targetRole", "targetGeography",
    "targetCompanySize", "positiveCriteria", "negativeCriteria", "exampleClients",
    "keywords", "instructions", "followupInstructions", "language",
  ] as const
  const data: Record<string, string> = {}
  for (const key of updatable) {
    if (typeof body[key] === "string") data[key] = body[key]
  }
  if (typeof body.maxTouches === "number") data.maxTouches = String(Math.max(1, Math.min(5, body.maxTouches)))
  if (typeof body.delayDays === "number") data.delayDays = String(Math.max(1, Math.min(7, body.delayDays)))
  if (typeof body.dailyBudgetUsd === "number") data.dailyBudgetUsd = String(body.dailyBudgetUsd)
  const boolFields = ["autopilotEnabled", "autoReplyEnabled"]
  const updatePayload: Record<string, string | number | boolean> = { ...data }
  for (const key of boolFields) {
    if (typeof body[key] === "boolean") updatePayload[key] = body[key]
  }
  if (typeof body.autoReplyDelayMinutes === "number") {
    updatePayload.autoReplyDelayMinutes = Math.max(1, Math.min(120, body.autoReplyDelayMinutes))
  }
  if (typeof body.copySubject === "string") updatePayload.copySubject = body.copySubject
  if (typeof body.copyBody === "string") updatePayload.copyBody = body.copyBody
  if (typeof body.variantTest === "boolean") updatePayload.variantTest = body.variantTest

  // numeric casts for prisma
  if (typeof updatePayload.maxTouches === "string") updatePayload.maxTouches = Number(updatePayload.maxTouches)
  if (typeof updatePayload.delayDays === "string") updatePayload.delayDays = Number(updatePayload.delayDays)
  if (typeof updatePayload.dailyBudgetUsd === "string") updatePayload.dailyBudgetUsd = Number(updatePayload.dailyBudgetUsd)

  await db.campaign.update({ where: { id }, data: updatePayload })

  // enabling a split test seeds A/B from the current copy so the test is live instantly
  if (body.variantTest === true) {
    const existingVariants = await db.copyVariant.count({ where: { campaignId: id } })
    if (existingVariants === 0) {
      const subj = existing.copySubject ?? "Quick question"
      const bod = existing.copyBody ?? `Hi {{first_name}}, quick idea for {{company}}.`
      await db.copyVariant.createMany({
        data: [
          { campaignId: id, label: "A", subject: subj, body: bod },
          { campaignId: id, label: "B", subject: subj, body: bod },
        ],
      })
    }
  }

  // direct variant edits from the A/B tab
  if (Array.isArray(body.variants)) {
    for (const rv of body.variants) {
      if (
        rv && typeof rv.id === "string" &&
        typeof rv.subject === "string" && typeof rv.body === "string"
      ) {
        await db.copyVariant.updateMany({
          where: { id: rv.id, campaignId: id },
          data: { subject: rv.subject, body: rv.body },
        })
      }
    }
  }

  if (body.regeneratePool) {
    const { generateLeadPool } = await import("@/lib/engine")
    const count = await generateLeadPool(id)
    return Response.json({ ok: true, poolSize: count })
  }
  const fresh = await db.campaign.findUnique({ where: { id } })
  return Response.json({ ok: true, campaign: fresh })
}
