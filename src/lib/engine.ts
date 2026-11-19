// Agent engine - drives the outreach loop end to end: brief → lead pool →
// approve → state machine sends → autopilot replies → booked meetings,
// with credit metering.
// Time is compressed: one 4s tick ~= a working chunk of a campaign day.

import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { autopilotReply } from "@/lib/ai"
import {
  EMAIL_PRICE_USD,
  LINKEDIN_TOUCH_PRICE_USD,
  LINKEDIN_SEAT_PRICE_USD,
  EMAILS_PER_DOMAIN_DAY,
  WARM_START_EMAILS,
  WARM_STEP_EMAILS,
  REPORT_INTERVAL_MS,
} from "@/lib/constants"
import { deliverOutreach, isProviderConfigured } from "@/lib/email-provider"
import { deliverLinkedInTouch, isLinkedinConfigured } from "@/lib/linkedin-provider"
import { suppressLeadOptOut } from "@/lib/unsubscribe"
import { evaluateSplitTest, AB_MIN_SENDS, type SplitArm } from "@/lib/stats"
import { verifyCampaignLeads } from "@/lib/verify-email"
import { chargeFor, campaignSpendUsd } from "@/lib/billing-ops"
import { langStrings } from "@/lib/i18n-copy"
import type { LeadFilters } from "@/lib/ai"

const FOLLOWUP_MS_PER_DAY = 10 * 1000 // 1 campaign day = 10s real time
const MEETING_LEAD_DAYS = [1, 2, 3, 4]

const REPLY_CHANCE_BY_TOUCH = [0.3, 0.16, 0.1]
const FIRST_REPLY_OUTCOMES: Array<{ p: number; outcome: string }> = [
  { p: 0.42, outcome: "interested" },
  { p: 0.26, outcome: "question" },
  { p: 0.18, outcome: "not_interested" },
  { p: 0.14, outcome: "unsubscribe" },
]

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1))
}
function pickWeighted<T>(entries: Array<{ p: number; outcome: T }>): T {
  const roll = Math.random()
  let acc = 0
  for (const e of entries) {
    acc += e.p
    if (roll <= acc) return e.outcome
  }
  return entries[entries.length - 1].outcome
}
function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10)
}
function monthStr(d = new Date()) {
  return d.toISOString().slice(0, 7)
}
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
function baseUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

// ---------------------------------------------------------------- lead pool

function tokenMatch(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase()
  return needles.some((n) => {
    const t = n.toLowerCase().trim()
    return t.length > 2 && (h.includes(t) || t.includes(h))
  })
}

export async function generateLeadPool(campaignId: string) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { project: true },
  })
  if (!campaign) throw new Error("Campaign not found")

  const filters: LeadFilters = campaign.filters
    ? JSON.parse(campaign.filters)
    : { industries: [], titles: [], geography: [], companySize: [], keywords: [] }

  const user = await db.user.findUnique({
    where: { id: campaign.project.userId },
    include: { suppress: true },
  })
  const suppressedEmails = new Set(
    (user?.suppress ?? []).filter((s) => s.type === "person").map((s) => s.value.toLowerCase())
  )
  const suppressedCompanies = new Set(
    (user?.suppress ?? [])
      .filter((s) => s.type === "company" || s.type === "domain")
      .map((s) => s.value.toLowerCase())
  )

  const rows = await db.dbPerson.findMany({ include: { company: true } })

  const scoreRow = (p: (typeof rows)[number]) => {
    let industryMatch = tokenMatch(p.company.industry, filters.industries)
    let kwMatch = false
    if (!industryMatch && filters.keywords.length) {
      kwMatch = tokenMatch(p.company.industry, filters.keywords) || tokenMatch(p.company.name, filters.keywords)
    }
    const geoMatch = filters.geography.length === 0 || tokenMatch(p.company.country, filters.geography)
    const sizeMatch = filters.companySize.length === 0 || filters.companySize.includes(p.company.size)
    const titleMatch = filters.titles.length === 0 || tokenMatch(p.title, filters.titles)
    const score = Math.min(
      96,
      38 + p.seniority * 9 + (industryMatch ? 10 : kwMatch ? 6 : 0) + (geoMatch ? 6 : 0) + (sizeMatch ? 5 : 0) + (titleMatch ? 6 : 0)
    )
    return { p, industryMatch, kwMatch, geoMatch, sizeMatch, titleMatch, score }
  }

  const strict = rows.map(scoreRow).filter(
    (r) => r.industryMatch && r.titleMatch && r.geoMatch && r.sizeMatch
  )
  const relaxed = rows.map(scoreRow).filter(
    (r) => (r.industryMatch || r.kwMatch) && r.titleMatch && r.geoMatch
  )
  const fallback = rows.map(scoreRow).filter((r) => r.titleMatch && r.score >= 55)

  const pool =
    strict.length >= 24 ? strict : relaxed.length >= 24 ? relaxed : [...relaxed, ...fallback]

  const seen = new Set<string>()
  const chosen = pool
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      if (seen.has(r.p.email)) return false
      if (suppressedEmails.has(r.p.email.toLowerCase())) return false
      if (suppressedCompanies.has(r.p.company.domain.toLowerCase()) || suppressedCompanies.has(r.p.company.name.toLowerCase())) return false
      seen.add(r.p.email)
      return true
    })
    .slice(0, 32)

  await db.lead.deleteMany({ where: { campaignId, status: "pool" } })

  await db.$transaction(
    chosen.map((r) =>
      db.lead.create({
        data: {
          campaignId,
          name: r.p.name,
          title: r.p.title,
          company: r.p.company.name,
          companyDomain: r.p.company.domain,
          industry: r.p.company.industry,
          companySize: r.p.company.size,
          country: r.p.company.country,
          city: r.p.company.city,
          email: r.p.email,
          linkedinUrl: r.p.linkedin,
          score: r.score,
          reasons: r.p.hook,
          status: "pool",
        },
      })
    )
  )

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      state: "pool_ready",
      nextAction: "Review the lead pool and approve leads to unlock sending",
    },
  })

  // pre-send mailbox verification runs as soon as the pool exists, so the
  // review screen shows valid/risky/invalid badges before anything is approved
  await verifyCampaignLeads(campaignId)

  return chosen.length
}

