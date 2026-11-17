// Sample the CSV report with an authenticated session.
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
const c = await db.campaign.findFirst({ where: { name: "Med spas — three-way copy test" } })
const res = await fetch(`${BASE}/api/campaigns/${c.id}/report`, { headers: { cookie } })
const csv = await res.text()
const lines = csv.split("\r\n")
console.log("status:", res.status, "| content-type:", res.headers.get("content-type"))
console.log("rows:", lines.length)
console.log("header:", lines[0])
console.log("row1:  ", lines[1])
await db.$disconnect()
