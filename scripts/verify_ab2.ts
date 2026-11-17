// 1) Inspect ledger (when did the overdraft happen?)
// 2) Top up to a healthy balance
// 3) Tick until sends happen; assert messages carry variantId and no overdraft occurs
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

  // 1. ledger
  let r = await req("GET", "/api/billing", undefined, cookie)
  const tx = r.data.transactions
  console.log("--- ledger (newest first) ---")
  for (const t of tx.slice(0, 12)) {
    console.log(`${t.createdAt.slice(0, 19)} | ${t.type.padEnd(14)} | ${t.amountUsd.toFixed(2).padStart(8)} -> ${t.balanceAfter.toFixed(2).padStart(8)} | ${t.description}`)
  }

  // 2. top up $65
  r = await req("POST", "/api/billing/topup", { amountUsd: 65 }, cookie)
  console.log("topup:", JSON.stringify(r.data))

  // 3. tick until both variants have sends
  let campId = (await req("GET", "/api/campaigns", undefined, cookie)).data.campaigns[0].id
  let stats = []
  for (let i = 0; i < 30; i++) {
    await req("POST", "/api/tick", {}, cookie)
    await new Promise((s) => setTimeout(s, 1300))
    r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
    stats = r.data.campaign.variantStats
    if (stats.length >= 2 && stats.every((s) => s.sent > 0) && stats.some((s) => s.replied > 0)) break
  }
  console.log("--- variant stats ---")
  console.log(JSON.stringify(stats, null, 1))

  // 4. message variant coverage
  r = await req("GET", `/api/campaigns/${campId}`, undefined, cookie)
  const msgs = r.data.messages
  const touchMsgs = msgs.filter((m) => m.kind === "touch")
  const withVariant = touchMsgs.filter((m) => m.variantId).length
  console.log(`touch messages in window: ${touchMsgs.length}, with variantId: ${withVariant}`)
  console.log("nextAction:", r.data.campaign.nextAction)

  // 5. no overdraft in the whole ledger
  r = await req("GET", "/api/billing", undefined, cookie)
  const bad = r.data.transactions.filter((t) => t.balanceAfter < -0.001 && t.createdAt > new Date(Date.now() - 15 * 60 * 1000).toISOString())
  console.log("overdrafts in last 15min:", bad.length)
  console.log("final balance:", r.data.account.prepaidBalanceUsd)

  if (!(stats.length >= 2 && stats.every((s) => s.sent > 0))) throw new Error("variants did not both send")
  if (withVariant === 0) throw new Error("no touches carry variantId")
  if (bad.length > 0) throw new Error("new overdraft detected")
  console.log("VARIANT SEND PATH VERIFIED")
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1) })
