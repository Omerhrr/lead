// Round-8 visual check via Playwright: LinkedIn touch delivered through the
// real adapter ("via LinkedIn API" chip in the campaign Activity feed) and the
// workspace audit trail (Team view Activity log card).
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const BASE = "http://localhost:3000"
const OUT = "/home/z/my-project/download"

function ok(cond, label) {
  if (cond) console.log("  PASS:", label)
  else { console.error("  FAIL:", label); process.exitCode = 1 }
}

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

  // ---- Campaign Activity: "via LinkedIn API" chip on the delivered DMs
  await page.getByRole("button", { name: "Campaigns", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.getByText("Round8 LinkedIn adapter demo").first().click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.getByRole("tab", { name: "Activity" }).click()
  await page.waitForTimeout(1200)
  const actBody = await page.evaluate(() => document.body.innerText)
  const chipCount = (actBody.match(/via LinkedIn API/g) || []).length
  ok(chipCount >= 1, `"via LinkedIn API" chip visible (${chipCount}x)`)
  ok(actBody.includes("touch"), "activity feed lists touches")
  // scroll the first chip row into view for the shot
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (x) => x.children.length === 0 && x.textContent?.trim() === "via LinkedIn API"
    )
    if (el) el.scrollIntoView({ block: "center" })
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/autogtm-round8-linkedin-api.png`, fullPage: false })
  log("screenshot 1 saved (LinkedIn API chip in activity feed)")

  // ---- Team view: seed members (pending invite + active with seat) so the
  // audit trail has real rows, then capture the Activity log card
  await page.evaluate(async () => {
    const inv = async (email, name, role) =>
      fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role }),
      }).then((r) => r.json())
    const jordan = await inv("jordan@brightpath.io", "Jordan Blake", "member")
    const kate = await inv("kate@brightpath.io", "Kate Lin", "member")
    await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kate.member.id, action: "accept" }),
    })
    await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kate.member.id, action: "seat_on" }),
    })
    void jordan
  })
  await page.getByRole("button", { name: "Team", exact: true }).click()
  await page.waitForTimeout(1500)
  const teamBody = await page.evaluate(() => document.body.innerText)
  ok(teamBody.includes("Activity log"), "Activity log card present on Team view")
  ok(teamBody.includes("invited") && teamBody.includes("Jordan Blake"), "audit row: invite recorded")
  ok(teamBody.includes("assigned a LinkedIn seat to Kate Lin"), "audit row: seat assignment recorded")
  ok(teamBody.includes("accepted invite"), "audit row: invite acceptance recorded")
  // scroll the Activity log card into view
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (x) => x.children.length === 0 && x.textContent?.trim() === "Activity log"
    )
    if (el) el.scrollIntoView({ block: "center" })
  })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/autogtm-round8-audit.png`, fullPage: false })
  log("screenshot 2 saved (workspace audit trail)")

  await browser.close()
  console.log(process.exitCode ? "VISUAL-CHECK: FAIL" : "VISUAL-CHECK: PASS")
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
