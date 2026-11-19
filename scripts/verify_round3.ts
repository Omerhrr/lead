// Round-3 E2E verification: multi-arm splits (A/B/C), reply-rate
// auto-promotion, open tracking (simulated + pixel). Dev server on :3000.
// Run: bun scripts/verify_round3.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000"
const DEMO_EMAIL = "riley@brightpath.io"
let cookie = ""

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
  })
  const sc = res.headers.get("set-cookie")
  if (sc) cookie = sc.split(";")[0]
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
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
  // ---------------------------------------------------------------- login
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })
  ok(!!project, "project exists")

  // ------------------------------------------------- prerequisites (domain/budget)
  const activeDomains = await db.sendingDomain.count({ where: { projectId: project!.id, status: "active" } })
  if (activeDomains === 0) {
    const bought = await post("/api/domains", { action: "buy", count: 2 })
    ok(bought.status === 200, "bought 2 sending domains", bought.body)
  } else {
    console.log(`  domains: ${activeDomains} active already`)
  }
  const acct = await db.billingAccount.findUnique({ where: { userId: (await db.user.findUnique({ where: { email: DEMO_EMAIL } }))!.id } })!
  console.log(`  balance: $${acct.prepaidBalanceUsd.toFixed(2)}`)
  if (acct.prepaidBalanceUsd < 8) {
    const top = await post("/api/billing/topup", { amountUsd: 20 })
    ok(top.status === 200, "topup $20", top.body)
  }

  // ============================ PART A - live 3-arm split over the engine ===
  console.log("\nPart A - three-arm live split test")
  const existing = await db.campaign.findFirst({
    where: { projectId: project!.id, name: "Med spas - three-way copy test" },
  })
  let id: string
  if (existing) {
    id = existing.id
    console.log("  reusing campaign from a previous run:", id)
  } else {
    const created = await post("/api/campaigns", {
    name: "Med spas - three-way copy test",
    offer: "AI receptionist that books med-spa appointments 24/7",
    customerProblem: "front desks miss after-hours calls and lose bookings",
    targetRole: "Founder, Practice Manager",
    targetGeography: "United States",
    targetCompanySize: "11-50",
    keywords: "med spa, aesthetics",
    })
    ok(created.status === 200, "campaign created (AI brief + pool)", created.body)
    id = created.body.campaign.id as string
  }

  if (!(await db.copyVariant.count({ where: { campaignId: id } }))) {
    await patchC(`/api/campaigns/${id}`, { variantTest: true }) // seeds A + B
    const addC = await patchC(`/api/campaigns/${id}`, { addVariant: true }) // adds C (AI angle)
    ok(addC.status === 200, "variant C added", addC.body)
  }
  let det = await call(`/api/campaigns/${id}`)
  const labels = det.body.campaign.variants.map((v: any) => v.label).sort().join(",")
  ok(labels === "A,B,C", "variants are A,B,C", labels)

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
  for (let i = 0; i < 36; i++) {
    const t = await post("/api/tick", {})
    if (t.status !== 200) { console.log(`tick ${i} -> ${t.status}`, t.body); break }
    process.stdout.write(".")
    await sleep(450)
  }
  console.log("")

  det = await call(`/api/campaigns/${id}`)
  const stats = det.body.campaign.variantStats as any[]
  console.log("  variant stats:")
  for (const s of stats) {
    console.log(
      `    ${s.label}: assigned=${s.assigned} sent=${s.sent} opens=${s.opened}` +
      ` (${Math.round(s.openRate * 100)}%) replies=${s.replied} (${Math.round(s.replyRate * 100)}%)` +
      ` hot=${s.hot} booked=${s.booked}`
    )
  }
  ok(stats.length === 3, "3 arms reporting stats")
  const assigned = stats.map((s) => s.assigned)
  ok(Math.max(...assigned) - Math.min(...assigned) <= 1, `balanced assignment ${assigned.join("/")}`)
  ok(stats.filter((s) => s.sent > 0).length >= 2, "at least 2 arms have sends")
  ok(stats.some((s) => s.opened > 0), "opens recorded in demo mode")
  const st2 = det.body.campaign.splitTest
  console.log(`  splitTest: leader=${st2?.leader} p=${st2?.pValue?.toFixed(3) ?? "-"} significant=${st2?.significant}`)
  ok(!!st2, "split test evaluation present")

  // --------------------------------------------- pixel endpoint (real mode)
  console.log("\nPixel endpoint")
  const touch = await db.message.findFirst({
    where: { campaignId: id, direction: "out", kind: "touch", channel: "email" },
    orderBy: { createdAt: "asc" },
  })
  ok(!!touch, "found a sent touch to beacon")
  const before = touch!.opens
  const px1 = await fetch(`${BASE}/api/open/${touch!.id}`)
  const px2 = await fetch(`${BASE}/api/open/${touch!.id}`)
  const pxOk = px1.status === 200 && px2.status === 200 &&
    (px1.headers.get("content-type") ?? "").includes("image/gif")
  ok(pxOk, "pixel returns 200 image/gif")
  const after = (await db.message.findUnique({ where: { id: touch!.id } }))!
  ok(after.opens === before + 2, `opens incremented ${before} -> ${after.opens}`)
  ok(!!after.openedAt, "openedAt stamped by pixel hit")

  // ------------------------------------------------- remove-variant guards
  console.log("\nRemove-variant guards")
  const withLeads = det.body.campaign.variants[0] as any
  const g1 = await patchC(`/api/campaigns/${id}`, { removeVariant: withLeads.id })
  ok(g1.status === 400, "arm with assigned leads is protected", g1.body)

  await patchC(`/api/campaigns/${id}`, { addVariant: true }) // adds D
  det = await call(`/api/campaigns/${id}`)
  const dArm = det.body.campaign.variants.find((v: any) => v.label === "D")
  ok(!!dArm, "variant D added")
  const g2 = await patchC(`/api/campaigns/${id}`, { removeVariant: dArm.id })
  ok(g2.status === 200, "unused arm D removable", g2.body)
  det = await call(`/api/campaigns/${id}`)
  ok(det.body.campaign.variants.map((v: any) => v.label).sort().join("") === "ABC", "back to A,B,C")

  // <=2 arms rule on a throwaway campaign
  const fx2 = await db.campaign.create({
    data: {
      projectId: project!.id, name: "QA - two-arm guard", offer: "x", customerProblem: "x",
      targetRole: "x", targetGeography: "x", targetCompanySize: "11-50", variantTest: true,
      copySubject: "s", copyBody: "b",
    },
  })
  await patchC(`/api/campaigns/${fx2.id}`, { variantTest: true }) // seeds A,B
  const fx2v = await db.copyVariant.findMany({ where: { campaignId: fx2.id } })
  const g3 = await patchC(`/api/campaigns/${fx2.id}`, { removeVariant: fx2v[0].id })
  ok(g3.status === 400, "live test cannot drop below two arms", g3.body)
  await db.campaign.delete({ where: { id: fx2.id } }) // cascade cleans variants
  console.log("  QA two-arm guard campaign deleted")

  // ===================== PART B - reply-rate auto-promotion (z-test) ========
  console.log("\nPart B - auto-promotion fixture (20/20 leads, A 20% vs B 50% reply)")
  const fx = await db.campaign.create({
    data: {
      projectId: project!.id, name: "QA - autopromote fixture", offer: "x", customerProblem: "x",
      targetRole: "x", targetGeography: "x", targetCompanySize: "11-50", variantTest: true, autoPromote: true,
      copySubject: "control subject", copyBody: "control body",
    },
  })
  const va = await db.copyVariant.create({ data: { campaignId: fx.id, label: "A", subject: "A control subject", body: "A body" } })
  const vb = await db.copyVariant.create({ data: { campaignId: fx.id, label: "B", subject: "B challenger subject", body: "B body" } })
  for (let i = 0; i < 40; i++) {
    const arm = i < 20 ? va : vb
    const replies = i < 20 ? i < 4 : i >= 20 && i < 30 // A: 4/20, B: 10/20
    const lead = await db.lead.create({
      data: {
        campaignId: fx.id, name: `Fixture Lead ${i}`, title: "Owner", company: "Fixture Co",
        companyDomain: `fixture${i}.test`, industry: "med spa", companySize: "11-50",
        country: "United States", email: `fixture${i}@example.test`, score: 70,
        status: "approved", variantId: arm.id, touchCount: 1,
      },
    })
    if (replies) {
      await db.message.create({
        data: { campaignId: fx.id, leadId: lead.id, direction: "in", kind: "reply", channel: "email", body: "interested, let's talk", status: "sent" },
      })
    }
  }
  const tickB = await post("/api/tick", {})
  ok(tickB.status === 200, "tick processed", tickB.body)
  const promoted = await db.campaign.findUnique({ where: { id: fx.id } })!
  ok(promoted.variantTest === false, "variantTest auto-closed", promoted.variantTest)
  ok(promoted.copySubject === vb.subject, "winner B promoted to campaign copy", promoted.copySubject)
  console.log(`  nextAction: ${promoted.nextAction}`)
  ok(/auto-promoted/i.test(promoted.nextAction) && /p=0\.0\d/.test(promoted.nextAction), "nextAction reports significance")
  await db.campaign.delete({ where: { id: fx.id } })
  console.log("  autopromote fixture deleted")

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
