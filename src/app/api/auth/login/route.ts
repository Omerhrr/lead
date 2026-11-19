import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { SESSION_COOKIE, ensureBilling, isWorkEmail } from "@/lib/auth"
import { TRIAL_CREDITS_USD } from "@/lib/constants"

export const dynamic = "force-dynamic"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.email || typeof body.email !== "string") {
    return NextResponse.json({ error: "Work email is required" }, { status: 400 })
  }
  const email = body.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That doesn't look like a valid email" }, { status: 400 })
  }

  const viaLinkedin = !!body.viaLinkedin
  if (!viaLinkedin && !isWorkEmail(email)) {
    // work-emails-only registration gate
    return NextResponse.json(
      { error: "Please use your work email - free providers (gmail, outlook...) can't register" },
      { status: 400 }
    )
  }

  const existing = await db.user.findUnique({ where: { email } })
  const isNew = !existing
  const user = await db.user.upsert({
    where: { email },
    update: { name: body.name ?? undefined, viaLinkedin },
    create: { email, name: body.name ?? null, viaLinkedin },
  })
  await ensureBilling(user.id, isNew)

  const jar = await cookies()
  jar.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })

  return NextResponse.json({
    user,
    trialCredits: isNew ? TRIAL_CREDITS_USD : null,
  })
}
