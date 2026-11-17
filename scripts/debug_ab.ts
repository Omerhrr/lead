// Debug why the A/B campaign is not sending: print campaign state + one tick result.
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
  let r = await req("GET", "/api/billing", undefined, cookie)
  console.log("balance:", r.data.account?.prepaidBalanceUsd, "spentToday:", r.data.account?.spentTodayUsd, "dailyBudget:", r.data.account?.dailyBudgetUsd)

  r = await req("GET", "/api/campaigns", undefined, cookie)
  const camp = r.data.campaigns[0]
  console.log("campaign:", camp.name, "| state:", camp.state, "| sendingNow:", camp.sendingNow)
  console.log("nextAction:", camp.nextAction)

  const detail = await req("GET", `/api/campaigns/${camp.id}`, undefined, cookie)
  const c = detail.data.campaign
  console.log("variantTest:", c.variantTest, "| approved:", c.leads.filter((l) => l.status === "approved").length)
  console.log("project:", c.project.companyName, c.project.companyDomain, c.project.senderName)

  for (let i = 0; i < 3; i++) {
    const t = await req("POST", "/api/tick", {}, cookie)
    console.log(`tick ${i + 1}: status=${t.status} body=${JSON.stringify(t.data)}`)
    await new Promise((s) => setTimeout(s, 1500))
  }
  const after = await req("GET", `/api/campaigns/${camp.id}`, undefined, cookie)
  console.log("nextAction after ticks:", after.data.campaign.nextAction)
  console.log("variantStats:", JSON.stringify(after.data.campaign.variantStats))
}

main().catch((e) => { console.error("DEBUG FAIL:", e); process.exit(1) })
