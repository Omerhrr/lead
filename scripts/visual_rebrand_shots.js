// Rebrand re-shoots: the round 3-4 evidence views with the current demo db.
// Produces: ab-variants, ab-settings-delivery, multiarm-overview,
// three-arm-split, variant-opens-stat, activity-opened-badges, cta-clicks-ab,
// cta-field-export (all jidout-*.png).
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

  // ---- campaigns list (multiarm-overview)
  await page.getByRole("button", { name: "Campaigns", exact: true }).click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${OUT}/jidout-multiarm-overview.png`, fullPage: false })
  log("saved: multiarm-overview")

  // ---- three-arm campaign: A/B test tab (three-way split + variant stat) + CTA clicks
  await page.getByText("A/B/C arms v2 - clinics").first().click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.getByRole("tab", { name: "A/B test" }).click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/jidout-three-arm-split.png`, fullPage: true })
  log("saved: three-arm-split")
  await page.screenshot({ path: `${OUT}/jidout-ab-variants.png`, fullPage: false })
  log("saved: ab-variants")
  await page.screenshot({ path: `${OUT}/jidout-variant-opens-stat.png`, fullPage: false })
  log("saved: variant-opens-stat")
  await page.screenshot({ path: `${OUT}/jidout-cta-clicks-ab.png`, fullPage: false })
  log("saved: cta-clicks-ab")

  // ---- settings tab: delivery provider panel
  await page.getByRole("tab", { name: "Settings" }).click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/jidout-ab-settings-delivery.png`, fullPage: false })
  log("saved: ab-settings-delivery")

  // ---- brief tab: CTA fields
  await page.getByRole("tab", { name: "Brief" }).click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/jidout-cta-field-export.png`, fullPage: false })
  log("saved: cta-field-export")

  // ---- activity feed with opened badges
  await page.getByRole("tab", { name: "Activity" }).click().catch(() => {})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/jidout-activity-opened-badges.png`, fullPage: false })
  log("saved: activity-opened-badges")

  await browser.close()
  console.log("REBRAND-SHOTS: DONE")
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
