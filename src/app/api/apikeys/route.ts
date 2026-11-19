import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { newApiKey } from "@/lib/api-auth"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

// API key management (the keys themselves authenticate the public v1 API).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const keys = await db.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true,
    },
  })
  return Response.json({ keys })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? "").trim().slice(0, 60) || "Untitled key"
  const generated = newApiKey()
  const key = await db.apiKey.create({
    data: {
      userId: user.id,
      name,
      prefix: generated.prefix,
      hash: generated.hash,
    },
  })
  await logAudit({
    ownerId: user.id,
    actorEmail: user.email,
    actorName: user.name ?? "",
    action: "apikey.created",
    target: name,
    detail: `prefix ${generated.prefix}`,
  })
  // the raw key is returned exactly once - only its sha256 lives in the db
  return Response.json({ ok: true, key: { id: key.id, name: key.name, prefix: key.prefix, raw: generated.raw } })
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const id = new URL(req.url).searchParams.get("id") ?? ""
  const key = await db.apiKey.findUnique({ where: { id } })
  if (!key || key.userId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } })
  await logAudit({
    ownerId: user.id,
    actorEmail: user.email,
    actorName: user.name ?? "",
    action: "apikey.revoked",
    target: key.name,
    detail: `prefix ${key.prefix}`,
  })
  return Response.json({ ok: true })
}
