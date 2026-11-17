import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import {
  DOMAIN_PRICE_USD,
  EMAILS_PER_DOMAIN_DAY,
  MAILBOXES_PER_DOMAIN,
  EMAIL_PRICE_USD,
} from "@/lib/constants"

export const dynamic = "force-dynamic"

// DomainPlan — the platform buys sending domains for rotation; BYOD supported.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const project = await db.project.findFirst({
    where: { userId: user.id },
    include: { sendingDomains: true },
  })
  if (!project) return Response.json({ error: "No project" }, { status: 400 })

  const sendingCampaigns = await db.campaign.findMany({
    where: { projectId: project.id, state: { in: ["approved", "sending", "paused"] } },
  })
  const targetEmailsPerDay = sendingCampaigns.reduce(
    (sum, c) => sum + Math.round(c.dailyBudgetUsd / (EMAIL_PRICE_USD || 0.04)),
    0
  )
  const activeDomains = project.sendingDomains.filter((d) => d.status === "active")
  const ownedCapacity = activeDomains.reduce((sum, d) => sum + d.emailsPerDay, 0)
  const domainsNeeded = Math.ceil(targetEmailsPerDay / EMAILS_PER_DOMAIN_DAY)
  const toBuy = Math.max(0, domainsNeeded - activeDomains.length)

  return Response.json({
    domains: project.sendingDomains.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    plan: {
      targetEmailsPerDay,
      emailsPerDomainDay: EMAILS_PER_DOMAIN_DAY,
      mailboxesPerDomain: MAILBOXES_PER_DOMAIN,
      domainsNeeded,
      owned: activeDomains.length,
      ownedCapacity,
      toBuy,
      pricePerDomainUsd: DOMAIN_PRICE_USD,
      estimatedCostUsd: toBuy * DOMAIN_PRICE_USD,
    },
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) return Response.json({ error: "No project" }, { status: 400 })
  const account = await db.billingAccount.findUnique({ where: { userId: user.id } })
  if (!account) return Response.json({ error: "No billing account" }, { status: 400 })

  const action = String(body?.action ?? "")
  if (action === "buy") {
    const count = Math.max(1, Math.min(20, Number(body?.count ?? 1)))
    const cost = count * DOMAIN_PRICE_USD
    if (account.prepaidBalanceUsd < cost) {
      return Response.json(
        { error: `Not enough credits — need ${cost} USD, balance ${account.prepaidBalanceUsd.toFixed(2)} USD` },
        { status: 400 }
      )
    }
    const existing = await db.sendingDomain.findMany({ where: { projectId: project.id } })
    const created: Array<{
      projectId: string
      domain: string
      source: string
      status: string
      emailsPerDay: number
      mailboxes: number
    }> = []
    for (let i = 0; i < count; i++) {
      const n = existing.length + i + 1
      const domain = `m${n}${project.companyDomain.replace(/\..+$/, "")}-mail.${project.companyDomain.split(".").slice(-2).join(".") || "outreach.com"}`
      created.push({
        projectId: project.id,
        domain,
        source: "platform",
        status: "active",
        emailsPerDay: EMAILS_PER_DOMAIN_DAY,
        mailboxes: MAILBOXES_PER_DOMAIN,
      })
    }
    await db.sendingDomain.createMany({ data: created })
    const balanceAfter = account.prepaidBalanceUsd - cost
    await db.billingAccount.update({
      where: { id: account.id },
      data: { prepaidBalanceUsd: balanceAfter },
    })
    await db.creditTransaction.create({
      data: {
        accountId: account.id,
        type: "domain_purchase",
        amountUsd: -cost,
        balanceAfter,
        description: `Domain plan — ${count} sending domain${count === 1 ? "" : "s"} + ${count * MAILBOXES_PER_DOMAIN} mailboxes`,
      },
    })
    return Response.json({ ok: true, bought: count, balanceAfter })
  }

  if (action === "byod") {
    const domain = String(body?.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return Response.json({ error: "Enter a valid domain, e.g. mail.yourbrand.com" }, { status: 400 })
    }
    const dupe = await db.sendingDomain.findFirst({ where: { projectId: project.id, domain } })
    if (dupe) return Response.json({ error: "Domain already added" }, { status: 400 })
    const created = await db.sendingDomain.create({
      data: {
        projectId: project.id,
        domain,
        source: "byod",
        status: "pending_dns",
        emailsPerDay: EMAILS_PER_DOMAIN_DAY,
        mailboxes: MAILBOXES_PER_DOMAIN,
      },
    })
    return Response.json({ ok: true, domain: created })
  }

  if (action === "verify") {
    const domainId = String(body?.domainId ?? "")
    const record = await db.sendingDomain.findUnique({ where: { id: domainId } })
    if (!record || record.projectId !== project.id) {
      return Response.json({ error: "Not found" }, { status: 404 })
    }
    await db.sendingDomain.update({
      where: { id: domainId },
      data: { status: "active" },
    })
    return Response.json({ ok: true })
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
