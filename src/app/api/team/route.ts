import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

const ROLES = ["member", "viewer"] // "owner" is reserved for the account owner
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function loadWorkspace(userId: string) {
  const members = await db.teamMember.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
  })
  const account = await db.billingAccount.findUnique({ where: { userId } })
  const seatsUsed = members.filter((m) => m.linkedinSeat).length
  return {
    members,
    seats: {
      linkedinSeats: account?.linkedinSeats ?? 0,
      seatsUsed,
      seatsAvailable: Math.max(0, (account?.linkedinSeats ?? 0) - seatsUsed),
    },
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  return Response.json({
    owner: { email: user.email, name: user.name },
    ...(await loadWorkspace(user.id)),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 })
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const role = typeof body.role === "string" && ROLES.includes(body.role) ? body.role : "member"
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Enter a valid email address" }, { status: 400 })
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 })
  if (email === user.email.toLowerCase()) {
    return Response.json({ error: "That's you - the account owner needs no invite" }, { status: 400 })
  }
  const dupe = await db.teamMember.findUnique({
    where: { ownerId_email: { ownerId: user.id, email } },
  })
  if (dupe) return Response.json({ error: `${email} is already on the team` }, { status: 400 })
  const member = await db.teamMember.create({
    data: { ownerId: user.id, email, name, role, status: "invited" },
  })
  await logAudit({
    ownerId: user.id,
    actorEmail: user.email,
    actorName: user.name ?? "",
    action: "team.invited",
    target: email,
    detail: `role ${role}`,
  })
  return Response.json({ ok: true, member })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== "string") {
    return Response.json({ error: "Invalid body" }, { status: 400 })
  }
  const member = await db.teamMember.findFirst({ where: { id: body.id, ownerId: user.id } })
  if (!member) return Response.json({ error: "Team member not found" }, { status: 404 })

  if (body.action === "accept") {
    if (member.status === "active") {
      return Response.json({ error: `${member.email} already accepted the invite` }, { status: 400 })
    }
    await db.teamMember.update({ where: { id: member.id }, data: { status: "active" } })
    await logAudit({
      ownerId: user.id,
      actorEmail: user.email,
      actorName: user.name ?? "",
      action: "team.accepted",
      target: member.email,
    })
  } else if (body.action === "seat_on") {
    if (member.linkedinSeat) {
      return Response.json({ error: `${member.email} already holds a LinkedIn seat` }, { status: 400 })
    }
    const account = await db.billingAccount.findUnique({ where: { userId: user.id } })
    const used = await db.teamMember.count({ where: { ownerId: user.id, linkedinSeat: true } })
    if (!account || used >= account.linkedinSeats) {
      return Response.json(
        { error: "No LinkedIn seats left - add seats in Billing first" },
        { status: 400 }
      )
    }
    await db.teamMember.update({ where: { id: member.id }, data: { linkedinSeat: true } })
    await logAudit({
      ownerId: user.id,
      actorEmail: user.email,
      actorName: user.name ?? "",
      action: "team.seat_assigned",
      target: member.email,
    })
  } else if (body.action === "seat_off") {
    if (!member.linkedinSeat) {
      return Response.json({ error: `${member.email} holds no LinkedIn seat` }, { status: 400 })
    }
    await db.teamMember.update({ where: { id: member.id }, data: { linkedinSeat: false } })
    await logAudit({
      ownerId: user.id,
      actorEmail: user.email,
      actorName: user.name ?? "",
      action: "team.seat_freed",
      target: member.email,
    })
  } else if (typeof body.role === "string") {
    if (!ROLES.includes(body.role)) return Response.json({ error: "Invalid role" }, { status: 400 })
    await db.teamMember.update({ where: { id: member.id }, data: { role: body.role } })
    await logAudit({
      ownerId: user.id,
      actorEmail: user.email,
      actorName: user.name ?? "",
      action: "team.role_changed",
      target: member.email,
      detail: `role ${member.role} -> ${body.role}`,
    })
  } else {
    return Response.json({ error: "Nothing to update" }, { status: 400 })
  }
  return Response.json({ ok: true, member: await db.teamMember.findUnique({ where: { id: member.id } }) })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })
  const member = await db.teamMember.findFirst({ where: { id, ownerId: user.id } })
  if (!member) return Response.json({ error: "Team member not found" }, { status: 404 })
  await db.teamMember.delete({ where: { id } })
  await logAudit({
    ownerId: user.id,
    actorEmail: user.email,
    actorName: user.name ?? "",
    action: "team.removed",
    target: member.email,
  })
  return Response.json({ ok: true })
}
