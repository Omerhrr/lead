// Remove the temporary round-8 screenshot campaign after visual runs.
// Keep team members + audit events (demo flavor). Run: bun scripts/cleanup_round8_campaign.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const c = await db.campaign.findFirst({ where: { name: "Round8 LinkedIn adapter demo" } })
  if (!c) return console.log("campaign already absent")
  await db.campaign.delete({ where: { id: c.id } })
  console.log("deleted campaign + cascaded rows:", c.id)
}

main().finally(() => db.$disconnect())
