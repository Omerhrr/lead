import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { nlToFilters, generateCampaignCopy } from "@/lib/ai"
import { generateLeadPool } from "@/lib/engine"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) return Response.json({ campaigns: [] })
  const campaigns = await db.campaign.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    include: {
      leads: { select: { status: true, isHot: true, convStatus: true } },
    },
  })
  return Response.json({
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      sendingNow: c.sendingNow,
      nextAction: c.nextAction,
      createdAt: c.createdAt,
      variantTest: c.variantTest,
      poolCount: c.leads.filter((l) => l.status === "pool").length,
      approvedCount: c.leads.filter((l) => l.status === "approved").length,
      hotCount: c.leads.filter((l) => l.isHot).length,
      bookedCount: c.leads.filter((l) => l.convStatus === "booked").length,
    })),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) {
    return Response.json({ error: "Create your company project first" }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const offer = String(body?.offer ?? "").trim()
  const customerProblem = String(body?.customerProblem ?? "").trim()
  const targetRole = String(body?.targetRole ?? "").trim()
  const targetGeography = String(body?.targetGeography ?? "").trim()
  const targetCompanySize = String(body?.targetCompanySize ?? "").trim()
  if (!offer || !customerProblem || !targetRole || !targetGeography) {
    return Response.json(
      { error: "offer, customerProblem, targetRole and targetGeography are required" },
      { status: 400 }
    )
  }

  const brief = {
    offer,
    customerProblem,
    targetRole,
    targetGeography,
    targetCompanySize: targetCompanySize || "11-50",
    positiveCriteria: String(body?.positiveCriteria ?? "") || null,
    negativeCriteria: String(body?.negativeCriteria ?? "") || null,
    exampleClients: String(body?.exampleClients ?? "") || null,
    keywords: String(body?.keywords ?? ""),
    instructions: String(body?.instructions ?? "") || null,
    followupInstructions: String(body?.followupInstructions ?? "") || null,
    language: String(body?.language ?? "English"),
    maxTouches: Number(body?.maxTouches ?? 3),
    delayDays: Number(body?.delayDays ?? 3),
    autopilotEnabled: body?.autopilotEnabled !== false,
    autoReplyEnabled: body?.autoReplyEnabled !== false,
    autoReplyDelayMinutes: Number(body?.autoReplyDelayMinutes ?? 10),
    dailyBudgetUsd: Number(body?.dailyBudgetUsd ?? 30),
    name: String(body?.name ?? `${project.companyName} — outbound`),
  }

  // AI stage 1: nl-to-filters
  const filters = await nlToFilters(brief)
  // AI stage 2: "My copy" first-touch email
  const copy = await generateCampaignCopy({
    companyName: project.companyName,
    senderName: project.senderName,
    offer: brief.offer,
    customerProblem: brief.customerProblem,
    targetRole: brief.targetRole,
    language: brief.language,
    keywords: brief.keywords,
  })

  const campaign = await db.campaign.create({
    data: {
      projectId: project.id,
      name: brief.name,
      offer: brief.offer,
      customerProblem: brief.customerProblem,
      targetRole: brief.targetRole,
      targetGeography: brief.targetGeography,
      targetCompanySize: brief.targetCompanySize,
      positiveCriteria: brief.positiveCriteria,
      negativeCriteria: brief.negativeCriteria,
      exampleClients: brief.exampleClients,
      keywords: brief.keywords,
      instructions: brief.instructions,
      followupInstructions: brief.followupInstructions,
      language: brief.language,
      maxTouches: Math.max(1, Math.min(5, brief.maxTouches)),
      delayDays: Math.max(1, Math.min(7, brief.delayDays)),
      autopilotEnabled: brief.autopilotEnabled,
      autoReplyEnabled: brief.autoReplyEnabled,
      autoReplyDelayMinutes: brief.autoReplyDelayMinutes,
      dailyBudgetUsd: brief.dailyBudgetUsd,
      filters: JSON.stringify(filters),
      copySubject: copy.subject,
      copyBody: copy.body,
      copyWarnings: JSON.stringify(copy.warnings),
      state: "draft",
      nextAction: "AI is generating your lead pool...",
    },
  })

  // AI stage 3: lead pool generation from the B2B database
  const poolSize = await generateLeadPool(campaign.id)

  const fresh = await db.campaign.findUnique({ where: { id: campaign.id } })
  return Response.json({ campaign: fresh, poolSize, filters })
}
