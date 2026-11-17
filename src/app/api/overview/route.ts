import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { EMAIL_PRICE_USD, MEDIAN_CPL_USD } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const account = user.billing
  if (!account) return Response.json({ error: "No billing account" }, { status: 400 })

  const project = await db.project.findFirst({ where: { userId: user.id } })
  const projectIds = project ? [project.id] : []
  const campaigns = await db.campaign.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, name: true, state: true, sendingNow: true, nextAction: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  })
  const campaignIds = campaigns.map((c) => c.id)

  const leads = await db.lead.findMany({
    where: { campaignId: { in: campaignIds } },
    select: {
      id: true, isHot: true, convStatus: true, status: true, meetingAt: true,
      campaignId: true, name: true, company: true, title: true, score: true,
    },
  })
  const hotLeads = leads.filter((l) => l.isHot)
  const booked = leads.filter((l) => l.convStatus === "booked")

  const usage = await db.usageDaily.findMany({
    where: { accountId: account.id },
    orderBy: { date: "asc" },
    take: 14,
  })
  const usageTotals = usage.reduce(
    (acc, u) => ({
      emails: acc.emails + u.emailsSent,
      linkedin: acc.linkedin + u.linkedinTouches,
      replies: acc.replies + u.repliesReceived,
      spend: acc.spend + u.spendUsd,
    }),
    { emails: 0, linkedin: 0, replies: 0, spend: 0 }
  )

  const activity = await db.message.findMany({
    where: { campaignId: { in: campaignIds } },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { lead: { select: { name: true, company: true } } },
  })

  const unread = await db.lead.count({
    where: {
      campaignId: { in: campaignIds },
      convStatus: { in: ["interested", "question", "negotiating", "active"] },
    },
  })

  const cpl = hotLeads.length > 0 ? usageTotals.spend / hotLeads.length : MEDIAN_CPL_USD

  // scheduled weekly digest state (demo-compressed cadence)
  const REPORT_INTERVAL_MS = 120_000
  const lastReportAt = project?.lastReportAt ?? null
  const nextReportInSec =
    project?.reportCadence === "weekly"
      ? lastReportAt
        ? Math.max(0, Math.round((REPORT_INTERVAL_MS - (Date.now() - lastReportAt.getTime())) / 1000))
        : 0
      : null

  return Response.json({
    campaigns,
    stats: {
      emailsSent: usageTotals.emails,
      linkedinTouches: usageTotals.linkedin,
      replies: usageTotals.replies,
      replyRate: usageTotals.emails > 0 ? usageTotals.replies / usageTotals.emails : 0,
      hotLeads: hotLeads.length,
      booked: booked.length,
      poolSize: leads.filter((l) => l.status === "pool").length,
      approved: leads.filter((l) => l.status === "approved").length,
      cpl,
      emailsPer30: Math.round(30 / (account.emailPriceUsd || EMAIL_PRICE_USD)),
    },
    billing: {
      prepaidBalanceUsd: account.prepaidBalanceUsd,
      spentTodayUsd: account.spentTodayUsd,
      spentThisMonthUsd: account.spentThisMonthUsd,
      monthlyCapUsd: account.monthlyCapUsd,
      dailyBudgetUsd: account.dailyBudgetUsd,
      emailPriceUsd: account.emailPriceUsd,
      linkedinSeats: account.linkedinSeats,
    },
    usage,
    hotLeads: hotLeads.slice(0, 6),
    activity,
    unread,
    report: {
      cadence: project?.reportCadence ?? "off",
      lastReportAt: lastReportAt ? lastReportAt.toISOString() : null,
      reportCount: project?.reportCount ?? 0,
      nextReportInSec,
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const cadence = String(body?.cadence ?? "")
  if (cadence !== "off" && cadence !== "weekly") {
    return Response.json({ error: "cadence must be off or weekly" }, { status: 400 })
  }
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) return Response.json({ error: "No project" }, { status: 400 })
  // switching to weekly clears lastReportAt so the first digest fires on the
  // next tick; switching off stops the schedule
  await db.project.update({
    where: { id: project.id },
    data: {
      reportCadence: cadence,
      ...(cadence === "weekly" ? { lastReportAt: null } : {}),
    },
  })
  return Response.json({ ok: true, cadence })
}
