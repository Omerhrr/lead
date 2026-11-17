// Pluggable email delivery hook.
//
// By default AutoGTM runs in simulation mode (the outreach engine is a
// compressed-time demo driven by synthetic leads). When a real provider is
// configured through env vars, every first-touch / follow-up email is handed
// to that provider for actual delivery and the outcome is recorded on the
// message row (deliveryStatus: simulated | delivered | failed).
//
//   RESEND_API_KEY               -> Resend HTTP API (no extra deps)
//   SMTP_HOST [+SMTP_PORT/USER/PASS/FROM] -> generic SMTP via nodemailer
//
// Nothing else in the engine changes: replies, autopilot and metering keep
// running the same way, so enabling a provider is zero-risk.

export interface SendEmailInput {
  to: string
  fromName: string
  fromEmail: string
  subject: string
  text: string
  html?: string // optional HTML part (used for the open-tracking pixel)
  headers?: Record<string, string> // extra RFC headers (List-Unsubscribe etc.)
}

export interface DeliveryResult {
  ok: boolean
  id?: string
  error?: string
}

export interface EmailProvider {
  name: string
  send(input: SendEmailInput): Promise<DeliveryResult>
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ])
}

// ------------------------------------------------------------------ Resend

class ResendProvider implements EmailProvider {
  name = "resend"

  async send(input: SendEmailInput): Promise<DeliveryResult> {
    const key = process.env.RESEND_API_KEY ?? ""
    const res = await withTimeout(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${input.fromName} <${input.fromEmail}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
          ...(input.html ? { html: input.html } : {}),
          ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
        }),
      }),
      8000
    )
    if (!res.ok) {
      return { ok: false, error: `resend responded ${res.status}` }
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: data.id }
  }
}

// -------------------------------------------------------------------- SMTP

class SmtpProvider implements EmailProvider {
  name = "smtp"

  async send(input: SendEmailInput): Promise<DeliveryResult> {
    const nodemailer = (await import("nodemailer")).default
    const port = Number(process.env.SMTP_PORT || 587)
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    })
    const info = await transport.sendMail({
      from: `"${input.fromName}" <${input.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.headers && Object.keys(input.headers).length > 0 ? { headers: input.headers } : {}),
    })
    return { ok: true, id: info.messageId }
  }
}

// -------------------------------------------------------------- resolution

let cached: EmailProvider | null | undefined

export function getEmailProvider(): EmailProvider | null {
  if (cached !== undefined) return cached
  if (process.env.RESEND_API_KEY) cached = new ResendProvider()
  else if (process.env.SMTP_HOST) cached = new SmtpProvider()
  else cached = null
  return cached
}

// test helper
export function resetProviderCache() {
  cached = undefined
}

export function isProviderConfigured(): boolean {
  return getEmailProvider() !== null
}

export function providerStatus(): {
  configured: boolean
  provider: string | null
  fromEmail: string | null
} {
  const p = getEmailProvider()
  return {
    configured: p !== null,
    provider: p?.name ?? null,
    fromEmail: process.env.RESEND_FROM || process.env.SMTP_FROM || null,
  }
}

export type DeliveryOutcome = "simulated" | "delivered" | "failed"

export async function deliverOutreach(
  input: SendEmailInput
): Promise<{ deliveryStatus: DeliveryOutcome; provider: string | null; id?: string }> {
  const p = getEmailProvider()
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
