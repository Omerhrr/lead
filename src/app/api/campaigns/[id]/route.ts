import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { allowedActions } from "@/lib/constants"
import { evaluateSplitTest, AB_MIN_SENDS, type SplitArm } from "@/lib/stats"
import { generateVariantAlternative } from "@/lib/ai"

export const dynamic = "force-dynamic"

const MAX_VARIANTS = 4

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
    replied: number; replyRate: number; opened: number; openRate: number
    hot: number; booked: number
  }> = []
  const arms: SplitArm[] = []
  if (variantRows.length > 0) {
    const vm = await db.message.findMany({
      where: { campaignId: id, kind: { in: ["touch", "reply"] } },
      select: { direction: true, leadId: true, variantId: true, kind: true, channel: true, opens: true },
    })
    const inboundLeadIds = new Set(vm.filter((m) => m.direction === "in").map((m) => m.leadId))
    const touches = vm.filter((m) => m.direction === "out" && m.kind === "touch" && m.channel === "email")
    variantStats = variantRows.map((v) => {
      const vLeads = campaign.leads.filter((l) => l.variantId === v.id)
      const sent = vLeads.filter((l) => l.touchCount > 0).length
      const replied = vLeads.filter((l) => inboundLeadIds.has(l.id)).length
      const vTouches = touches.filter((m) => m.variantId === v.id)
      const opened = vTouches.filter((m) => m.opens > 0).length
      arms.push({ id: v.id, label: v.label, sent, replied })
      return {
        id: v.id,
        label: v.label,
        assigned: vLeads.length,
        sent,
        replied,
        replyRate: sent > 0 ? replied / sent : 0,
        opened,
        openRate: vTouches.length > 0 ? opened / vTouches.length : 0,
        hot: vLeads.filter((l) => l.isHot).length,
        booked: vLeads.filter((l) => l.convStatus === "booked").length,
      }
    })
  }
  const splitTest = variantRows.length >= 2
    ? { ...evaluateSplitTest(arms), minSends: AB_MIN_SENDS }
    : null

  return Response.json({
    campaign: {
      ...campaign,
      copyWarnings: warnings,
      allowedActions: allowedActions(campaign.state),
      variants: variantRows.map((v) => ({ id: v.id, label: v.label, subject: v.subject, body: v.body })),
      variantStats,
      splitTest,
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
  if (typeof body.autoPromote === "boolean") updatePayload.autoPromote = body.autoPromote

  // numeric casts for prisma
  if (typeof updatePayload.maxTouches === "string") updatePayload.maxTouches = Number(updatePayload.maxTouches)
  if (typeof updatePayload.delayDays === "string") updatePayload.delayDays = Number(updatePayload.delayDays)
  if (typeof updatePayload.dailyBudgetUsd === "string") updatePayload.dailyBudgetUsd = Number(updatePayload.dailyBudgetUsd)

  await db.campaign.update({ where: { id }, data: updatePayload })

  // enabling a split test seeds arms from the current copy so the test is
  // live instantly; a lone leftover arm is topped up with an AI alternative
  if (body.variantTest === true) {
    const existingVariants = await db.copyVariant.findMany({
      where: { campaignId: id },
      orderBy: { label: "asc" },
    })
    if (existingVariants.length === 0) {
      const subj = existing.copySubject ?? "Quick question"
      const bod = existing.copyBody ?? `Hi {{first_name}}, quick idea for {{company}}.`
      await db.copyVariant.createMany({
        data: [
          { campaignId: id, label: "A", subject: subj, body: bod },
          { campaignId: id, label: "B", subject: subj, body: bod },
        ],
      })
    } else if (existingVariants.length === 1) {
      const only = existingVariants[0]
      const alt = await generateVariantAlternative({
        offer: existing.offer,
        customerProblem: existing.customerProblem,
        language: existing.language || "English",
        controlSubject: only.subject,
        controlBody: only.body,
      })
      await db.copyVariant.create({
        data: { campaignId: id, label: "B", subject: alt.subject, body: alt.body },
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

  // multi-arm tests: add a C/D arm with a fresh AI angle (max 4 variants).
  // Self-healing: with no arms yet, a control A is created first so the added
  // arm is always a real alternative, never a lone duplicate.
  if (body.addVariant === true) {
    let existingVariants = await db.copyVariant.findMany({
      where: { campaignId: id },
      orderBy: { label: "asc" },
    })
    if (existingVariants.length === 0) {
      await db.copyVariant.create({
        data: {
          campaignId: id,
          label: "A",
          subject: existing.copySubject ?? "Quick question",
          body: existing.copyBody ?? `Hi {{first_name}}, quick idea for {{company}}.`,
        },
      })
      existingVariants = await db.copyVariant.findMany({
        where: { campaignId: id },
        orderBy: { label: "asc" },
      })
    }
    if (existingVariants.length >= MAX_VARIANTS) {
      return Response.json(
        { error: `Split tests support up to ${MAX_VARIANTS} variants (A–D)` },
        { status: 400 }
      )
    }
    const control = existingVariants[0]
    const maxLabel = Math.max(...existingVariants.map((v) => v.label.charCodeAt(0)))
    const nextLabel = String.fromCharCode(
      Math.min(maxLabel + 1, 65 + MAX_VARIANTS - 1)
    )
    const alt = await generateVariantAlternative({
      offer: existing.offer,
      customerProblem: existing.customerProblem,
      language: existing.language || "English",
      controlSubject: control?.subject ?? existing.copySubject ?? "Quick question",
      controlBody: control?.body ?? existing.copyBody ?? `Hi {{first_name}}, quick idea for {{company}}.`,
    })
    await db.copyVariant.create({
      data: { campaignId: id, label: nextLabel, subject: alt.subject, body: alt.body },
    })
  }

  // remove an unused arm. Guards keep the test honest: a live test never
  // drops below two arms, and an arm that already has assigned leads keeps
  // its stats (removing it would orphan their attribution).
  if (typeof body.removeVariant === "string") {
    const vid = body.removeVariant
    const variant = await db.copyVariant.findFirst({ where: { id: vid, campaignId: id } })
    if (!variant) {
      return Response.json({ error: "Variant not found" }, { status: 404 })
    }
    const siblings = await db.copyVariant.count({ where: { campaignId: id } })
    if (existing.variantTest && siblings <= 2) {
      return Response.json(
        { error: "A live split test needs at least two arms — turn the test off first" },
        { status: 400 }
      )
    }
    const assigned = await db.lead.count({ where: { variantId: vid } })
    if (assigned > 0) {
      return Response.json(
        { error: `Variant ${variant.label} has ${assigned} assigned leads — removing it would break their stats` },
        { status: 400 }
      )
    }
    await db.copyVariant.delete({ where: { id: vid } })
  }

  if (body.regeneratePool) {
    const { generateLeadPool } = await import("@/lib/engine")
    const count = await generateLeadPool(id)
    return Response.json({ ok: true, poolSize: count })
  }
  const fresh = await db.campaign.findUnique({ where: { id } })
  return Response.json({ ok: true, campaign: fresh })
}
