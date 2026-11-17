// Download sample reports (PDF + CSV) for the deliverables folder.
const BASE = "http://localhost:3000"
let cookie = ""
const login = await fetch(BASE + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "riley@brightpath.io" }),
})
const sc = login.headers.get("set-cookie")
if (sc) cookie = sc.split(";")[0]
const { PrismaClient } = await import("@prisma/client")
const db = new PrismaClient()
const c = await db.campaign.findFirst({ where: { name: "Med spas — CTA clicks demo" } })

for (const [path, out] of [
  [`/api/campaigns/${c.id}/report-pdf`, "/home/z/my-project/download/autogtm-campaign-report-sample.pdf"],
  [`/api/campaigns/${c.id}/report`, "/home/z/my-project/download/autogtm-campaign-report-sample.csv"],
] as Array<[string, string]>) {
  const res = await fetch(BASE + path, { headers: { cookie } })
  const body = Buffer.from(await res.arrayBuffer())
  const { writeFileSync } = await import("fs")
  writeFileSync(out, body)
  console.log(out, res.status, body.length, "bytes")
}
await db.$disconnect()
