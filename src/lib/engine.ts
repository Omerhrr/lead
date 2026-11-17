// Agent engine — reconstructs explee's outreach loop from the reverse-
// engineered API semantics: brief → lead pool → approve → state machine
// sends → autopilot replies → booked meetings, with credit metering.
// Time is compressed: one 4s tick ~= a working chunk of a campaign day.

import { db } from "@/lib/db"
import { autopilotReply } from "@/lib/ai"
import {
  EMAIL_PRICE_USD,
  LINKEDIN_TOUCH_PRICE_USD,
  LINKEDIN_SEAT_PRICE_USD,
  EMAILS_PER_DOMAIN_DAY,
} from "@/lib/constants"
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

async function charge(accountId: string, costUsd: number, description: string, opts: { emails: number; linkedin: number }) {
  const account = await db.billingAccount.findUnique({ where: { id: String(accountId) } })
  if (!account) return
  await db.billingAccount.update({
    where: { id: account.id },
    data: {
      prepaidBalanceUsd: account.prepaidBalanceUsd - costUsd,
      spentTodayUsd: account.spentTodayUsd + costUsd,
      spentThisMonthUsd: account.spentThisMonthUsd + costUsd,
    },
  })
  await db.creditTransaction.create({
    data: {
      accountId: account.id,
      type: "spend",
      amountUsd: -costUsd,
      balanceAfter: account.prepaidBalanceUsd - costUsd,
      description,
    },
  })
  const date = todayStr()
  const existing = await db.usageDaily.findUnique({
    where: { accountId_date: { accountId: account.id, date } },
  })
  if (existing) {
    await db.usageDaily.update({
      where: { id: existing.id },
      data: {
        emailsSent: existing.emailsSent + opts.emails,
        linkedinTouches: existing.linkedinTouches + opts.linkedin,
        spendUsd: existing.spendUsd + costUsd,
      },
    })
  } else {
    await db.usageDaily.create({
      data: {
        accountId: account.id,
        date,
        emailsSent: opts.emails,
        linkedinTouches: opts.linkedin,
        spendUsd: costUsd,
      },
    })
  }
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
    "Hi! This is actually really timely — we've been looking at solving exactly this. Happy to hear more. What does pricing look like?",
    "Interesting — we have this problem on our list for this quarter. Do you have 15 minutes this week?",
    "I'd be up for a quick chat. Thursday or Friday afternoon works on my end.",
  ],
  question: [
    "Thanks for reaching out. Quick question — how does this integrate with what we already run? We're on a mixed stack.",
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
  return { ok: true, ...pulse }
}

async function campaignCapacity(campaignId: string, projectId: string) {
  const domains = await db.sendingDomain.findMany({
    where: { projectId, status: "active" },
  })
  return domains.reduce((sum, d) => sum + d.emailsPerDay, 0)
}