// ------------------------------------------------------------- copy filling

export function fillCopy(tpl: string, lead: { name: string; company: string; reasons: string | null }, senderName: string) {
  return tpl
    .replaceAll("{{first_name}}", lead.name.split(" ")[0])
    .replaceAll("{{company}}", lead.company)
    .replaceAll("{{hook}}", lead.reasons || "you are growing fast")
    .replaceAll("{{sender_name}}", senderName)
}

// ------------------------------------------------------------------ billing

// Thin wrapper: all engine metering flows through the shared chargeFor op
// (campaign attribution enables per-campaign cost-per-lead reporting).
async function charge(
  accountId: string,
  costUsd: number,
  description: string,
  opts: { emails: number; linkedin: number; campaignId?: string }
) {
  await chargeFor(accountId, costUsd, "spend", description, opts)
}

// Once-per-warm-lead success fee under per-result pricing. The account row is
// refetched so concurrent charges never overdraw the prepaid balance.
async function chargeWarmLeadFee(
  account: { id: string; pricingModel: string; warmLeadFeeUsd: number },
  campaign: { id: string; name: string },
  lead: { id: string; name: string; company: string; successFeeCharged: boolean }
) {
  if (account.pricingModel !== "per_result" || lead.successFeeCharged) return
  const fresh = await db.billingAccount.findUnique({ where: { id: account.id } })
  if (!fresh || fresh.prepaidBalanceUsd < fresh.warmLeadFeeUsd) return
  await db.lead.update({ where: { id: lead.id }, data: { successFeeCharged: true } })
  await chargeFor(
    account.id,
    fresh.warmLeadFeeUsd,
    "warm_lead_fee",
    `${campaign.name}: warm lead - ${lead.name} (${lead.company})`,
    { campaignId: campaign.id }
  )
}

async function ensureDailyReset(accountId: string) {
  const account = await db.billingAccount.findUnique({ where: { id: accountId } })
  if (!account) return null
  const today = todayStr()
  if (account.spentTodayDate !== today) {
    return db.billingAccount.update({
      where: { id: account.id },
      data: { spentTodayDate: today, spentTodayUsd: 0 },
    })
  }
  return account
}

// ------------------------------------------------------------------- events

async function noteReplyEvent(accountId: string, hot: boolean) {
  const date = todayStr()
  const existing = await db.usageDaily.findUnique({
    where: { accountId_date: { accountId, date } },
  })
  if (existing) {
    await db.usageDaily.update({
      where: { id: existing.id },
      data: { repliesReceived: existing.repliesReceived + 1, hotLeads: existing.hotLeads + (hot ? 1 : 0) },
    })
  } else {
    await db.usageDaily.create({
      data: { accountId, date, repliesReceived: 1, hotLeads: hot ? 1 : 0 },
    })
  }
}

const INBOUND_TEXT: Record<string, string[]> = {
  interested: [
    "Hi! This is actually really timely - we've been looking at solving exactly this. Happy to hear more. What does pricing look like?",
    "Interesting - we have this problem on our list for this quarter. Do you have 15 minutes this week?",
    "I'd be up for a quick chat. Thursday or Friday afternoon works on my end.",
  ],
  question: [
    "Thanks for reaching out. Quick question - how does this integrate with what we already run? We're on a mixed stack.",
    "Sounds relevant. What kind of results are your similar clients seeing, and how long does onboarding take?",
  ],
  not_interested: [
    "Appreciate the note, but this isn't a priority for us right now. Maybe circle back next year.",
  ],
  unsubscribe: ["Please remove me from your list. Thanks."],
  negotiating: [
    "Thursday 14:00 works. Add it to my calendar and send the invite please.",
    "Can we do Friday at 10:00 instead? I have a conflict Thursday.",
  ],
  booked_confirm: [
    "Great, see you then. The invite landed, thanks!",
  ],
}

// -------------------------------------------------------------------- tick

export async function tick(userId: string) {
  const account = await ensureDailyReset(
    (await db.billingAccount.findUnique({ where: { userId } }))?.id ?? ""
  )
  if (!account) return { ok: false }

  const projects = await db.project.findMany({ where: { userId } })
  const projectIds = projects.map((p) => p.id)
  const activeCampaigns = await db.campaign.findMany({
    where: { projectId: { in: projectIds }, state: "sending", sendingNow: true },
    include: { project: true },
  })

  const pulse = { sent: 0, replies: 0, booked: 0, spent: 0 }

  for (const campaign of activeCampaigns) {
    await advanceCampaign(campaign, account, pulse)
  }

  // open tracking: demo mode simulates reads; real mode records pixel hits
  await simulateOpens(projectIds)
  // split-test auto-promotion: close the test once the winner is significant
  await autoPromotePass(projectIds)
  // deliverability warming: ramp each warming domain one day per tick
  await warmDomainsPass(projectIds)
  // scheduled weekly digest emails (demo-compressed cadence)
  await scheduledReportsPass(userId)

  return { ok: true, ...pulse }
}

// ------------------------------------------------ domain warming

