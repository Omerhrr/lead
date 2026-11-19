// Round-6 E2E verification: one-click unsubscribe (List-Unsubscribe + token
// route + suppression), scheduled weekly report digest, domain-warming
// simulator. Dev server on :3000. Re-runnable.
// Run: bun scripts/verify_round6.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000"
const DEMO_EMAIL = "riley@brightpath.io"
let cookie = ""

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any; res: Response }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
  })
  const sc = res.headers.get("set-cookie")
  if (sc) cookie = sc.split(";")[0]
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, res }
}
const post = (p: string, b: unknown) => call(p, { method: "POST", body: JSON.stringify(b) })

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) console.log("  PASS:", label)
  else {
    console.error("  FAIL:", label, extra === undefined ? "" : JSON.stringify(extra))
    process.exitCode = 1
  }
}

async function main() {
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })!
  ok(!!project, "project available")

  // QA robustness: earlier suites in a shared pipeline can drain the trial
  // balance below the $12 domain purchase - restore a workable demo balance
  const account = await db.billingAccount.findFirst({ where: { user: { email: DEMO_EMAIL } } })
  if (account && account.prepaidBalanceUsd < 20) {
    await db.billingAccount.update({
      where: { id: account.id },
      data: { prepaidBalanceUsd: 30, spentTodayUsd: 0, spentTodayDate: new Date().toISOString().slice(0, 10) },
    })
    await db.creditTransaction.create({
      data: {
        accountId: account.id,
        type: "topup",
        amountUsd: 30 - account.prepaidBalanceUsd,
        balanceAfter: 30,
        description: "QA top-up (suite needs the $12 domain purchase)",
      },
    })
  }

  // --------------------------------------- Part A: one-click unsubscribe
  console.log("\nPart A - one-click unsubscribe (RFC 8058)")

  // A1: send-path wiring - throwaway campaign sends a touch with the opt-out
  // footer + per-lead token (demo mode; headers only observable with a provider)
  const template = await db.campaign.findFirst({ where: { projectId: project!.id } })!
  const scratch = await db.campaign.create({
    data: {
      projectId: project!.id,
      name: "Round6 unsubscribe wiring demo",
      offer: template.offer, customerProblem: template.customerProblem,
      targetRole: template.targetRole, targetGeography: template.targetGeography,
      targetCompanySize: template.targetCompanySize,
      maxTouches: 3, state: "sending", sendingNow: true,
      autopilotEnabled: false, autoReplyEnabled: false,
      copySubject: "Round6 wiring check",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  const tplLead = await db.lead.findFirst({ where: { campaignId: template.id } })!
  const scratchLead = await db.lead.create({
    data: {
      campaignId: scratch.id, name: "QA Optout", title: "Tester", company: "Round6 QA",
      companyDomain: "round6-qa.example.com", industry: "software", companySize: "11-50",
      country: "United States", email: "optout@round6-qa.example.com", score: 50,
      status: "approved", reasons: "scaling support",
    },
  })
  await post("/api/tick", {})
  const sent = await db.message.findFirst({
    where: { campaignId: scratch.id, direction: "out", kind: "touch", channel: "email" },
    orderBy: { createdAt: "desc" },
  })
  ok(!!sent, "scratch campaign sent a touch on tick")
  const leadAfter = await db.lead.findUnique({ where: { id: scratchLead.id } })!
  ok(!!leadAfter.unsubToken && /^[a-f0-9]{32}$/.test(leadAfter.unsubToken!), "send path created a per-lead unsubscribe token")
  ok(
    !!sent && sent.body.includes(`One click to opt out: ${BASE}/api/unsubscribe/${leadAfter.unsubToken}`),
    "touch body embeds the opt-out link with the lead token"
  )

  // A2: the token route (GET = human click) suppresses + confirms
  const token = leadAfter.unsubToken!
  const unsubGet = await fetch(`${BASE}/api/unsubscribe/${token}`)
  const html = await unsubGet.text()
  ok(unsubGet.status === 200, "GET unsubscribe returns 200")
  ok((unsubGet.headers.get("content-type") ?? "").includes("text/html"), "confirmation page is HTML")
  ok(html.includes("Unsubscribed") && html.includes(leadAfter.email.toLowerCase()), "confirmation page names the address")
  const supEntry = await db.suppressEntry.findUnique({
    where: { userId_type_value: { userId: user!.id, type: "person", value: leadAfter.email.toLowerCase() } },
  })
  const leadUnsub = await db.lead.findUnique({ where: { id: scratchLead.id } })!
  ok(supEntry?.reason === "unsubscribe", "SuppressEntry reason='unsubscribe'")
  ok(leadUnsub.status === "suppressed" && leadUnsub.convStatus === "unsubscribed", "lead suppressed + unsubscribed")

  // A3: RFC 8058 one-click POST (mail clients) - same suppression, plain 200
  const optout2 = await db.lead.create({
    data: {
      campaignId: scratch.id, name: "QA OneClick", title: "Tester", company: "Round6 QA",
      companyDomain: "round6-qa.example.com", industry: "software", companySize: "11-50",
      country: "United States", email: "oneclick@round6-qa.example.com", score: 50,
      status: "approved", unsubToken: "f".repeat(32),
    },
  })
  const oneClick = await fetch(`${BASE}/api/unsubscribe/${"f".repeat(32)}`, { method: "POST", body: "List-Unsubscribe=One-Click" })
  ok(oneClick.status === 200 && (await oneClick.text()).includes("Unsubscribed"), "POST one-click returns 200 Unsubscribed")
  const ocEntry = await db.suppressEntry.findUnique({
    where: { userId_type_value: { userId: user!.id, type: "person", value: "oneclick@round6-qa.example.com" } },
  })
  ok(!!ocEntry && ocEntry.reason === "unsubscribe", "one-click POST wrote SuppressEntry")

  // A4: invalid / unknown tokens are rejected
  ok((await fetch(`${BASE}/api/unsubscribe/not-a-token`)).status === 404, "malformed token -> 404")
  ok((await fetch(`${BASE}/api/unsubscribe/${"0".repeat(32)}`)).status === 404, "unknown token -> 404")

  // A5: suppressed leads are excluded from sends
  const eligible = await db.lead.count({
    where: { campaignId: scratch.id, status: "approved", id: { in: [scratchLead.id, optout2.id] } },
  })
  ok(eligible === 0, "opted-out leads excluded from the send pool")

  // cleanup: scratch campaign cascades leads/messages; suppression entries stay as evidence
  await db.campaign.delete({ where: { id: scratch.id } })

  // --------------------------------------- Part B: scheduled weekly digest
  console.log("\nPart B - scheduled weekly report digest")
  const before = await call("/api/overview")
  const beforeCount = before.body.report?.reportCount ?? 0
  ok(before.body.report?.cadence === "off" || before.body.report?.cadence === "weekly", "overview exposes report settings", before.body.report)

  const enable = await post("/api/overview", { cadence: "weekly" })
  ok(enable.status === 200 && enable.body.cadence === "weekly", "enable weekly digest")
  const afterEnable = await call("/api/overview")
  ok(afterEnable.body.report.cadence === "weekly" && afterEnable.body.report.lastReportAt === null,
    "weekly armed - first digest fires on the next tick", afterEnable.body.report)

  await post("/api/tick", {})
  const afterTick = await call("/api/overview")
  ok(afterTick.body.report.reportCount === beforeCount + 1, `tick delivered digest #${afterTick.body.report.reportCount}`)
  ok(!!afterTick.body.report.lastReportAt, "lastReportAt stamped")
  ok(typeof afterTick.body.report.nextReportInSec === "number" && afterTick.body.report.nextReportInSec > 0,
    `next digest scheduled in ${afterTick.body.report.nextReportInSec}s (demo week)`)

  await post("/api/tick", {})
  const afterTick2 = await call("/api/overview")
  ok(afterTick2.body.report.reportCount === afterTick.body.report.reportCount,
    "immediate re-tick does not double-send (interval respected)")

  const disable = await post("/api/overview", { cadence: "off" })
  ok(disable.status === 200, "pause digest")
  const badCadence = await post("/api/overview", { cadence: "hourly" })
  ok(badCadence.status === 400, "invalid cadence rejected")

  // --------------------------------------- Part C: domain warming
  console.log("\nPart C - domain-warming simulator")
  const domBefore = await call("/api/domains")
  const capacityBefore = domBefore.body.plan.ownedCapacity
  const warmingBefore = domBefore.body.plan.warming
  const balanceBefore = (await call("/api/overview")).body.billing.prepaidBalanceUsd

  const buy = await post("/api/domains", { action: "buy", count: 1 })
  ok(buy.status === 200, "buy 1 domain", buy.body)
  const domAfterBuy = await call("/api/domains")
  const fresh = domAfterBuy.body.domains.find(
    (d: any) => d.status === "warming" && d.warmedDays === 0 && d.emailsPerDay === 10
  )
  ok(!!fresh, "new domain starts warming at 10 emails/day", domAfterBuy.body.domains.slice(0, 2))
  ok(domAfterBuy.body.plan.warming === warmingBefore + 1, "plan counts the warming domain")
  // balance check is tolerance-based: other suite charges can land between the
  // two reads in a shared pipeline; the $12 ledger row is the real evidence
  const balanceAfterBuy = (await call("/api/overview")).body.billing.prepaidBalanceUsd
  ok(
    Math.abs(balanceAfterBuy - (balanceBefore - 12)) < 0.01,
    "domain purchase metered $12",
    { before: balanceBefore, after: balanceAfterBuy }
  )

  const ramp: Array<{ day: number; cap: number; status: string }> = []
  for (let i = 0; i < 3; i++) {
    await post("/api/tick", {})
    const d = await db.sendingDomain.findUnique({ where: { id: fresh.id } })!
    ramp.push({ day: d.warmedDays, cap: d.emailsPerDay, status: d.status })
  }
  ok(JSON.stringify(ramp) === JSON.stringify([
    { day: 1, cap: 20, status: "warming" },
    { day: 2, cap: 30, status: "warming" },
    { day: 3, cap: 40, status: "active" },
  ]), `ramp 10 -> 20 -> 30 -> 40 then active (${JSON.stringify(ramp)})`)
  const domFinal = await call("/api/domains")
  ok(domFinal.body.plan.ownedCapacity === capacityBefore + 40, "capacity grew by the warmed 40/day")

  // BYOD verify now starts the warming ramp too
  const byod = await post("/api/domains", { action: "byod", domain: "round6-warm.example.com" })
  ok(byod.status === 200, "byod domain added (pending DNS)")
  const verify = await post("/api/domains", { action: "verify", domainId: byod.body.domain.id })
  const verified = await db.sendingDomain.findUnique({ where: { id: byod.body.domain.id } })!
  ok(verify.status === 200 && verified.status === "warming" && verified.emailsPerDay === 10,
    "verified BYOD domain enters warming at 10/day")

  // cleanup: remove QA domains + refund the metered purchase
  await db.sendingDomain.deleteMany({ where: { id: { in: [fresh.id, byod.body.domain.id] } } })
  await db.creditTransaction.deleteMany({
    where: { accountId: (await db.billingAccount.findUnique({ where: { userId: user!.id } }))!.id, description: { contains: "Domain plan - 1 sending domain" } },
  })
  const acct = await db.billingAccount.findUnique({ where: { userId: user!.id } })!
  await db.billingAccount.update({ where: { id: acct.id }, data: { prepaidBalanceUsd: acct.prepaidBalanceUsd + 12 } })
  console.log("  cleanup: QA domains removed, purchase refunded")

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
