// One-off data hygiene: demo-mode clicks were previously simulated on all
// campaigns; now they only apply to campaigns with a tracked CTA link.
// Zero out clicks on messages whose campaign has no ctaUrl.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const cs = await db.campaign.findMany({ select: { id: true, name: true, ctaUrl: true, state: true } })
  for (const c of cs) console.log(c.state.padEnd(10), (c.ctaUrl || "(no cta)").padEnd(45), c.name)
  const noCta = cs.filter((c) => !c.ctaUrl).map((c) => c.id)
  const r = await db.message.updateMany({
    where: { campaignId: { in: noCta }, clicks: { gt: 0 } },
    data: { clicks: 0, clickedAt: null },
  })
  // clicks on touches sent before the CTA link existed (body lacks the link)
  const withCta = cs.filter((c) => c.ctaUrl)
  let phantom = 0
  for (const c of withCta) {
    const p = await db.message.updateMany({
      where: { campaignId: c.id, clicks: { gt: 0 }, body: { not: { contains: c.ctaUrl! } } },
      data: { clicks: 0, clickedAt: null },
    })
    phantom += p.count
  }
  console.log(`messages cleaned: ${r.count} (no-cta campaigns) + ${phantom} (pre-CTA touches)`)
}

main().finally(() => db.$disconnect())
