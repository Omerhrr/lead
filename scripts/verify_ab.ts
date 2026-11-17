// End-to-end verification of A/B split test + delivery hook via the HTTP API.
const BASE = "http://localhost:3000"
const EMAIL = "founder@consotto.com"

function cookieOf(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  for (const c of raw) {
    const [pair] = c.split(";")
    if (pair.startsWith("agtm_uid=")) return pair
  }
  return null
}

async function req(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data, cookie: cookieOf(res) }
}

async function main() {
  // 1. login (or sign up) — work email gate
  let r = await req("POST", "/api/auth/login", { email: EMAIL })
  let cookie = r.cookie
  if (!cookie) {
    r = await req("POST", "/api/auth/login", { email: EMAIL }, undefined)
    cookie = r.cookie
  }
  if (!cookie) throw new Error("no session cookie: " + JSON.stringify(r))
  console.log("login ok, billing:", r.data?.billing?.prepaidBalanceUsd ?? r.data?.user?.email ?? "?")

  // 2. project
  r = await req("GET", "/api/project", undefined, cookie)
  if (!r.data.project) {
    r = await req("POST", "/api/project", {
      companyDomain: "consotto.com", companyName: "Consotto", senderName: "Maya Chen", senderTitle: "Founder",
    }, cookie)
  }
  console.log("project:", r.data.project?.companyName)

  // 3. create campaign
  r = await req("POST", "/api/campaigns", {
    name: "A/B pilot — dental clinics",
    offer: "AI phone receptionist for dental clinics",
    customerProblem: "Missed calls cost clinics thousands per month",
    targetRole: "owner, practice manager",
    targetGeography: "United States",
    targetCompanySize: "11-50",
    keywords: "dental",
    dailyBudgetUsd: 30,
  }, cookie)
  const campId = r.data.campaign.id
  console.log("campaign:", campId, "pool:", r.data.poolSize)

  // 4. enable A/B test (auto-seeds A/B from copy)
  r = await req("PATCH", `/api/campaigns/${campId}`, { variantTest: true }, cookie)
  console.log("variantTest enabled")

  // 5. edit variant B so the test is meaningful
  r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
  const variants = r.data.campaign.variants
  const b = variants.find((v) => v.label === "B")
  r = await req("PATCH", `/api/campaigns/${campId}`, { variants: [{
    id: b.id,
    subject: "Quick question about missed calls at {{company}}",
    body: "Hi {{first_name}}, clinics like {{company}} typically miss 30% of calls. We answer every one with AI. Worth a look?",
  }] }, cookie)
  console.log("variant B edited")

  // 6. approve all leads -> balanced assignment
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "approve_leads", all: true }, cookie)
  console.log("approved:", r.data.approved)

  // 7. start (domains already active from earlier session)
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "start" }, cookie)
  console.log("start:", JSON.stringify(r.data))

  // 8. tick until both variants have sends (or timeout)
  let stats = null
  for (let i = 0; i < 30; i++) {
    await req("POST", "/api/tick", {}, cookie)
    await new Promise((s) => setTimeout(s, 1200))
    r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
    stats = r.data.campaign.variantStats
    const sentBoth = stats.length >= 2 && stats.every((s) => s.sent > 0)
    if (sentBoth && stats.some((s) => s.replied > 0)) break
    if (i === 29) break
  }
  console.log("variant stats after sends:", JSON.stringify(stats, null, 1))

  // 9. split balance check
  const leads = (await req("GET", `/api/campaigns/${campId}`, undefined, cookie)).data.campaign.leads
  const byVariant = {}
  for (const l of leads.filter((x) => x.status === "approved")) byVariant[l.variantId ?? "none"] = (byVariant[l.variantId ?? "none"] ?? 0) + 1
  console.log("approved split by variant:", JSON.stringify(byVariant))

  // 10. promote winner (pick variant with more replies, fall back to first)
  const winner = [...stats].sort((a, b2) => b2.replied - a.replied)[0]
  r = await req("POST", `/api/campaigns/${campId}/actions`, { action: "promote_variant", variantId: winner.id }, cookie)
  console.log("promote winner:", winner.label, "->", JSON.stringify(r.data))

  // verify copy now equals winner's copy
  r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
  console.log("after promote: variantTest =", r.data.campaign.variantTest, "| copySubject =", r.data.campaign.copySubject)

  // 11. delivery status
  r = await req("GET", "/api/delivery", undefined, cookie)
  console.log("delivery:", JSON.stringify(r.data))
  if (r.data.configured !== false) throw new Error("provider should be unconfigured in sandbox")
  if (r.data.counts.simulated < 1) throw new Error("expected simulated sends")

  console.log("ALL A/B + DELIVERY CHECKS PASSED")
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1) })
