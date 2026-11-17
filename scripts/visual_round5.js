// Round-5 visual check via Playwright (agent-browser daemon unavailable).
// Login -> campaigns -> CTA campaign: verify Export PDF button, Tracked links
// card in Activity, take screenshots.
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const BASE = "http://localhost:3000"
const OUT = "/home/z/my-project/download"

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

  await page.getByRole("button", { name: "Campaigns", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.getByRole("button", { name: /Med spas — CTA clicks demo/ }).click()
  await page.waitForTimeout(2000)

  const body = await page.evaluate(() => document.body.innerText)
  const checks = {
    exportPdf: body.includes("Export PDF"),
    exportCsv: body.includes("Export CSV"),
    trackedLinks: body.includes("Tracked links"),
    ctaField: body.includes("CTA link"),
  }
  log("checks:", JSON.stringify(checks))

  // Activity tab: tracked links card + clicked badges
  await page.getByRole("tab", { name: "Activity" }).click()
  await page.waitForTimeout(1500)
  const actBody = await page.evaluate(() => document.body.innerText)
  const clicksLine = actBody.match(/\d+ clicks · \d+%/g)
  log("tracked-links rows:", JSON.stringify(clicksLine))
  const clickedBadges = (actBody.match(/clicked/g) || []).length
  log("clicked badges:", clickedBadges)

  await page.screenshot({ path: `${OUT}/autogtm-tracked-links-card.png`, fullPage: false })
  log("screenshot 1 saved")

  // scroll up for the header buttons screenshot
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/autogtm-export-pdf-header.png`, fullPage: false })
  log("screenshot 2 saved")

  const okAll = checks.exportPdf && checks.exportCsv && clicksLine && clickedBadges > 0
  console.log(okAll ? "VISUAL-CHECK: PASS" : "VISUAL-CHECK: FAIL")
  await browser.close()
  process.exitCode = okAll ? 0 : 1
}

main().catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1 })
