import { NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Resend webhook receiver — complements the in-house open/click pixel for
// real sends. Set RESEND_WEBHOOK_SECRET (Svix "whsec_..." signing secret) in
// production; without it the route accepts unsigned events (demo mode).
// Handled events:
//   email.opened   -> message.opens +1, openedAt stamped
//   email.clicked  -> message.clicks +1, clickedAt stamped
//   email.delivered-> flips a pending message to delivered
// Events map to a message row through Message.providerMessageId, which the
// engine stores from the Resend send response.

function verifySvix(headers: Headers, rawBody: string, secret: string): boolean {
  const id = headers.get("svix-id")
  const ts = headers.get("svix-timestamp")
  const signatures = (headers.get("svix-signature") ?? "").split(" ").filter(Boolean)
  if (!id || !ts || signatures.length === 0) return false
  // reject replayed timestamps older than 5 minutes
  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > 300) return false
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret
  const mac = createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${id}.${ts}.${rawBody}`)
    .digest("base64")
  return signatures.some((s) => {
    if (!s.startsWith("v1,")) return false
    const given = Buffer.from(s.slice(3), "base64")
    const expected = Buffer.from(mac, "base64")
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret && !verifySvix(req.headers, raw, secret)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  let payload: { type?: string; data?: { email_id?: string; click?: { link?: string } } } | null
  try {
    payload = JSON.parse(raw)
  } catch {
    return Response.json({ error: "Malformed webhook payload" }, { status: 400 })
  }
  if (!payload || typeof payload.type !== "string") {
    return Response.json({ error: "Malformed webhook payload" }, { status: 400 })
  }

  const emailId = payload.data?.email_id
  if (!emailId || typeof emailId !== "string") {
    return Response.json({ error: "Missing data.email_id" }, { status: 400 })
  }

  const msg = await db.message.findFirst({
    where: { providerMessageId: emailId },
    select: { id: true, direction: true },
  })
  if (!msg || msg.direction !== "out") {
    // unknown id: acknowledge so Resend stops retrying
    return Response.json({ ok: true, matched: false })
  }

  switch (payload.type) {
    case "email.opened":
      await db.message.update({
        where: { id: msg.id },
        data: { opens: { increment: 1 }, openedAt: new Date() },
      })
      break
    case "email.clicked":
      await db.message.update({
        where: { id: msg.id },
        data: { clicks: { increment: 1 }, clickedAt: new Date() },
      })
      break
    case "email.delivered":
      await db.message.updateMany({
        where: { id: msg.id, deliveryStatus: "pending" },
        data: { deliveryStatus: "delivered" },
      })
      break
    default:
      return Response.json({ ok: true, ignored: payload.type })
  }
  return Response.json({ ok: true, matched: true, event: payload.type })
}
