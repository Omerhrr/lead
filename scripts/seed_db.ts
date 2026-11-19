// Seed the simulated B2B database (companies + people profiles).
// Run: bun scripts/seed_db.ts   (from /home/z/my-project)

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

import {
  SEED_COMPANIES,
  TITLE_TPLS,
  FIRST_NAMES,
  LAST_NAMES,
  INDUSTRY_HOOKS,
} from "../src/lib/b2b-database"

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// deterministic RNG so reseeding is stable
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function main() {
  const rng = mulberry32(20261117)
  await db.dbPerson.deleteMany()
  await db.dbCompany.deleteMany()

  let personCount = 0
  for (const c of SEED_COMPANIES) {
    const company = await db.dbCompany.create({ data: c })
    const nPeople = 3 + Math.floor(rng() * 3) // 3-5 per company
    const tpls = [...TITLE_TPLS].sort(() => rng() - 0.5).slice(0, nPeople)
    const hooks = INDUSTRY_HOOKS[c.industry] ?? ["growing fast"]
    for (const tpl of tpls) {
      const first = pick(FIRST_NAMES, rng)
      const last = pick(LAST_NAMES, rng)
      const pattern = rng() < 0.55 ? "fl" : "f"
      const local =
        pattern === "fl"
          ? `${first}.${last}`.toLowerCase()
          : first.toLowerCase()
      const email = `${local}@${c.domain}`
      const linkedin = rng() < 0.75
        ? `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${Math.floor(rng() * 9000 + 1000)}`
        : null
      try {
        await db.dbPerson.create({
          data: {
            companyId: company.id,
            name: `${first} ${last}`,
            title: tpl.title,
            seniority: tpl.seniority,
            email,
            linkedin,
            hook: pick(hooks, rng),
          },
        })
        personCount++
      } catch {
        // duplicate email - skip
      }
    }
  }
  console.log(`Seeded ${SEED_COMPANIES.length} companies, ${personCount} people`)
}

main().finally(() => db.$disconnect())
