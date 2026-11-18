// Re-shoot of the round-8 Team/audit evidence at full page height so the
// whole Activity log card (all rows) is visible.
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const BASE = "http://localhost:3000"
const OUT = "/home/z/my-project/download"

function ok(cond, label) {
  if (cond) console.log("  PASS:", label)
  else { console.error("  FAIL:", label); process.exitCode = 1 }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } })

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 })
  await page.waitForTimeout(3000)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.getByRole("textbox", { name: "Work email" }).fill("riley@brightpath.io")
  await page.getByRole("button", { name: "Continue with email" }).click()
  await page.waitForTimeout(2500)

  await page.getByRole("button", { name: "Team", exact: true }).click()
  await page.waitForTimeout(1500)
  const teamBody = await page.evaluate(() => document.body.innerText)
  ok(teamBody.includes("Activity log"), "Activity log card present")
  ok(teamBody.includes("assigned a LinkedIn seat to Kate Lin"), "audit row: seat assignment")
  ok(teamBody.includes("accepted invite"), "audit row: acceptance")
  ok((teamBody.match(/invited/g) || []).length >= 2, "audit rows: both invites recorded")
  await page.screenshot({ path: `${OUT}/autogtm-round8-audit.png`, fullPage: true })
  console.log("   full-page screenshot saved")

  await browser.close()
  console.log(process.exitCode ? "VISUAL-CHECK: FAIL" : "VISUAL-CHECK: PASS")
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
