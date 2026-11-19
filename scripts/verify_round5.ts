// Round-5 E2E verification: per-link click breakdown, PDF summary report,
// bounce/complaint suppression sync. Dev server on :3000. Re-runnable.
// Run: bun scripts/verify_round5.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000"
const DEMO_EMAIL = "riley@brightpath.io"
const CTA = "https://cal.com/brightpath/demo?utm=jidout"
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

  const campaign = await db.campaign.findFirst({
    where: { projectId: project!.id, name: "Med spas - CTA clicks demo" },
  })
  ok(!!campaign, "CTA demo campaign available", campaign?.name)

  // ---------------------------------------------- Part A: per-link clicks
  console.log("\nPart A - per-link click breakdown")
  const msg = await db.message.findFirst({
    where: { campaignId: campaign!.id, direction: "out", kind: "touch", channel: "email" },
    orderBy: { createdAt: "desc" },
  })
  ok(!!msg, "touch message available for click test")

  // real click-route hit -> ClickEvent row
  const clk = await fetch(`${BASE}/api/click/${msg!.id}?url=${encodeURIComponent(CTA)}`, { redirect: "manual" })
  ok(clk.status === 302, "click route 302")
  const evRoute = await db.clickEvent.findFirst({
    where: { messageId: msg!.id, url: CTA },
    orderBy: { createdAt: "desc" },
  })
  ok(!!evRoute, "click route wrote a ClickEvent row with the target URL")

  // webhook click with a distinct link -> ClickEvent row
  const fx = await db.message.create({
    data: {
      campaignId: campaign!.id, leadId: (await db.lead.findFirst({ where: { campaignId: campaign!.id } }))!.id,
      direction: "out", channel: "email", kind: "touch", touchIndex: 1,
      subject: "round5 fixture", body: "fixture", status: "sent",
      deliveryStatus: "delivered", provider: "resend", providerMessageId: "re_round5_click",
    },
  })
  const deepLink = "https://brightpath.io/pricing?utm=email"
  const wh = (b: unknown) =>
    fetch(`${BASE}/api/webhooks/resend`, { method: "POST", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } })
  const r1 = await wh({ type: "email.clicked", data: { email_id: "re_round5_click", click: { link: deepLink } } })
  const evWh = await db.clickEvent.findFirst({ where: { messageId: fx.id, url: deepLink } })
  ok(r1.status === 200 && !!evWh, "webhook email.clicked wrote a ClickEvent row with the link")

  // campaign API exposes topLinks aggregated by URL
  const det = await call(`/api/campaigns/${campaign!.id}`)
  const topLinks = det.body.campaign.topLinks as Array<{ url: string; clicks: number }>
  ok(Array.isArray(topLinks) && topLinks.length > 0, "campaign API returns topLinks", topLinks)
  const ctaEntry = topLinks.find((l) => l.url === CTA)
  ok(!!ctaEntry && ctaEntry.clicks >= 1, `topLinks contains the CTA (${ctaEntry?.clicks ?? 0} clicks)`)
  const deepEntry = topLinks.find((l) => l.url === deepLink)
  ok(!!deepEntry && deepEntry.clicks === 1, "topLinks contains the webhook deep link (1 click)")

  // ---------------------------------------------- Part B: PDF report
  console.log("\nPart B - PDF summary report")
  const pdfRes = await fetch(`${BASE}/api/campaigns/${campaign!.id}/report-pdf`, { headers: { cookie } })
  const buf = Buffer.from(await pdfRes.arrayBuffer())
  ok(pdfRes.status === 200, "report-pdf returns 200")
  ok((pdfRes.headers.get("content-type") ?? "").includes("application/pdf"), "content-type application/pdf")
  ok((pdfRes.headers.get("content-disposition") ?? "").includes(".pdf"), "attachment filename .pdf")
  ok(buf.subarray(0, 4).toString() === "%PDF", "payload starts with %PDF magic")
  ok(buf.length > 2000, `PDF non-trivial size (${buf.length} bytes)`)
  const pdf3 = await fetch(`${BASE}/api/campaigns/${campaign!.id}/report-pdf`)
  ok(pdf3.status === 401, "report-pdf without session -> 401")

  // ------------------------------------- Part C: bounce/complaint suppression
  console.log("\nPart C - bounce + complaint suppression sync")
  const qaDomain = "round5-qa.example.com"
  const lead = await db.lead.upsert({
    where: { id: (await db.lead.findFirst({ where: { campaignId: campaign!.id, companyDomain: qaDomain } }))?.id ?? "none" },
    update: { status: "approved" },
    create: {
      campaignId: campaign!.id, name: "QA Bounce", title: "Tester", company: "Round5 QA",
      companyDomain: qaDomain, industry: "software", companySize: "11-50", country: "United States",
      email: "bounce@round5-qa.example.com", score: 50, status: "approved",
    },
  })
  const bounceMsg = await db.message.create({
    data: {
      campaignId: campaign!.id, leadId: lead.id, direction: "out", channel: "email",
      kind: "touch", touchIndex: 1, subject: "bounce fixture", body: "fixture", status: "sent",
      deliveryStatus: "delivered", provider: "resend", providerMessageId: "re_round5_bounce",
    },
  })
  const r2 = await wh({ type: "email.bounced", data: { email_id: "re_round5_bounce" } })
  const afterBounce = await db.message.findUnique({ where: { id: bounceMsg.id } })!
  const leadAfter = await db.lead.findUnique({ where: { id: lead.id } })!
  const seBounce = await db.suppressEntry.findUnique({
    where: { userId_type_value: { userId: user.id, type: "person", value: lead.email.toLowerCase() } },
  })
  ok(r2.status === 200, "webhook email.bounced accepted")
  ok(afterBounce.status === "bounced" && afterBounce.deliveryStatus === "failed", "message flipped to bounced/failed")
  ok(leadAfter.status === "suppressed", "lead suppressed")
  ok(!!seBounce && seBounce.reason === "hard bounce", `SuppressEntry reason="${seBounce?.reason}"`)

  const r3 = await wh({ type: "email.complained", data: { email_id: "re_round5_bounce" } })
  const seAfter = await db.suppressEntry.findUnique({
    where: { userId_type_value: { userId: user.id, type: "person", value: lead.email.toLowerCase() } },
  })
  ok(r3.status === 200 && seAfter?.reason === "spam complaint", "email.complained updates the suppression reason")

  // engine never mails suppressed leads: eligible query filters status=approved
  const eligible = await db.lead.count({
    where: { campaignId: campaign!.id, status: "approved", id: lead.id },
  })
  ok(eligible === 0, "suppressed lead excluded from sends")

  // cleanup fixtures (suppression entry + suppressed lead stay as evidence)
  await db.message.deleteMany({ where: { id: { in: [fx.id, bounceMsg.id] } } })

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