// One tick advances every warming domain by one "warming day": the daily
// volume steps WARM_START -> +STEP per day until it reaches the full cap,
// then the domain flips to active (mirrors real inbox-warming practice).
async function warmDomainsPass(projectIds: string[]) {
  const warming = await db.sendingDomain.findMany({
    where: { projectId: { in: projectIds }, status: "warming" },
  })
  for (const d of warming) {
    const warmedDays = d.warmedDays + 1
    const emailsPerDay = Math.min(
      EMAILS_PER_DOMAIN_DAY,
      WARM_START_EMAILS + warmedDays * WARM_STEP_EMAILS
    )
    await db.sendingDomain.update({
      where: { id: d.id },
      data: {
        warmedDays,
        emailsPerDay,
        status: emailsPerDay >= EMAILS_PER_DOMAIN_DAY ? "active" : "warming",
      },
    })
  }
  return warming.length
}

// ------------------------------------------------ scheduled reports

// Weekly digest per project ("reportCadence: weekly"): one funnel row per
// campaign, emailed to the account owner through the configured provider
// (simulated in demo mode). The cadence is demo-compressed: REPORT_INTERVAL_MS
// stands in for a real week; the first digest fires on the next tick.
async function scheduledReportsPass(userId: string) {
  const projects = await db.project.findMany({
    where: { userId, reportCadence: "weekly" },
    include: { user: { select: { email: true } }, campaigns: { orderBy: { createdAt: "asc" } } },
  })
  const now = Date.now()
  for (const project of projects) {
    if (project.lastReportAt && now - project.lastReportAt.getTime() < REPORT_INTERVAL_MS) continue
    const lines: string[] = [
      `Jidout weekly digest - ${project.companyName}`,
      `Generated ${new Date().toISOString().slice(0, 10)} · demo-compressed week`,
      "",
    ]
    let touched = 0
    for (const c of project.campaigns) {
      if (c.state === "archived" || c.state === "draft") continue
      const [leads, touches, inbound, spend] = await Promise.all([
        db.lead.findMany({
          where: { campaignId: c.id },
          select: { id: true, status: true, isHot: true, convStatus: true },
        }),
        db.message.findMany({
          where: { campaignId: c.id, direction: "out", kind: "touch", channel: "email" },
          select: { opens: true, clicks: true },
        }),
        db.message.findMany({ where: { campaignId: c.id, direction: "in" }, select: { leadId: true } }),
        campaignSpendUsd(c.id),
      ])
      const approved = leads.filter((l) => l.status === "approved").length
      const repliedIds = new Set(inbound.map((m) => m.leadId))
      const warm = leads.filter((l) => l.isHot || l.convStatus === "booked").length
      const cpl = warm > 0 ? Math.round((spend / warm) * 100) / 100 : null
      const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "-")
      lines.push(
        `${c.name} (${c.state}): ${approved} approved · ${touches.length} touches · ` +
          `${pct(touches.filter((m) => m.opens > 0).length, touches.length)} opened · ` +
          `${pct(touches.filter((m) => m.clicks > 0).length, touches.length)} clicked · ` +
          `${leads.filter((l) => repliedIds.has(l.id)).length} replies · ` +
          `${leads.filter((l) => l.isHot).length} hot · ` +
          `${leads.filter((l) => l.convStatus === "booked").length} booked · ` +
          `spend $${spend.toFixed(2)}${cpl !== null ? ` · $${cpl.toFixed(2)} per warm lead` : ""}`
      )
      touched++
    }
    if (touched === 0) continue
    lines.push("", "- Jidout (opens by pixel, clicks by tracked links, opt-outs auto-suppressed)")
    await deliverOutreach({
      to: project.user.email,
      fromName: "Jidout reports",
      fromEmail: `reports@${project.companyDomain || "jidout.local"}`,
      subject: `Jidout weekly digest - ${project.companyName}`,
      text: lines.join("\n"),
    })
    await db.project.update({
      where: { id: project.id },
      data: { lastReportAt: new Date(), reportCount: { increment: 1 } },
    })
  }
}

// ------------------------------------------------------------------ opens

// ~66% of leads eventually open (decided per-message by a stable id hash),
// each tick flips a "will open" message with p=0.3, so reads spread over
// roughly the first two campaign days instead of landing instantly.
function willOpen(id: string): boolean {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return h % 100 < 66
}

async function simulateOpens(projectIds: string[]) {
  const campaigns = await db.campaign.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, ctaUrl: true },
  })
  if (campaigns.length === 0) return 0
  // only campaigns with a tracked CTA link can produce simulated clicks
  const ctaSet = new Set(campaigns.filter((c) => c.ctaUrl).map((c) => c.id))
  const candidates = await db.message.findMany({
    where: {
      campaignId: { in: campaigns.map((c) => c.id) },
      direction: "out",
      channel: "email",
      kind: "touch",
      status: "sent",
      opens: 0,
      createdAt: { lt: new Date(Date.now() - 3000) }, // no instant reads
    },
    select: { id: true, campaignId: true },
    take: 300,
  })
  const flip = candidates.filter((m) => willOpen(m.id) && Math.random() < 0.3)
  if (flip.length === 0) return 0
  // ~40% of opens also click through the tracked CTA link (demo mode, CTA campaigns only)
  const clicked = flip.filter((m) => ctaSet.has(m.campaignId) && Math.random() < 0.4)
  if (clicked.length > 0) {
    await db.message.updateMany({
      where: { id: { in: clicked.map((m) => m.id) } },
      data: { opens: 1, openedAt: new Date(), clicks: 1, clickedAt: new Date() },
    })
    // per-link breakdown rows: the simulated hit lands on the campaign CTA
    const ctaOf = new Map(campaigns.map((c) => [c.id, c.ctaUrl as string]))
    await db.clickEvent.createMany({
      data: clicked.map((m) => ({
        messageId: m.id,
        campaignId: m.campaignId,
        url: ctaOf.get(m.campaignId) ?? "unknown",
      })),
    })
  }
  const openOnly = flip.filter((m) => !clicked.includes(m))
  if (openOnly.length > 0) {
    await db.message.updateMany({
      where: { id: { in: openOnly.map((m) => m.id) } },
      data: { opens: 1, openedAt: new Date() },
    })
  }
  return flip.length
}

