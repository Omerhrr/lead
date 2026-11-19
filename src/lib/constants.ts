// Shared constants - client-safe (no server-only imports).
// Pay-as-you-go pricing:
// $30 => 750 emails, median CPL ~$9, $10/1k database emails.

export const TRIAL_CREDITS_USD = 30
export const EMAIL_PRICE_USD = 0.04 // $30 / 750 emails
export const EMAILS_PER_30_USD = Math.round(30 / EMAIL_PRICE_USD) // 750
export const DOMAIN_PRICE_USD = 12 // platform-bought sending domain (yearly)
export const MAILBOXES_PER_DOMAIN = 2
export const EMAILS_PER_DOMAIN_DAY = 40
// Deliverability warming: every new sending domain ramps its daily volume up
// step by step (tick-advanced in the demo) until it reaches the full cap.
export const WARM_START_EMAILS = 10
export const WARM_STEP_EMAILS = 10
// Scheduled campaign digest - demo-compressed "week" (real product: 7 days).
export const REPORT_INTERVAL_MS = Number(process.env.REPORT_INTERVAL_MS || 120_000)
export const LINKEDIN_SEAT_PRICE_USD = 29
export const LINKEDIN_TOUCH_PRICE_USD = 0.12
export const DATABASE_EMAIL_PRICE_PER_1K = 10
export const MEDIAN_CPL_USD = 9
export const TOPUP_PRESETS = [30, 60, 120, 300]

// Pre-send mailbox verification: charged per checked address (cheap checks
// catch disposables, role accounts and dead domains before we spend a send).
export const VERIFY_PRICE_USD = 0.005

// Per-result pricing: the success fee charged once per warm lead (positive
// reply or booked meeting). Explee's range is $1-20, median $9.
export const WARM_LEAD_FEE_MIN_USD = 1
export const WARM_LEAD_FEE_MAX_USD = 20

// Campaign languages - the AI writes outreach in any of these (30, mirroring
// the real product's language list). The deterministic engine fallback
// localizes follow-ups for the LANG_LOCALIZED subset.
export const LANGUAGES = [
  "English", "Spanish", "French", "German", "Portuguese", "Italian", "Dutch",
  "Swedish", "Norwegian", "Danish", "Finnish", "Polish", "Czech", "Hungarian",
  "Romanian", "Bulgarian", "Greek", "Turkish", "Arabic", "Hebrew", "Hindi",
  "Urdu", "Bengali", "Indonesian", "Vietnamese", "Thai", "Japanese",
  "Korean", "Chinese (Simplified)", "Russian",
] as const

// Pre-warmed domain store: ready-to-send domains rented at the standard
// domain price, skipping the warming ramp entirely (day-one deliverability).
export const PREWARMED_STORE: Array<{
  name: string
  reputation: number
  warmedDays: number
  emailsSent: number
  mailboxAgeDays: number
}> = [
  { name: "warmreach-out.com", reputation: 98, warmedDays: 45, emailsSent: 41200, mailboxAgeDays: 62 },
  { name: "brightsend.co", reputation: 97, warmedDays: 38, emailsSent: 33500, mailboxAgeDays: 51 },
  { name: "reachwave-mail.com", reputation: 96, warmedDays: 33, emailsSent: 28100, mailboxAgeDays: 47 },
  { name: "inboxpilot.dev", reputation: 95, warmedDays: 29, emailsSent: 22400, mailboxAgeDays: 40 },
  { name: "leadrelay.app", reputation: 93, warmedDays: 24, emailsSent: 15800, mailboxAgeDays: 33 },
  { name: "goldenhelm.com", reputation: 92, warmedDays: 21, emailsSent: 11900, mailboxAgeDays: 28 },
]

export const FREEMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "proton.me", "protonmail.com", "mail.ru", "yandex.com",
  "qq.com", "163.com", "126.com", "gmx.de", "web.de", "live.com",
  "msn.com", "hey.com", "fastmail.com", "zoho.com", "tutanota.com",
]

// Campaign lifecycle state machine (mirrors CampaignStatusResponse:
// state / sending_now / next_action / allowed_actions)
export const CAMPAIGN_STATES = [
  "draft", "pool_ready", "approved", "sending", "paused", "completed", "archived",
] as const

export type CampaignState = (typeof CAMPAIGN_STATES)[number]

export const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  pool_ready: "Lead pool ready",
  approved: "Approved",
  sending: "Sending",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
}

export const REPLY_RATE_LABEL = "97% inbox rate" // public stat from their site

export function allowedActions(state: string): string[] {
  switch (state) {
    case "draft": return ["edit"]
    case "pool_ready": return ["approve", "archive", "edit"]
    case "approved": return ["start", "archive", "edit"]
    case "sending": return ["stop", "archive"]
    case "paused": return ["resume", "archive", "edit"]
    case "completed": return ["archive"]
    case "archived": return ["unarchive"]
    default: return []
  }
}

export function stateBadgeClass(state: string): string {
  switch (state) {
    case "sending": return "bg-emerald-100 text-emerald-800 border-emerald-200"
    case "paused": return "bg-amber-100 text-amber-800 border-amber-200"
    case "approved": return "bg-lime-100 text-lime-800 border-lime-200"
    case "pool_ready": return "bg-stone-100 text-stone-700 border-stone-200"
    case "completed": return "bg-teal-100 text-teal-800 border-teal-200"
    case "archived": return "bg-neutral-100 text-neutral-500 border-neutral-200"
    default: return "bg-stone-100 text-stone-600 border-stone-200"
  }
}

export function money(usd: number): string {
  if (Math.abs(usd) >= 100) return `$${usd.toFixed(0)}`
  if (Number.isInteger(usd)) return `$${usd}`
  return `$${usd.toFixed(2)}`
}
