// Round 9+10 evidence screenshots: pre-warmed domain store + DNS auth chips,
// verified lead pool badges, CSV import dialog, language/verification settings,
// meetings + CPL on the overview, per-result pricing in billing and the
// Developers (API keys + docs) view.
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const BASE = "http://localhost:3000"
const OUT = "/home/z/my-project/download"

function ok(cond, label) {
  if (cond) console.log("  PASS:", label)
  else { console.error("  FAIL:", label); process.exitCode = 1 }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(3000)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("textbox", { name: "Work email" }).fill("riley@brightpath.io")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.waitForTimeout(2500)

  // 1) domains: pre-warmed store + DNS auth chips
  await page.getByRole("button", { name: "Domains", exact: true }).click()
  await page.waitForTimeout(1800)
  const domainsBody = await page.evaluate(() => document.body.innerText)
  ok(domainsBody.includes("Pre-warmed domain store"), "store section present")
  ok(domainsBody.includes("brightsend.co") || domainsBody.includes("warmreach-out.com"), "store listings visible")
  ok(domainsBody.includes("ready to send on day one"), "day-one badge present")
  ok(/authentication/i.test(domainsBody), "DNS auth row present")
  ok(domainsBody.includes("Check DNS"), "Check DNS button present")
  await page.screenshot({ path: `${OUT}/jidout-round9-domains-store-dns.png`, fullPage: true })
  console.log("   saved jidout-round9-domains-store-dns.png")

  // 2) campaigns: verified pool badges (newest campaign auto-selected)
  await page.getByRole("button", { name: "Campaigns", exact: true }).click()
  await page.waitForTimeout(2000)
  const campBody = await page.evaluate(() => document.body.innerText)
  ok(campBody.includes("Lead pool ("), "pool tab present")
  ok(/valid|risky|invalid/.test(campBody), "verify badges visible in the pool table")
  ok(campBody.includes("Verify pool"), "Verify pool button present")
  ok(campBody.includes("Import CSV"), "Import CSV button present")
  await page.screenshot({ path: `${OUT}/jidout-round9-verify-pool.png`, fullPage: true })
  console.log("   saved jidout-round9-verify-pool.png")

  // 3) CSV import dialog with preview
  await page.getByRole("button", { name: "Import CSV" }).click()
  await page.waitForTimeout(800)
  await page.locator("textarea").fill(
    "email,name,title,company,country\n" +
    "valid.shot1@bright-demo.io,Dana Voss,Founder,Acme Dental,United States\n" +
    "valid.shot2@bright-demo.io,Liam Park,Ops Director,Acme Dental,United States\n" +
    "risky.shot3@bright-demo.io,Risky Row,Ops,Acme Dental,United States"
  )
  await page.getByRole("button", { name: "Preview" }).click()
  await page.waitForTimeout(1500)
  const dialogBody = await page.evaluate(() => document.body.innerText)
  ok(dialogBody.includes("importable"), "preview shows importable count")
  ok(dialogBody.includes("Dana Voss"), "preview sample table lists rows")
  await page.screenshot({ path: `${OUT}/jidout-round9-csv-import.png`, fullPage: false })
  console.log("   saved jidout-round9-csv-import.png")
  await page.getByRole("button", { name: "Cancel" }).click()
  await page.waitForTimeout(500)

  // 4) settings: language select + verification policy
  await page.getByRole("tab", { name: "Settings" }).click()
  await page.waitForTimeout(900)
  const settingsBody = await page.evaluate(() => document.body.innerText)
  ok(settingsBody.includes("Campaign language (30 available)"), "language selector present")
  ok(settingsBody.includes("Mailbox verification policy"), "verification policy selector present")
  await page.screenshot({ path: `${OUT}/jidout-round10-language-settings.png`, fullPage: true })
  console.log("   saved jidout-round10-language-settings.png")

  // 5) overview: meetings card + CPL per campaign row
  await page.getByRole("button", { name: "Overview", exact: true }).click()
  await page.waitForTimeout(2000)
  const overviewBody = await page.evaluate(() => document.body.innerText)
  ok(overviewBody.includes("Upcoming meetings"), "meetings card present")
  ok(/per warm lead/.test(overviewBody), "CPL shown on campaign rows")
  await page.screenshot({ path: `${OUT}/jidout-round10-meetings-overview.png`, fullPage: true })
  console.log("   saved jidout-round10-meetings-overview.png")

  // 6) billing: pricing model card
  await page.getByRole("button", { name: "Billing", exact: true }).click()
  await page.waitForTimeout(1800)
  const billingBody = await page.evaluate(() => document.body.innerText)
  ok(billingBody.includes("Pricing model"), "pricing model card present")
  ok(billingBody.includes("Per result") && billingBody.includes("success fee"), "per-result option visible")
  await page.screenshot({ path: `${OUT}/jidout-round10-billing-pricing.png`, fullPage: true })
  console.log("   saved jidout-round10-billing-pricing.png")

  // 7) developers: API keys + docs
  await page.getByRole("button", { name: "Developers", exact: true }).click()
  await page.waitForTimeout(1500)
  const apiBody = await page.evaluate(() => document.body.innerText)
  ok(apiBody.includes("API keys"), "API keys card present")
  ok(apiBody.includes("Zapier integration"), "seeded key listed")
  ok(apiBody.includes("API docs (v1)"), "docs section present")
  ok(apiBody.includes("/api/public/v1/campaigns"), "endpoint documented")
  await page.screenshot({ path: `${OUT}/jidout-round10-api-keys.png`, fullPage: true })
  console.log("   saved jidout-round10-api-keys.png")

  await browser.close()
  console.log(process.exitCode ? "VISUAL-CHECK: FAIL" : "VISUAL-CHECK: PASS")
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