// -------------------------------------------------------- split-test winner

// Per-arm sent/replied using the same semantics as the API stats
// (sent = leads with >=1 touch; replied = leads with >=1 inbound message).
async function variantArms(campaignId: string): Promise<SplitArm[]> {
  const variants = await db.copyVariant.findMany({
    where: { campaignId },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  })
  if (variants.length === 0) return []
  const leads = await db.lead.findMany({
    where: { campaignId, variantId: { not: null } },
    select: { id: true, variantId: true, touchCount: true },
  })
  const inbound = await db.message.findMany({
    where: { campaignId, direction: "in" },
    select: { leadId: true },
  })
  const repliedLeads = new Set(inbound.map((m) => m.leadId))
  return variants.map((v) => {
    const sent = leads.filter((l) => l.variantId === v.id && l.touchCount > 0)
    return {
      id: v.id,
      label: v.label,
      sent: sent.length,
      replied: sent.filter((l) => repliedLeads.has(l.id)).length,
    }
  })
}

// Auto-promotion: same effect as the manual "Promote winner" button, but the
// engine closes the test itself once the leading arm beats the runner-up with
// a two-proportion z-test p < 0.10 and every arm has >= AB_MIN_SENDS sends.
async function autoPromotePass(projectIds: string[]) {
  const campaigns = await db.campaign.findMany({
    where: { projectId: { in: projectIds }, variantTest: true, autoPromote: true },
    select: { id: true },
  })
  for (const c of campaigns) {
    const result = evaluateSplitTest(await variantArms(c.id))
    if (!result.significant || !result.leader || result.pValue === null) continue
    const winner = await db.copyVariant.findFirst({
      where: { campaignId: c.id, label: result.leader },
    })
    if (!winner) continue
    await db.campaign.update({
      where: { id: c.id },
      data: {
        copySubject: winner.subject,
        copyBody: winner.body,
        variantTest: false,
        nextAction: `Variant ${winner.label} auto-promoted - ${Math.round(result.leaderRate * 100)}% vs ${Math.round(result.runnerRate * 100)}% reply rate (p=${result.pValue.toFixed(2)}), test closed`,
      },
    })
  }
}

async function campaignCapacity(campaignId: string, projectId: string) {
  // warming domains send at their reduced (ramping) volume, active at full cap
  const domains = await db.sendingDomain.findMany({
    where: { projectId, status: { in: ["active", "warming"] } },
  })
  void campaignId
  return domains.reduce((sum, d) => sum + d.emailsPerDay, 0)
}

