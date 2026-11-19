import { NextRequest } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// 1x1 transparent GIF - the open-tracking beacon.
// Email clients fetch <img src="BASE/api/open/<messageId>"> embedded in the
// HTML part of every real send; each hit increments the message's open count.
// No session auth (mail clients cannot authenticate); the messageId is an
// unguessable cuid and the route only flips counters.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const msg = await db.message.findUnique({
      where: { id },
      select: { id: true, direction: true, kind: true },
    })
    if (msg && msg.direction === "out" && msg.kind === "touch") {
      await db.message.update({
        where: { id },
        data: { opens: { increment: 1 }, openedAt: new Date() },
      })
    }
  } catch {
    // never break image rendering on db hiccups
  }

  return new Response(new Uint8Array(PIXEL), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Length": String(PIXEL.length),
    },
  })
}