async function advanceCampaign(
  campaign: { id: string; projectId: string; maxTouches: number; delayDays: number; autopilotEnabled: boolean; autoReplyEnabled: boolean; autoReplyDelayMinutes: number; copySubject: string | null; copyBody: string | null; dailyBudgetUsd: number; name: string; offer: string; customerProblem: string; project: { senderName: string; companyName: string } },
  account: { id: string; prepaidBalanceUsd: number; spentTodayUsd: number; spentThisMonthUsd: number; monthlyCapUsd: number; dailyBudgetUsd: number; emailPriceUsd: number; linkedinSeats: number; linkedinSeatBilledMonth: string },
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
      await processAutopilot(campaign, lead)
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
      data: { nextAction: "Out of credits — top up billing to resume outreach" },
    })
    return
  }
  if (!monthlyOk) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "Monthly cap reached — raise the cap in billing" },
    })
    return
  }
  if (!dailyOk) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: `Daily budget reached (${campaign.dailyBudgetUsd} USD) — resumes next cycle` },
    })
    return
  }
  if (capacity === 0) {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "No active sending domains — buy domains in the Domains tab" },
    })
    return
  }

  // 4) sends (first touches + follow-ups)
  const eligible = await db.lead.findMany({
    where: {
      campaignId: campaign.id,
      status: "approved",
      convStatus: null,
      OR: [
        { touchCount: 0 },
        { nextTouchAt: { lte: now }, touchCount: { lt: campaign.maxTouches } },
      ],
    },
    orderBy: [{ touchCount: "asc" }, { score: "desc" }],
    take: quota,
  })

  let emails = 0
  let linkedin = 0
  for (const lead of eligible) {
    const isFollowup = lead.touchCount > 0
    const seatDue = account.linkedinSeatBilledMonth !== monthStr()
    const seatCost = account.linkedinSeats * LINKEDIN_SEAT_PRICE_USD
    const seatAffordable = !seatDue || account.prepaidBalanceUsd >= seatCost + perSendCost
    const useLinkedin = !!lead.linkedinUrl && lead.touchCount >= 1 && seatAffordable && Math.random() < 0.3
    const channel = useLinkedin ? "linkedin" : "email"
    const touchIndex = lead.touchCount + 1

    const subject = isFollowup
      ? touchIndex === 2
        ? `Re: ${(campaign.copySubject || "Quick question").replace(/^Re:\s*/i, "")}`
        : `Following up (last one, promise)`
      : (campaign.copySubject || "Quick question")
    const bodyTpl = campaign.copyBody || `Hi {{first_name}}, quick idea for {{company}}.`
    let body = fillCopy(bodyTpl, lead, campaign.project.senderName)
    if (isFollowup) {
      body = `Hi ${lead.name.split(" ")[0]}, just floating this back to the top of your inbox — happy to share how similar teams fixed "${lead.reasons || "this"}" with us.\n\nWorth 15 minutes?`
      if (touchIndex >= campaign.maxTouches) body += `\n\nI'll close the loop on my end either way — good luck with ${lead.company}!`
    }

    await db.message.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        direction: "out",
        channel,
        kind: "touch",
        touchIndex,
        subject: channel === "email" ? subject : null,
        body,
        status: Math.random() < 0.03 ? "bounced" : "sent",
      },
    })

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
    await charge(account.id, cost, description, { emails, linkedin })
    pulse.sent += emails
    pulse.spent += cost

    // LinkedIn seat billing: once per month on first touch — never overdraw:
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
            description: `LinkedIn seats — ${account.linkedinSeats} seat${account.linkedinSeats === 1 ? "" : "s"} (${monthStr()})`,
          },
        })
      } else if (fresh) {
        await db.campaign.update({
          where: { id: campaign.id },
          data: {
            nextAction: `LinkedIn seats not charged — balance below ${seatCost} USD; touches sent via email instead`,
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
      data: { state: "completed", sendingNow: false, nextAction: "Campaign completed — review hot leads in the inbox" },
    })
  } else {
    await db.campaign.update({
      where: { id: campaign.id },
      data: { nextAction: "Sending — sequences running on schedule" },
    })
  }
}

// -------------------------------------------------------- inbound processing

async function processInbound(
  campaign: { id: string; autopilotEnabled: boolean; autoReplyEnabled: boolean; autoReplyDelayMinutes: number },
  lead: { id: string; name: string; company: string; convStatus: string | null; replyChannel: string | null },
  account: { id: string }
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
  await noteReplyEvent(account.id, hot)
}

// ------------------------------------------------------ autopilot processing

async function processAutopilot(
  campaign: { id: string; autoReplyDelayMinutes: number; offer: string; customerProblem: string; project: { companyName: string; senderName: string } },
  lead: { id: string; name: string; company: string; convStatus: string | null; agentStage: string | null; meetingAt: Date | null; replyChannel: string | null }
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
  const text = await autopilotReply({
    companyName,
    offer: campaign.offer,
    customerProblem: campaign.customerProblem,
    leadName: lead.name,
    leadCompany: lead.company,
    leadMessage: lastIn?.body ?? "Interested in learning more.",
    stage,
    slot,
  })

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
        data: { state: "sending", sendingNow: true, nextAction: "Sending — sequences running on schedule" },
      })
      break
    }
    case "stop":
      await db.campaign.update({
        where: { id: campaignId },
        data: { sendingNow: false, state: "paused", nextAction: "Paused — press Resume to continue" },
      })
      break
    case "resume":
      await db.campaign.update({
        where: { id: campaignId },
        data: { sendingNow: true, state: "sending", nextAction: "Sending — sequences running on schedule" },
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
        data: { state: "paused", nextAction: "Paused — press Resume to continue" },
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
        body: `${slot} works — send the invite and I'll be there.`,
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
  } else if (roll < 0.75) {
    await db.message.create({
      data: {
        campaignId: lead.campaignId,
        leadId: lead.id,
        direction: "in",
        channel: "email",
        kind: "reply",
        body: "Makes sense. One more thing — what does the rollout look like for a team our size, and who else typically needs to be involved?",
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
        body: "Thanks for the details — we're going to pass for now, but I'll keep you in mind.",
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