async function advanceCampaign(
  campaign: { id: string; projectId: string; maxTouches: number; delayDays: number; autopilotEnabled: boolean; autoReplyEnabled: boolean; autoReplyDelayMinutes: number; copySubject: string | null; copyBody: string | null; variantTest: boolean; ctaUrl: string | null; linkedinEnabled: boolean; dailyBudgetUsd: number; name: string; offer: string; customerProblem: string; language: string; verifyPolicy: string; project: { senderName: string; companyName: string; companyDomain: string; bookingUrl: string; userId: string } },
  account: { id: string; prepaidBalanceUsd: number; spentTodayUsd: number; spentThisMonthUsd: number; monthlyCapUsd: number; dailyBudgetUsd: number; emailPriceUsd: number; linkedinSeats: number; linkedinSeatBilledMonth: string; pricingModel: string; warmLeadFeeUsd: number },
  pulse: { sent: number; replies: number; booked: number; spent: number }
) {
  const now = new Date()

  // 1) inbound replies due
  const repliesDue = await db.lead.findMany({
    where: {
      campaignId: campaign.id,
      replyDueAt: { lte: now },
      status: "approved",
      OR: [{ convStatus: null }, { convStatus: { in: ["negotiating", "question"] } }],
    },
  })
  for (const lead of repliesDue) {
    await processInbound(campaign, lead, account)
    pulse.replies++
  }

  // 2) autopilot actions due
  if (campaign.autopilotEnabled && campaign.autoReplyEnabled) {
    const agentDue = await db.lead.findMany({
      where: { campaignId: campaign.id, agentDueAt: { lte: now }, agentStage: { not: null }, convStatus: { in: ["interested", "negotiating", "question", "propose"] } },
    })
    for (const lead of agentDue.slice(0, 3)) {
      await processAutopilot(campaign, lead, account)
    }
  }

  // 3) budget guards
  const capacity = await campaignCapacity(campaign.id, campaign.projectId)
  const quota = Math.max(2, Math.ceil(capacity / 12))
  const perSendCost = account.emailPriceUsd || EMAIL_PRICE_USD
  const balanceOk = account.prepaidBalanceUsd >= perSendCost
  const dailyOk = account.spentTodayUsd + perSendCost <= Math.min(account.dailyBudgetUsd, campaign.dailyBudgetUsd)
  const monthlyOk = account.spentThisMonthUsd < account.monthlyCapUsd

  if (!balanceOk) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "Out of credits - top up billing to resume outreach" },
    })
    return
  }
  if (!monthlyOk) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "Monthly cap reached - raise the cap in billing" },
    })
    return
  }
  if (!dailyOk) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: `Daily budget reached (${campaign.dailyBudgetUsd} USD) - resumes next cycle` },
    })
    return
  }
  if (capacity === 0) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "No active sending domains - buy domains in the Domains tab" },
    })
    return
  }

  // 4) sends (first touches + follow-ups). The mailbox verification policy
  // gates the queue: addresses found risky/invalid pre-send never get a send.
  const verifyFilter: Record<string, Record<string, string | string[]>> =
    campaign.verifyPolicy === "send_all"
      ? {}
      : campaign.verifyPolicy === "skip_invalid_risky"
        ? { verifyStatus: { notIn: ["invalid", "risky"] } }
        : { verifyStatus: { not: "invalid" } }
  const eligible = await db.lead.findMany({
    where: {
      campaignId: campaign.id,
      status: "approved",
      convStatus: null,
      ...verifyFilter,
      OR: [
        { touchCount: 0 },
        { nextTouchAt: { lte: now }, touchCount: { lt: campaign.maxTouches } },
      ],
    },
    orderBy: [{ touchCount: "asc" }, { score: "desc" }],
    take: quota,
  })

  // A/B split test: when enabled with 2+ variants, each lead is pinned to the
  // variant with the fewest assigned approved leads (balanced split).
  const variants = campaign.variantTest
    ? await db.copyVariant.findMany({ where: { campaignId: campaign.id }, orderBy: { label: "asc" } })
    : []
  const useVariants = variants.length >= 2
  const variantCounts = new Map<string, number>()
  if (useVariants) {
    const grouped = await db.lead.groupBy({
      by: ["variantId"],
      where: { campaignId: campaign.id, status: "approved", variantId: { not: null } },
      _count: { _all: true },
    })
    for (const g of grouped) if (g.variantId) variantCounts.set(g.variantId, g._count._all)
  }


  let emails = 0
  let linkedin = 0
  for (const lead of eligible) {
    const isFollowup = lead.touchCount > 0
    const seatDue = account.linkedinSeatBilledMonth !== monthStr()
    const seatCost = account.linkedinSeats * LINKEDIN_SEAT_PRICE_USD
    const seatAffordable = !seatDue || account.prepaidBalanceUsd >= seatCost + perSendCost
    const useLinkedin = !!lead.linkedinUrl && lead.touchCount >= 1 && seatAffordable && campaign.linkedinEnabled && Math.random() < 0.3
    const channel = useLinkedin ? "linkedin" : "email"
    const touchIndex = lead.touchCount + 1

    // resolve the lead's variant (assigned once, kept for the whole sequence)
    let variant: { id: string; label: string; subject: string; body: string } | null = null
    if (useVariants) {
      if (lead.variantId && variants.some((v) => v.id === lead.variantId)) {
        variant = variants.find((v) => v.id === lead.variantId) ?? null
      } else {
        variant = [...variants].sort(
          (a, b) => (variantCounts.get(a.id) ?? 0) - (variantCounts.get(b.id) ?? 0)
        )[0]
        variantCounts.set(variant.id, (variantCounts.get(variant.id) ?? 0) + 1)
      }
    }

    const baseSubject = variant?.subject ?? campaign.copySubject ?? "Quick question"
    const loc = langStrings(campaign.language)
    const subject = isFollowup
      ? loc.followupSubject(baseSubject.replace(/^(Re:|AW:|Re :|回复：|رد:)\s*/i, ""), touchIndex)
      : baseSubject
    const bodyTpl = variant?.body ?? campaign.copyBody ?? `Hi {{first_name}}, quick idea for {{company}}.`
    let body = fillCopy(bodyTpl, lead, campaign.project.senderName)
    if (isFollowup) {
      body = loc.followup(lead.name.split(" ")[0], lead.reasons || "this", lead.company, touchIndex >= campaign.maxTouches)
    }
    // tracked CTA link - appended to every email touch so clicks are measurable
    const ctaUrl = campaign.ctaUrl && /^https?:\/\//i.test(campaign.ctaUrl) ? campaign.ctaUrl : null
    if (channel === "email" && ctaUrl) body += `\n\n${ctaUrl}`

    // one-click unsubscribe token (RFC 8058) - created lazily per lead, mailed
    // in the List-Unsubscribe headers + opt-out footer of every email touch
    let unsubUrl: string | null = null
    if (channel === "email") {
      let token = lead.unsubToken
      if (!token) {
        token = randomBytes(16).toString("hex")
        await db.lead.update({ where: { id: lead.id }, data: { unsubToken: token } })
      }
      unsubUrl = `${baseUrl()}/api/unsubscribe/${token}`
      body += `\n\nNot relevant? One click to opt out: ${unsubUrl}`
    }

    // Message row is created first so the open-tracking pixel URL can
    // reference its id, then real delivery happens and the row is updated.
    const providerLive = isProviderConfigured()
    const linkedinLive = channel === "linkedin" && isLinkedinConfigured()
    const msg = await db.message.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        direction: "out",
        channel,
        kind: "touch",
        touchIndex,
        subject: channel === "email" ? subject : null,
        body,
        status: "sent", // provisional; finalized below
        variantId: variant?.id ?? null,
        deliveryStatus:
          (channel === "email" && providerLive) || linkedinLive ? "pending" : "simulated",
        provider: null,
      },
    })

    if (channel === "email" && providerLive) {
      let fromEmail = campaign.project.companyDomain
        ? `hello@${campaign.project.companyDomain}`
        : "hello@jidout.local"
      const dom =
        (await db.sendingDomain.findFirst({
          where: { projectId: campaign.projectId, status: "active" },
          orderBy: { createdAt: "asc" },
        })) ??
        (await db.sendingDomain.findFirst({
          where: { projectId: campaign.projectId, status: "warming" },
          orderBy: { createdAt: "asc" },
        }))
      if (dom) fromEmail = `hello@${dom.domain}`
      // HTML part: escaped body with the CTA wrapped in a click-tracker link,
      // an opt-out footer link, plus the open-tracking beacon.
      let htmlBody = escapeHtml(body)
      if (ctaUrl) {
        const tracked = `${baseUrl()}/api/click/${msg.id}?url=${encodeURIComponent(ctaUrl)}`
        htmlBody = htmlBody.replaceAll(
          escapeHtml(ctaUrl),
          `<a href="${tracked}" style="color:#0d9488">${escapeHtml(ctaUrl)}</a>`
        )
      }
      if (unsubUrl) {
        htmlBody = htmlBody.replaceAll(
          escapeHtml(unsubUrl),
          `<a href="${unsubUrl}" style="color:#94a3b8">${escapeHtml(unsubUrl)}</a>`
        )
      }
      const delivery = await deliverOutreach({
        to: lead.email,
        fromName: campaign.project.senderName,
        fromEmail,
        subject,
        text: body,
        headers: unsubUrl
          ? {
              "List-Unsubscribe": `<${unsubUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
        html:
          `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55">${htmlBody}</div>` +
          `<img src="${baseUrl()}/api/open/${msg.id}" width="1" height="1" alt="" style="display:none" />`,
      })
      await db.message.update({
        where: { id: msg.id },
        data: {
          deliveryStatus: delivery.deliveryStatus,
          provider: delivery.provider,
          providerMessageId: delivery.id ?? null,
          status: delivery.deliveryStatus === "failed" ? "bounced" : "sent",
        },
      })
    } else if (linkedinLive) {
      // real LinkedIn touch - DM shape: no subject, no unsubscribe footer.
      // API failures are retryable (unlike an SMTP hard bounce) so the message
      // stays "sent" and only the deliveryStatus records the failure.
      const delivery = await deliverLinkedInTouch({
        memberUrl: lead.linkedinUrl ?? "",
        senderName: campaign.project.senderName,
        text: body,
      })
      await db.message.update({
        where: { id: msg.id },
        data: {
          deliveryStatus: delivery.deliveryStatus,
          provider: delivery.provider,
          providerMessageId: delivery.id ?? null,
        },
      })
    } else if (channel === "email" && Math.random() < 0.03) {
      // simulated bounce in demo mode
      await db.message.update({ where: { id: msg.id }, data: { status: "bounced" } })
    }

    const nextTouchAt =
      touchIndex < campaign.maxTouches
        ? new Date(now.getTime() + campaign.delayDays * FOLLOWUP_MS_PER_DAY)
        : null

    const willReply =
      lead.replyDueAt === null &&
      Math.random() < (REPLY_CHANCE_BY_TOUCH[Math.min(touchIndex - 1, REPLY_CHANCE_BY_TOUCH.length - 1)] ?? 0.08)

    await db.lead.update({
      where: { id: lead.id },
      data: {
        touchCount: touchIndex,
        nextTouchAt,
        variantId: variant?.id ?? lead.variantId,
        replyDueAt: willReply ? new Date(now.getTime() + rand(15000, 55000)) : lead.replyDueAt,
        replyChannel: willReply ? "email" : lead.replyChannel,
      },
    })

    if (channel === "email") emails++
    else linkedin++
  }

  if (emails + linkedin > 0) {
    const cost = emails * perSendCost + linkedin * LINKEDIN_TOUCH_PRICE_USD
    let description = `${campaign.name}: ${emails} email${emails === 1 ? "" : "s"} sent`
    if (linkedin > 0) description += `, ${linkedin} LinkedIn touch${linkedin === 1 ? "" : "es"}`
    await charge(account.id, cost, description, { emails, linkedin, campaignId: campaign.id })
    pulse.sent += emails
    pulse.spent += cost

    // LinkedIn seat billing: once per month on first touch - never overdraw:
    // if the balance can't cover the seats, LinkedIn touches fall back to email.
    if (linkedin > 0 && account.linkedinSeatBilledMonth !== monthStr()) {
      const seatCost = account.linkedinSeats * LINKEDIN_SEAT_PRICE_USD
      const fresh = await db.billingAccount.findUnique({ where: { id: account.id } })
      if (fresh && fresh.prepaidBalanceUsd >= seatCost) {
        await db.billingAccount.update({
          where: { id: account.id },
          data: {
            prepaidBalanceUsd: fresh.prepaidBalanceUsd - seatCost,
            linkedinSeatBilledMonth: monthStr(),
          },
        })
        await db.creditTransaction.create({
          data: {
            accountId: account.id,
            type: "linkedin_seats",
            amountUsd: -seatCost,
            balanceAfter: fresh.prepaidBalanceUsd - seatCost,
            description: `LinkedIn seats - ${account.linkedinSeats} seat${account.linkedinSeats === 1 ? "" : "s"} (${monthStr()})`,
          },
        })
      } else if (fresh) {
        await db.campaign.update({
          where: { id: campaign.id },
          data: {
            nextAction: `LinkedIn seats not charged - balance below ${seatCost} USD; touches sent via email instead`,
          },
        })
      }
    }
  }

  // 5) completion check
  const approvedLeads = await db.lead.findMany({ where: { campaignId: campaign.id, status: "approved" } })
  const done = approvedLeads.every(
    (l) =>
      ["booked", "closed", "unsubscribed", "active"].includes(l.convStatus ?? "") ||
      (l.convStatus === null && l.touchCount >= campaign.maxTouches && !l.nextTouchAt)
  )
  if (approvedLeads.length > 0 && done) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { state: "completed", sendingNow: false, nextAction: "Campaign completed - review hot leads in the inbox" },
    })
  } else {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "Sending - sequences running on schedule" },
    })
  }
}

