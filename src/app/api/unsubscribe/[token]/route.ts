import { NextRequest } from "next/server"
import { unsubscribeByToken } from "@/lib/unsubscribe"

export const dynamic = "force-dynamic"

// One-click unsubscribe (RFC 8058). The token is mailed in the
// List-Unsubscribe headers and the opt-out footer of every email touch:
//   GET  -> human click: suppress + render a small confirmation page
//   POST -> mail-client one-click (List-Unsubscribe=One-Click): suppress + 200
// No session auth - recipients cannot authenticate; the token is an
// unguessable 32-hex secret stored per lead.

function confirmationPage(email: string, expired = false) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Unsubscribed - Jidout</title>
<style>body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;background:#f6f7f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px 48px;max-width:420px;text-align:center}
h1{font-size:20px;color:#0f172a;margin:0 0 8px}p{font-size:14px;color:#64748b;margin:0 0 6px;line-height:1.5}
.badge{display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600;margin-bottom:18px}
.badge.warn{background:#fffbeb;color:#b45309;border-color:#fde68a}</style></head>
<body><div class="card"><div class="badge${expired ? " warn" : ""}">${expired ? "&#9888;&nbsp; Link not valid" : "&#10003;&nbsp; Unsubscribed"}</div>
<h1>${expired ? "Nothing to do here" : "You won't hear from us again"}</h1>
<p>${expired ? "This unsubscribe link is not valid - the address may already be removed." : `${email} has been removed from this sender's outreach list.`}</p>
</div></body></html>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const result = await unsubscribeByToken(token)
  return new Response(confirmationPage(result.ok ? result.email : "", !result.ok), {
    status: result.ok ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const result = await unsubscribeByToken(token)
  if (!result.ok) return new Response("Not found", { status: 404 })
  // RFC 8058 one-click: the UA POSTs the List-Unsubscribe=One-Click body; 200 suffices
  return new Response("Unsubscribed", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  })
}
