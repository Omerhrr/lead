import { NextRequest } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// Tracked CTA link. Real sends wrap the campaign's ctaUrl as
// BASE/api/click/<messageId>?url=<encoded target>; each hit increments the
// message's click count, then the visitor is 302-redirected to the target.
// No session auth (mail clients cannot authenticate); the messageId is an
// unguessable cuid and only http(s) targets are allowed.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const target = req.nextUrl.searchParams.get("url") ?? ""

  const safe =
    /^https?:\/\//i.test(target) && !/[\s"'<>{}\\]/.test(target)
  if (!safe) {
    return new Response("Invalid redirect target", { status: 400 })
  }

  try {
    const msg = await db.message.findUnique({
      where: { id },
      select: { direction: true },
    })
    if (msg && msg.direction === "out") {
      await db.message.update({
        where: { id },
        data: { clicks: { increment: 1 }, clickedAt: new Date() },
      })
    }
  } catch {
    // never block the redirect on db hiccups
  }

  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store" },
  })
}