// -------------------------------------------------------- inbound processing

async function processInbound(
  campaign: { id: string; name: string; autopilotEnabled: boolean; autoReplyEnabled: boolean; autoReplyDelayMinutes: number; project: { userId: string } },
  lead: { id: string; name: string; company: string; email: string; convStatus: string | null; replyChannel: string | null; successFeeCharged: boolean },
  account: { id: string; pricingModel: string; warmLeadFeeUsd: number }
) {
  const now = new Date()
  let outcome: string
  if (lead.convStatus === "negotiating") {
    outcome = "negotiating"
  } else if (lead.convStatus === "question") {
    outcome = Math.random() < 0.5 ? "interested" : "not_interested"
  } else {
    outcome = pickWeighted(FIRST_REPLY_OUTCOMES)
  }

  const pool = INBOUND_TEXT[outcome] ?? INBOUND_TEXT.not_interested
  const text = pool[randInt(0, pool.length - 1)]

  await db.message.create({
    data: {
      campaignId: campaign.id,
      leadId: lead.id,
      direction: "in",
      channel: lead.replyChannel || "email",
      kind: "reply",
      body: text,
      status: "sent",
    },
  })

  const hot = outcome === "interested" || outcome === "negotiating"
  const updates: Record<string, unknown> = { replyDueAt: null, sentiment: outcome }
  switch (outcome) {
    case "interested":
      updates.convStatus = "interested"
      updates.isHot = true
      if (campaign.autopilotEnabled && campaign.autoReplyEnabled) {
        updates.agentDueAt = new Date(now.getTime() + Math.max(10, campaign.autoReplyDelayMinutes) * 1000)
        updates.agentStage = "propose_meeting"
      } else {
        updates.convStatus = "active"
      }
      break
    case "question":
      updates.convStatus = "question"
      if (campaign.autopilotEnabled && campaign.autoReplyEnabled) {
        updates.agentDueAt = new Date(now.getTime() + Math.max(10, campaign.autoReplyDelayMinutes) * 1000)
        updates.agentStage = "answer"
      } else {
        updates.convStatus = "active"
      }
      break
    case "not_interested":
      updates.convStatus = "closed"
      break
    case "unsubscribe":
      updates.convStatus = "unsubscribed"
      updates.status = "suppressed"
      // reply-based opt-out syncs to the account-wide suppression list too
      await suppressLeadOptOut(lead.id, lead.email, campaign.project.userId)
      break
    case "negotiating":
      // lead accepted the meeting
      updates.convStatus = "negotiating"
      updates.isHot = true
      updates.agentDueAt = new Date(now.getTime() + Math.max(10, campaign.autoReplyDelayMinutes) * 1000)
      updates.agentStage = "confirm"
      updates.meetingAt = new Date(now.getTime() + MEETING_LEAD_DAYS[randInt(0, 3)] * 24 * 3600 * 1000)
      break
    case "booked_confirm":
      updates.convStatus = "booked"
      break
  }

  await db.lead.update({ where: { id: lead.id }, data: updates })
  // per-result pricing: a warm lead (interested / negotiating / booked) bills
  // its success fee exactly once
  if (hot || outcome === "booked_confirm") {
    await chargeWarmLeadFee(account, campaign, lead)
  }
  await noteReplyEvent(account.id, hot)
}

