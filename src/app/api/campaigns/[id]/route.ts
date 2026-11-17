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
  return Response.json({
    campaign: {
      ...campaign,
      copyWarnings: warnings,
      allowedActions: allowedActions(campaign.state),
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

  // numeric casts for prisma
  if (typeof updatePayload.maxTouches === "string") updatePayload.maxTouches = Number(updatePayload.maxTouches)
  if (typeof updatePayload.delayDays === "string") updatePayload.delayDays = Number(updatePayload.delayDays)
  if (typeof updatePayload.dailyBudgetUsd === "string") updatePayload.dailyBudgetUsd = Number(updatePayload.dailyBudgetUsd)

  await db.campaign.update({ where: { id }, data: updatePayload })

  if (body.regeneratePool) {
    const { generateLeadPool } = await import("@/lib/engine")
    const count = await generateLeadPool(id)
    return Response.json({ ok: true, poolSize: count })
  }
  const fresh = await db.campaign.findUnique({ where: { id } })
  return Response.json({ ok: true, campaign: fresh })
}
