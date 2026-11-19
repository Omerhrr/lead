// Pluggable LinkedIn delivery hook - the channel twin of email-provider.ts.
//
// LinkedIn touches (DM-shaped follow-ups to leads with a profile URL) are
// simulated by default, exactly like emails: the engine still meters them,
// bills the $0.12/touch + $29/seat-month and records replies. When a real
// token is configured, each LinkedIn touch is handed to the LinkedIn API and
// the outcome lands on the message row (deliveryStatus: simulated | delivered
// | failed).
//
//   LINKEDIN_ACCESS_TOKEN        -> LinkedIn member/organization API token
//   LINKEDIN_API_URL             -> optional API base override (default
//                                   https://api.linkedin.com) - used by the
//                                   E2E suite to point at a local mock
//
// Nothing else in the engine changes: the channel mix, seat assignment and
// billing keep running the same way, so enabling the adapter is zero-risk.

export interface SendLinkedInInput {
  memberUrl: string // the lead's profile URL - sent as the recipient reference
  senderName: string
  text: string // DM body (no subject line - LinkedIn has none)
}

export interface DeliveryResult {
  ok: boolean
  id?: string
  error?: string
}

export interface LinkedInProvider {
  name: string
  send(input: SendLinkedInInput): Promise<DeliveryResult>
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ])
}

// ------------------------------------------------------- LinkedIn ugcPosts API

class LinkedinApiProvider implements LinkedInProvider {
  name = "linkedin"

  async send(input: SendLinkedInInput): Promise<DeliveryResult> {
    const token = process.env.LINKEDIN_ACCESS_TOKEN ?? ""
    const base = process.env.LINKEDIN_API_URL || "https://api.linkedin.com"
    const res = await withTimeout(
      fetch(`${base}/v2/ugcPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: input.senderName,
          recipient: input.memberUrl,
          text: input.text,
        }),
      }),
      8000
    )
    if (!res.ok) {
      return { ok: false, error: `linkedin api responded ${res.status}` }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: data.id }
  }
}

// -------------------------------------------------------------- resolution

// Re-read on every call (cheap): the E2E suite can flip the env without
// restarting, and per-send resolution mirrors the engine's per-touch loop.
export function getLinkedinProvider(): LinkedInProvider | null {
  if (process.env.LINKEDIN_ACCESS_TOKEN) return new LinkedinApiProvider()
  return null
}

export function isLinkedinConfigured(): boolean {
  return getLinkedinProvider() !== null
}

export type DeliveryOutcome = "simulated" | "delivered" | "failed"

export async function deliverLinkedInTouch(
  input: SendLinkedInInput
): Promise<{ deliveryStatus: DeliveryOutcome; provider: string | null; id?: string }> {
  const p = getLinkedinProvider()
  if (!p) return { deliveryStatus: "simulated", provider: null }
  try {
    const r = await p.send(input)
    return r.ok
      ? { deliveryStatus: "delivered", provider: p.name, id: r.id }
      : { deliveryStatus: "failed", provider: p.name }
  } catch {
    return { deliveryStatus: "failed", provider: p.name }
  }
}