// ------------------------------------------------------ autopilot processing

async function processAutopilot(
  campaign: { id: string; name: string; autoReplyDelayMinutes: number; offer: string; customerProblem: string; project: { companyName: string; senderName: string; bookingUrl: string } },
  lead: { id: string; name: string; company: string; convStatus: string | null; agentStage: string | null; meetingAt: Date | null; replyChannel: string | null; successFeeCharged: boolean },
  account: { id: string; pricingModel: string; warmLeadFeeUsd: number }
) {
  const now = new Date()
  const stage = lead.agentStage as "propose_meeting" | "confirm" | "answer"
  const companyName = campaign.project.companyName || "our team"

  // find the last inbound message to answer
  const lastIn = await db.message.findFirst({
    where: { leadId: lead.id, direction: "in" },
    orderBy: { createdAt: "desc" },
  })

  const slot = `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][randInt(0, 4)]}, ${["10:00", "11:30", "14:00", "15:30"][randInt(0, 3)]}`
  let text = await autopilotReply({
    companyName,
    offer: campaign.offer,
    customerProblem: campaign.customerProblem,
    leadName: lead.name,
    leadCompany: lead.company,
    leadMessage: lastIn?.body ?? "Interested in learning more.",
    stage,
    slot,
  })
  // confirm stage carries the calendar booking link so the lead can grab the
  // invite; the meeting itself lands on the workspace as an .ics-downloadable row
  if (stage === "confirm") {
    text += `\n\nCalendar invite: ${campaign.project.bookingUrl}`
  }

  await db.message.create({
    data: {
      campaignId: campaign.id,
      leadId: lead.id,
      direction: "out",
      channel: lead.replyChannel || "email",
      kind: "autopilot",
      touchIndex: 0,
      subject: null,
      body: text,
      status: "sent",
    },
  })

  const updates: Record<string, unknown> = { agentDueAt: null, agentStage: null }
  if (stage === "propose_meeting") {
    updates.convStatus = "negotiating"
    updates.replyDueAt = new Date(now.getTime() + rand(15000, 40000))
    updates.replyChannel = "email"
  } else if (stage === "confirm") {
    updates.convStatus = "booked"
    updates.meetingAt =
      lead.meetingAt ?? new Date(now.getTime() + MEETING_LEAD_DAYS[randInt(0, 3)] * 24 * 3600 * 1000)
  } else if (stage === "answer") {
    // lead decides after the answer
    updates.convStatus = "question"
    updates.replyDueAt = new Date(now.getTime() + rand(15000, 40000))
    updates.replyChannel = "email"
  }
  await db.lead.update({ where: { id: lead.id }, data: updates })
  if (stage === "confirm") {
    await db.meeting.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        startsAt: (updates.meetingAt as Date) ?? new Date(now.getTime() + MEETING_LEAD_DAYS[0] * 24 * 3600 * 1000),
        status: "confirmed",
        bookingUrl: campaign.project.bookingUrl,
        source: "autopilot",
      },
    })
    await chargeWarmLeadFee(account, campaign, lead)
  }
}

