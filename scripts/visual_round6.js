// Round-6 visual check via Playwright: domain-warming progress on Domains,
// weekly digest card on Overview, unsubscribe confirmation page.
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")
const { PrismaClient } = require("@prisma/client")

const BASE = "http://localhost:3000"
const OUT = "/home/z/my-project/download"
const db = new PrismaClient()

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const log = (...a) => console.log("  ", ...a)

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(3000)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("textbox", { name: "Work email" }).fill("riley@brightpath.io")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.waitForTimeout(2500)
  log("logged in:", page.url())

  // ---- Domains: buy one via the app API (session cookie), screenshot warming
  await page.getByRole("button", { name: "Domains", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buy", count: 1 }),
    })
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2000)
  // the SPA resets to Overview on full reload - navigate back to Domains
  await page.getByRole("button", { name: "Domains", exact: true }).click()
  await page.waitForTimeout(1500)
  const domBody = await page.evaluate(() => document.body.innerText)
  const warmingRow = domBody.match(/warming day \d+ · \d+\/\d+ emails\/day/g)
  log("warming rows:", JSON.stringify(warmingRow))
  ok(warmingRow && warmingRow.length > 0, "warming progress row visible")
  await page.screenshot({ path: `${OUT}/jidout-round6-warming.png`, fullPage: false })
  log("screenshot 1 saved (domains warming)")

  // ---- Overview: enable digest, fire one tick, screenshot the card
  await page.getByRole("button", { name: "Overview", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.evaluate(async () => {
    await fetch("/api/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cadence: "weekly" }),
    })
    await fetch("/api/tick", { method: "POST" })
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2500)
  const ovBody = await page.evaluate(() => document.body.innerText)
  ok(ovBody.includes("Weekly report digest"), "digest card present")
  ok(/On - \d+ digests? sent/.test(ovBody), `digest fired: ${ovBody.match(/On - \d+ digests? sent[^•\n]*/)?.[0] ?? "?"}`)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (x) => x.children.length === 0 && x.textContent?.trim() === "Weekly report digest"
    )
    if (el) el.scrollIntoViewIfNeeded()
  })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/jidout-round6-digest.png`, fullPage: false })
  log("screenshot 2 saved (digest card)")

  // ---- Unsubscribe confirmation page (throwaway lead, cleaned up after)
  const template = await db.campaign.findFirst({ where: { project: { user: { email: "riley@brightpath.io" } } } })
  const visLead = await db.lead.create({
    data: {
      campaignId: template.id, name: "Visual QA", title: "QA", company: "Round6 Visual",
      companyDomain: "round6-visual.example.com", industry: "software", companySize: "11-50",
      country: "United States", email: "visual-qa@round6-visual.example.com", score: 50,
      status: "pool", unsubToken: "ab".repeat(16),
    },
  })
  await page.goto(`${BASE}/api/unsubscribe/${"ab".repeat(16)}`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(800)
  const unBody = await page.evaluate(() => document.body.innerText)
  ok(unBody.includes("You won't hear from us again"), "confirmation page rendered")
  await page.screenshot({ path: `${OUT}/jidout-round6-unsubscribe.png`, fullPage: false })
  log("screenshot 3 saved (unsubscribe page)")
  await db.lead.delete({ where: { id: visLead.id } })
  await db.suppressEntry.deleteMany({ where: { value: "visual-qa@round6-visual.example.com" } })

  // ---- cleanup: remove the visual-check domain + refund (digest stays enabled)
  const startedAt = new Date(Date.now() - 10 * 60 * 1000)
  const acct = await db.billingAccount.findFirst({ where: { user: { email: "riley@brightpath.io" } } })
  const proj = await db.project.findFirst({ where: { user: { email: "riley@brightpath.io" } } })
  const qaDomains = await db.sendingDomain.findMany({
    where: { projectId: proj.id, createdAt: { gte: startedAt }, source: "platform" },
  })
  for (const qa of qaDomains) {
    await db.sendingDomain.delete({ where: { id: qa.id } })
  }
  if (qaDomains.length > 0) {
    await db.creditTransaction.deleteMany({ where: { accountId: acct.id, description: { contains: "Domain plan - 1 sending domain" } } })
    await db.billingAccount.update({ where: { id: acct.id }, data: { prepaidBalanceUsd: acct.prepaidBalanceUsd + 12 * qaDomains.length } })
    log(`cleanup: ${qaDomains.length} visual domain(s) removed + refunded (digest left enabled)`)
  }
  await browser.close()
  console.log("VISUAL-CHECK: PASS")
  process.exit(0)
}

function ok(cond, label) {
  if (cond) console.log("  PASS:", label)
  else { console.error("  FAIL:", label); process.exitCode = 1 }
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1 })
  .then(() => db.$disconnect())
