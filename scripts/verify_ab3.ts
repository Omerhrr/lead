// Clean A/B verification on a fresh campaign:
// enable test -> edit B -> approve -> start -> tick -> assert messages carry variantId -> promote winner.
const BASE = "http://localhost:3000"
const EMAIL = "founder@consotto.com"

async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  const sc = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("agtm_uid="))
  return { status: res.status, data, cookie: sc ? sc.split(";")[0] : cookie }
}

async function main() {
  const login = await req("POST", "/api/auth/login", { email: EMAIL })
  const cookie = login.cookie

  // pause the old campaign so it stops consuming quota
  let r = await req("GET", "/api/campaigns", undefined, cookie)
  for (const c of r.data.campaigns) {
    if (c.sendingNow) await req("POST", `/api/campaigns/${c.id}/actions`, { action: "stop" }, cookie)
  }

  // fresh campaign
  r = await req("POST", "/api/campaigns", {
    name: "A/B live — med spas",
    offer: "AI appointment-booking assistant for med spas",
    customerProblem: "Front desks miss booking calls during treatments",
    targetRole: "owner, clinic director",
    targetGeography: "United States",
    targetCompanySize: "11-50",
    keywords: "med spa, aesthetics",
    dailyBudgetUsd: 30,
  }, cookie)
  const campId = r.data.campaign.id
  console.log("campaign:", campId, "pool:", r.data.poolSize)

  // enable A/B + edit variant B
  await req("PATCH", `/api/campaigns/${campId}`, { variantTest: true }, cookie)
  r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
  const b = r.data.campaign.variants.find((v) => v.label === "B")
  await req("PATCH", `/api/campaigns/${campId}`, { variants: [{
    id: b.id,
    subject: "Do missed calls cost {{company}} bookings?",
    body: "Hi {{first_name}}, med spas lose bookings when the front desk is busy. {{sender_name}} here — we answer every call with AI. Open to a peek?",
  }] }, cookie)
  console.log("A/B enabled, variant B edited")

  // approve all -> balanced split
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "approve_leads", all: true }, cookie)
  console.log("approved:", r.data.approved)

  // start + tick until both variants send and some replies land
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "start" }, cookie)
  console.log("start:", JSON.stringify(r.data))

  let stats = []
  let msgInfo = { touches: 0, withVariant: 0 }
  for (let i = 0; i < 30; i++) {
    await req("POST", "/api/tick", {}, cookie)
    await new Promise((s) => setTimeout(s, 1300))
    r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
    stats = r.data.campaign.variantStats
    const touches = r.data.messages.filter((m) => m.kind === "touch")
    msgInfo = { touches: touches.length, withVariant: touches.filter((m) => m.variantId).length }
    if (stats.length >= 2 && stats.every((s) => s.sent > 0) && msgInfo.withVariant > 0 && stats.some((s) => s.replied > 0)) break
  }
  console.log("variant stats:", JSON.stringify(stats))
  console.log(`touches: ${msgInfo.touches}, carrying variantId: ${msgInfo.withVariant}`)

  // promote winner
  const winner = [...stats].sort((x, y) => y.replied - x.replied)[0]
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "promote_variant", variantId: winner.id }, cookie)
  console.log("promote:", JSON.stringify(r.data))
  r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
  const afterPromote = r.data.campaign
  console.log("after promote: variantTest =", afterPromote.variantTest, "| subject =", JSON.stringify(afterPromote.copySubject))

  // final delivery + no-overdraft check
  const delivery = await req("GET", "/api/delivery", undefined, cookie)
  console.log("delivery:", JSON.stringify(delivery.data))
  const bill = await req("GET", "/api/billing", undefined, cookie)
  const bad = bill.data.transactions.filter((t) => t.balanceAfter < -0.001 && t.createdAt > new Date(Date.now() - 12 * 60 * 1000).toISOString())
  console.log("overdrafts in last 12min:", bad.length, "| balance:", bill.data.account.prepaidBalanceUsd)

  if (!(stats.length >= 2 && stats.every((s) => s.sent > 0))) throw new Error("not both variants sent")
  if (msgInfo.withVariant === 0) throw new Error("no messages carry variantId")
  if (afterPromote.variantTest !== false) throw new Error("promote did not close the test")
  if (bad.length > 0) throw new Error("overdraft detected")
  console.log("A/B FULL PATH VERIFIED")
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1) })