// ------------------------------------------------------- campaign actions

export async function campaignAction(campaignId: string, action: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error("Campaign not found")

  switch (action) {
    case "approve":
      await db.campaign.update({
        where: { id: campaignId },
        data: { state: "approved", nextAction: "Press Start to begin outreach" },
      })
      break
    case "start": {
      const owned = await db.sendingDomain.count({ where: { projectId: campaign.projectId, status: "active" } })
      if (owned === 0) {
        return { ok: false, error: "No active sending domains. Buy domains in the Domains tab first." }
      }
      await db.campaign.update({
        where: { id: campaignId },
        data: { state: "sending", sendingNow: true, nextAction: "Sending - sequences running on schedule" },
      })
      break
    }
    case "stop":
      await db.campaign.update({
        where: { id: campaignId },
        data: { sendingNow: false, state: "paused", nextAction: "Paused - press Resume to continue" },
      })
      break
    case "resume":
      await db.campaign.update({
        where: { id: campaignId },
        data: { sendingNow: true, state: "sending", nextAction: "Sending - sequences running on schedule" },
      })
      break
    case "archive":
      await db.campaign.update({
        where: { id: campaignId },
        data: { state: "archived", sendingNow: false, nextAction: "Archived" },
      })
      break
    case "unarchive":
      await db.campaign.update({
        where: { id: campaignId },
        data: { state: "paused", nextAction: "Paused - press Resume to continue" },
      })
      break
    default:
      return { ok: false, error: `Unknown action: ${action}` }
  }
  return { ok: true }
}

// ------------------------------------------------------------- manual reply

export async function manualReply(leadId: string, body: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { campaign: { include: { project: true } } },
  })
  if (!lead) throw new Error("Lead not found")
  const now = new Date()

  await db.message.create({
    data: {
      campaignId: lead.campaignId,
      leadId: lead.id,
      direction: "out",
      channel: "email",
      kind: "manual",
      subject: `Re: ${lead.campaign.copySubject || "our conversation"}`,
      body,
      status: "sent",
    },
  })

  // simulate the lead's reaction to the human reply
  const roll = Math.random()
  if (roll < 0.5) {
    const slot = `${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][randInt(0, 4)]}, ${["10:00", "11:30", "14:00", "15:30"][randInt(0, 3)]}`
    await db.message.create({
      data: {
        campaignId: lead.campaignId,
        leadId: lead.id,
        direction: "in",
        channel: "email",
        kind: "reply",
        body: `${slot} works - send the invite and I'll be there.`,
        status: "sent",
      },
    })
    await db.lead.update({
      where: { id: lead.id },
      data: {
        convStatus: "booked",
        isHot: true,
        sentiment: "interested",
        replyDueAt: null,
        agentDueAt: null,
        agentStage: null,
        meetingAt: new Date(now.getTime() + MEETING_LEAD_DAYS[randInt(0, 3)] * 24 * 3600 * 1000),
      },
    })
    const meetingStart = await db.lead.findUnique({ where: { id: lead.id }, select: { meetingAt: true } })
    await db.meeting.create({
      data: {
        campaignId: lead.campaignId,
        leadId: lead.id,
        startsAt: meetingStart?.meetingAt ?? new Date(now.getTime() + MEETING_LEAD_DAYS[0] * 24 * 3600 * 1000),
        status: "confirmed",
        bookingUrl: lead.campaign.project.bookingUrl || "https://cal.com/jidout-demo/intro",
        source: "manual",
      },
    })
    const manualAccount = await db.billingAccount.findUnique({ where: { userId: lead.campaign.project.userId } })
    if (manualAccount) {
      await chargeWarmLeadFee(manualAccount, lead.campaign, lead)
    }
  } else if (roll < 0.75) {
    await db.message.create({
      data: {
        campaignId: lead.campaignId,
        leadId: lead.id,
        direction: "in",
        channel: "email",
        kind: "reply",
        body: "Makes sense. One more thing - what does the rollout look like for a team our size, and who else typically needs to be involved?",
        status: "sent",
      },
    })
    await db.lead.update({
      where: { id: lead.id },
      data: { convStatus: "active", replyDueAt: null, agentDueAt: null, agentStage: null },
    })
  } else {
    await db.message.create({
      data: {
        campaignId: lead.campaignId,
        leadId: lead.id,
        direction: "in",
        channel: "email",
        kind: "reply",
        body: "Thanks for the details - we're going to pass for now, but I'll keep you in mind.",
        status: "sent",
      },
    })
    await db.lead.update({
      where: { id: lead.id },
      data: { convStatus: "closed", sentiment: "not_interested", replyDueAt: null, agentDueAt: null, agentStage: null },
    })
  }
  return { ok: true }
}
