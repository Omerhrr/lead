// Round-4 E2E verification: tracked CTA clicks, CSV report export, Resend
// webhook events. Dev server on :3000. Run: bun scripts/verify_round4.ts
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
const patchC = (p: string, b: unknown) => call(p, { method: "PATCH", body: JSON.stringify(b) })

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) console.log("  PASS:", label)
  else {
    console.error("  FAIL:", label, extra === undefined ? "" : JSON.stringify(extra))
    process.exitCode = 1
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })

  // reuse the live three-arm campaign
  // The three-arm campaign has exhausted its sequence (all leads at max
  // touches), so click flow is verified on a fresh campaign whose first
  // touches carry the CTA from the start.
  console.log("\nPart A - tracked CTA link + click stats")
  const existingCta = await db.campaign.findFirst({
    where: { projectId: project!.id, name: "Med spas - CTA clicks demo" },
  })
  let created: { status: number; body: any }
  if (existingCta) {
    created = { status: 200, body: { campaign: existingCta } }
    console.log("  reusing CTA demo campaign from a previous run:", existingCta.id)
  } else {
    created = await post("/api/campaigns", {
    name: "Med spas - CTA clicks demo",
    offer: "AI receptionist that books med-spa appointments 24/7",
    customerProblem: "front desks miss after-hours calls and lose bookings",
    targetRole: "Founder, Practice Manager",
    targetGeography: "United States",
    targetCompanySize: "11-50",
    keywords: "med spa, aesthetics",
    })
    ok(created.status === 200, "CTA demo campaign created", created.body)
  }
  const id = created.body.campaign.id as string

  const patched = await patchC(`/api/campaigns/${id}`, { ctaUrl: CTA })
  ok(patched.status === 200, "ctaUrl saved", patched.body)
  const bad = await patchC(`/api/campaigns/${id}`, { ctaUrl: "javascript:alert(1)" })
  const afterBad = (await db.campaign.findUnique({ where: { id } }))!
  ok(bad.status === 200 && !afterBad.ctaUrl, "javascript: URL rejected (cleared to empty)")
  await patchC(`/api/campaigns/${id}`, { ctaUrl: CTA })

  const curState = (await db.campaign.findUnique({ where: { id } }))!.state
  if (curState === "draft" || curState === "pool_ready") {
    const appr = await post(`/api/campaigns/${id}/actions`, { action: "approve_leads", all: true })
    ok(appr.status === 200, "approved all pool leads", appr.body)
    const start = await post(`/api/campaigns/${id}/actions`, { action: "start" })
    ok(start.status === 200, "campaign started", start.body)
  } else {
    console.log("  campaign already", curState, "- skipping approve/start")
  }

  process.stdout.write("  ticking: ")
  for (let i = 0; i < 30; i++) {
    const t = await post("/api/tick", {})
    if (t.status !== 200) { console.log(`tick ${i} -> ${t.status}`); break }
    process.stdout.write(".")
    await sleep(500)
  }
  console.log("")

  const det = await call(`/api/campaigns/${id}`)
  const stats = det.body.campaign.variantStats as any[]
  ok(Array.isArray(stats), "stats array present (no variants on this campaign)")
  const sentN = await db.message.count({ where: { campaignId: id, direction: "out", kind: "touch", channel: "email" } })
  const openedN = await db.message.count({ where: { campaignId: id, direction: "out", kind: "touch", opens: { gt: 0 } } })
  const clickedN = await db.message.count({ where: { campaignId: id, direction: "out", kind: "touch", clicks: { gt: 0 } } })
  console.log(`    messages: sent=${sentN} opened=${openedN} clicked=${clickedN}`)
  ok(clickedN > 0, "demo-mode clicks recorded (opened messages clicked the CTA)")
  ok(openedN > clickedN, "open rate exceeds click rate (funnel sanity)")

  const recent = await db.message.findFirst({
    where: { campaignId: id, direction: "out", kind: "touch", channel: "email", touchIndex: 1 },
    orderBy: { createdAt: "desc" },
  })
  ok(!!recent && recent.body.includes(CTA), "new touches embed the CTA link")

  // click endpoint
  const before = (await db.message.findUnique({ where: { id: recent!.id } }))!.clicks
  const clk = await fetch(`${BASE}/api/click/${recent!.id}?url=${encodeURIComponent(CTA)}`, { redirect: "manual" })
  ok(clk.status === 302 && clk.headers.get("location") === CTA, "click route 302 -> CTA target")
  const mid = (await db.message.findUnique({ where: { id: recent!.id } }))!
  ok(mid.clicks === before + 1 && !!mid.clickedAt, `clicks incremented ${before} -> ${mid.clicks}`)
  const bad2 = await fetch(`${BASE}/api/click/${recent!.id}?url=javascript:alert(1)`, { redirect: "manual" })
  ok(bad2.status === 400, "unsafe click target rejected")

  // ---------------------------------------------------------- CSV report
  console.log("\nPart B - CSV report export")
  const threeArm = await db.campaign.findFirst({
    where: { projectId: project!.id, name: "Med spas - three-way copy test" },
  })
  ok(!!threeArm, "three-arm campaign available for variant attribution")
  const rep = await fetch(`${BASE}/api/campaigns/${threeArm!.id}/report`, { headers: { cookie } })
  const csv = await rep.text()
  const lines = csv.trim().split(/\r?\n/)
  ok(rep.status === 200 && (rep.headers.get("content-type") ?? "").includes("text/csv"), "report is text/csv")
  ok((rep.headers.get("content-disposition") ?? "").includes(".csv"), "attachment filename set")
  const leads = await db.lead.count({ where: { campaignId: threeArm!.id } })
  ok(lines.length === leads + 1, `rows = leads(${leads}) + header`, lines.length)
  ok(lines[0].includes("Variant") && lines[0].includes("Clicks"), "header has Variant + Clicks columns")
  const variantCol = lines[0].split(",").indexOf("Variant")
  const withVariant = lines.slice(1).filter((l) => l.split(",")[variantCol] !== "").length
  ok(withVariant > 0, `variant attribution populated (${withVariant} rows)`)

  // ------------------------------------------------- Resend webhook events
  console.log("\nPart C - Resend webhook (open + click)")
  const fx = await db.message.create({
    data: {
      campaignId: id, leadId: (await db.lead.findFirst({ where: { campaignId: id } }))!.id,
      direction: "out", channel: "email", kind: "touch", touchIndex: 1,
      subject: "webhook fixture", body: "fixture", status: "sent",
      deliveryStatus: "delivered", provider: "resend", providerMessageId: "re_fixture_round4",
    },
  })
  const wh = (b: unknown) =>
    fetch(`${BASE}/api/webhooks/resend`, { method: "POST", body: JSON.stringify(b), headers: { "Content-Type": "application/json" } })
  const r1 = await wh({ type: "email.opened", data: { email_id: "re_fixture_round4" } })
  const m1 = (await db.message.findUnique({ where: { id: fx.id } }))!
  ok(r1.status === 200 && m1.opens === 1 && !!m1.openedAt, "email.opened -> opens+1")
  const r2 = await wh({ type: "email.clicked", data: { email_id: "re_fixture_round4", click: { link: CTA } } })
  const m2 = (await db.message.findUnique({ where: { id: fx.id } }))!
  ok(r2.status === 200 && m2.clicks === 1 && !!m2.clickedAt, "email.clicked -> clicks+1")
  // email.bounced is handled since round 5 (suppression sync) - use an
  // event type outside the handled set to assert the ignore path
  const r3 = await wh({ type: "email.delivery_delayed", data: { email_id: "re_fixture_round4" } })
  ok(r3.status === 200 && (await r3.json()).ignored === "email.delivery_delayed", "unhandled event ignored")
  const r4 = await wh({ type: "email.opened", data: { email_id: "re_unknown" } })
  ok(r4.status === 200 && (await r4.json()).matched === false, "unknown email_id acknowledged")
  const r5 = await post("/api/webhooks/resend", { type: "email.opened" })
  ok(r5.status === 400, "missing email_id rejected")
  const r6 = await fetch(`${BASE}/api/webhooks/resend`, { method: "POST", body: "not-json{", headers: { "Content-Type": "application/json" } })
  ok(r6.status === 400, "malformed payload rejected")
  await db.message.delete({ where: { id: fx.id } })

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
