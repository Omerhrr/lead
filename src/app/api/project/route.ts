import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const project = await db.project.findFirst({
    where: { userId: user.id },
    include: {
      campaigns: { orderBy: { createdAt: "desc" } },
      sendingDomains: true,
    },
  })
  return Response.json({ project })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const domain = String(body?.companyDomain ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
  const companyName = String(body?.companyName ?? "").trim()
  const senderName = String(body?.senderName ?? "").trim()
  if (!domain || !companyName || !senderName) {
    return Response.json(
      { error: "companyDomain, companyName and senderName are required" },
      { status: 400 }
    )
  }

  const existing = await db.project.findFirst({ where: { userId: user.id } })
  const data = {
    companyDomain: domain,
    companyName,
    senderName,
    senderTitle: String(body?.senderTitle ?? "Founder"),
  }
  const project = existing
    ? await db.project.update({ where: { id: existing.id }, data })
    : await db.project.create({ data: { userId: user.id, ...data } })
  return Response.json({ project })
}

// PATCH - workspace-level settings (calendar booking link the autopilot
// offers once a lead agrees to a time).
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const existing = await db.project.findFirst({ where: { userId: user.id } })
  if (!existing) return Response.json({ error: "No project yet" }, { status: 400 })
  const data: Record<string, string> = {}
  if (typeof body?.bookingUrl === "string") {
    const url = body.bookingUrl.trim()
    if (url && !/^https?:\/\/\S+$/i.test(url)) {
      return Response.json({ error: "Booking URL must be an http(s) link" }, { status: 400 })
    }
    data.bookingUrl = url || "https://cal.com/jidout-demo/intro"
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 })
  }
  const project = await db.project.update({ where: { id: existing.id }, data })
  return Response.json({ project })
}
