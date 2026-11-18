// Round-7 visual check via Playwright: campaign channel-mix badge + LinkedIn
// toggle in Settings, Team workspace view with invite/seat states.
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

  // ---- Team view: seed two members (one invited, one active with LinkedIn seat)
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
  ok(teamBody.includes("Jordan Blake") && teamBody.includes("invite pending"), "invited member row visible")
  ok(teamBody.includes("Kate Lin") && teamBody.includes("seat"), "active member with LinkedIn seat visible")
  ok(teamBody.includes("LinkedIn seats: 1/1 assigned"), "seat summary line visible")
  await page.screenshot({ path: `${OUT}/autogtm-round7-team.png`, fullPage: false })
  log("screenshot 1 saved (team workspace)")

  // ---- Campaigns: channel-mix badge in the detail header
  await page.getByRole("button", { name: "Campaigns", exact: true }).click()
  await page.waitForTimeout(1800)
  await page.getByText("Med spas — CTA clicks demo").first().click().catch(() => {})
  await page.waitForTimeout(1500)
  const headBody = await page.evaluate(() => document.body.innerText)
  ok(/\d+ email\s*·\s*\d+ LinkedIn/.test(headBody), `channel mix badge visible: ${headBody.match(/\d+ email\s*·\s*\d+ LinkedIn/)?.[0] ?? "?"}`)
  await page.screenshot({ path: `${OUT}/autogtm-round7-channel-mix.png`, fullPage: false })
  log("screenshot 2 saved (campaign header channel mix)")

  // ---- Settings tab: LinkedIn touches switch
  await page.getByRole("tab", { name: "Settings" }).click()
  await page.waitForTimeout(1000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find(
      (x) => x.children.length === 0 && x.textContent?.trim() === "LinkedIn touches"
    )
    if (el) el.scrollIntoViewIfNeeded()
  })
  await page.waitForTimeout(300)
  const setBody = await page.evaluate(() => document.body.innerText)
  ok(setBody.includes("LinkedIn touches"), "LinkedIn touches switch present in settings")
  await page.screenshot({ path: `${OUT}/autogtm-round7-linkedin-toggle.png`, fullPage: false })
  log("screenshot 3 saved (settings toggle)")

  // ---- cleanup: remove visual QA team members
  const ids = await page.evaluate(async () =>
    fetch("/api/team").then((r) => r.json()).then((d) => d.members.map((m) => m.id))
  )
  for (const id of ids) {
    await page.evaluate((mid) => fetch(`/api/team?id=${mid}`, { method: "DELETE" }), id)
  }
  log(`cleanup: ${ids.length} visual team member(s) removed`)

  await browser.close()
  console.log(process.exitCode ? "VISUAL-CHECK: FAIL" : "VISUAL-CHECK: PASS")
  process.exit(process.exitCode ?? 0)
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
