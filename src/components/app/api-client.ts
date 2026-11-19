// Typed fetch client for the Jidout API.

export interface BillingSummary {
  prepaidBalanceUsd: number
  spentTodayUsd: number
  spentThisMonthUsd: number
  monthlyCapUsd: number
  dailyBudgetUsd: number
  emailPriceUsd: number
  linkedinSeats: number
}

export interface MeResponse {
  user: { id: string; email: string; name: string | null; viaLinkedin: boolean } | null
  billing: (BillingSummary & { linkedinSeatPriceUsd: number; postpaidEnabled: boolean }) | null
  project: {
    id: string
    companyDomain: string
    companyName: string
    senderName: string
    senderTitle: string
  } | null
  campaignCount: number
}

export interface CampaignListItem {
  id: string
  name: string
  state: string
  sendingNow: boolean
  nextAction: string
  createdAt: string
  variantTest: boolean
  poolCount: number
  approvedCount: number
  hotCount: number
  bookedCount: number
}

export interface Lead {
  id: string
  name: string
  title: string
  company: string
  companyDomain: string
  industry: string
  companySize: string
  country: string
  city: string | null
  email: string
  linkedinUrl: string | null
  score: number
  reasons: string | null
  status: string
  convStatus: string | null
  isHot: boolean
  sentiment: string | null
  notes: string | null
  touchCount: number
  meetingAt: string | null
  verifyStatus: string
  verifyReason: string | null
  source: string
  successFeeCharged: boolean
  createdAt: string
}

export interface VariantRow {
  id: string
  label: string
  subject: string
  body: string
}

export interface VariantStat {
  id: string
  label: string
  assigned: number
  sent: number
  replied: number
  replyRate: number
  opened: number
  openRate: number
  clicked: number
  clickRate: number
  hot: number
  booked: number
}

export interface SplitTestSummary {
  leader: string | null
  pValue: number | null
  significant: boolean
  eligible: boolean
  leaderRate: number
  runnerRate: number
  minSends: number
}

export interface DeliveryStatus {
  configured: boolean
  provider: string | null
  fromEmail: string | null
  counts: { simulated: number; delivered: number; failed: number }
}

export interface CampaignDetail {
  id: string
  name: string
  offer: string
  customerProblem: string
  targetRole: string
  targetGeography: string
  targetCompanySize: string
  positiveCriteria: string | null
  negativeCriteria: string | null
  exampleClients: string | null
  keywords: string | null
  instructions: string | null
  followupInstructions: string | null
  language: string
  verifyPolicy: string
  maxTouches: number
  delayDays: number
  autopilotEnabled: boolean
  autoReplyEnabled: boolean
  autoReplyDelayMinutes: number
  copySubject: string | null
  copyBody: string | null
  copyWarnings: string[]
  ctaUrl: string | null
  variantTest: boolean
  autoPromote: boolean
  linkedinEnabled: boolean
  variants: VariantRow[]
  variantStats: VariantStat[]
  splitTest: SplitTestSummary | null
  topLinks: Array<{ url: string; clicks: number }>
  linkedinTouches: number
  emailTouches: number
  state: string
  sendingNow: boolean
  nextAction: string
  dailyBudgetUsd: number
  allowedActions: string[]
  stats: {
    spendUsd: number
    warm: number
    cplUsd: number | null
    verifyValid: number
    verifyRisky: number
    verifyInvalid: number
    verifyUnknown: number
  }
  leads: Lead[]
  project: { companyName: string; senderName: string; companyDomain: string }
}

export interface MessageRow {
  id: string
  direction: string
  channel: string
  kind: string
  touchIndex: number
  subject: string | null
  body: string
  status: string
  opens: number
  clicks: number
  variantId: string | null
  deliveryStatus: string
  provider: string | null
  createdAt: string
  lead?: { name: string; company: string }
}

export interface OverviewResponse {
  campaigns: Array<{
    id: string
    name: string
    state: string
    sendingNow: boolean
    nextAction: string
    createdAt: string
    spendUsd: number
    cplUsd: number | null
  }>
  meetings: Array<{
    id: string
    startsAt: string
    status: string
    leadName: string
    leadCompany: string
    campaignName: string
  }>
  stats: {
    emailsSent: number
    linkedinTouches: number
    replies: number
    replyRate: number
    hotLeads: number
    booked: number
    poolSize: number
    approved: number
    cpl: number
    emailsPer30: number
  }
  billing: BillingSummary
  usage: Array<{ date: string; emailsSent: number; linkedinTouches: number; repliesReceived: number; hotLeads: number; meetingsBooked: number; spendUsd: number }>
  hotLeads: Array<{ id: string; name: string; company: string; title: string; score: number; convStatus: string | null; meetingAt: string | null }>
  activity: MessageRow[]
  unread: number
  report: {
    cadence: string
    lastReportAt: string | null
    reportCount: number
    nextReportInSec: number | null
  }
}

export interface ConversationRow {
  id: string
  name: string
  title: string
  company: string
  isHot: boolean
  convStatus: string | null
  sentiment: string | null
  meetingAt: string | null
  campaignName: string
  lastMessage: { direction: string; body: string; createdAt: string } | null
}

export interface DnsRecord {
  host: string
  value: string
}

export interface DomainRow {
  id: string
  domain: string
  source: string
  status: string
  emailsPerDay: number
  warmedDays: number
  mailboxes: number
  createdAt: string
  preWarmed: boolean
  reputation: number
  spfStatus: string
  dkimStatus: string
  dmarcStatus: string
  dnsCheckedAt: string | null
  dnsRecords: { spf: DnsRecord; dkim: DnsRecord; dmarc: DnsRecord }
}

export interface StoreListing {
  name: string
  reputation: number
  warmedDays: number
  emailsSent: number
  mailboxAgeDays: number
  priceUsd: number
  rented: boolean
}

export interface DomainsResponse {
  domains: DomainRow[]
  store: StoreListing[]
  plan: {
    targetEmailsPerDay: number
    emailsPerDomainDay: number
    mailboxesPerDomain: number
    domainsNeeded: number
    owned: number
    warming: number
    ownedCapacity: number
    toBuy: number
    pricePerDomainUsd: number
    estimatedCostUsd: number
  }
}

export interface BillingResponse {
  account: BillingSummary & {
    linkedinSeatPriceUsd: number
    postpaidEnabled: boolean
    pricingModel: string
    warmLeadFeeUsd: number
  }
  emailsRemaining: number
  transactions: Array<{
    id: string
    type: string
    amountUsd: number
    balanceAfter: number
    description: string
    createdAt: string
  }>
  usage: Array<{ date: string; emailsSent: number; linkedinTouches: number; repliesReceived: number; hotLeads: number; meetingsBooked: number; spendUsd: number }>
}

export interface ExplorerResponse {
  query: string
  clusters: Array<{ name: string; description: string; tamCompanies: number; neighboringNiches: string[] }>
  database: {
    companiesIndexed: number
    peopleIndexed: number
    matches: number
    matchedCompanies: Array<{ name: string; industry: string; size: string; country: string; city: string }>
    industryBreakdown: Array<{ industry: string; count: number }>
  }
}

export interface TeamMemberRow {
  id: string
  email: string
  name: string
  role: string
  status: string
  linkedinSeat: boolean
  createdAt: string
}

export interface TeamResponse {
  owner: { email: string; name: string | null }
  members: TeamMemberRow[]
  seats: { linkedinSeats: number; seatsUsed: number; seatsAvailable: number }
}

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface ApiKeysResponse {
  keys: ApiKeyRow[]
}

export interface CsvImportPreview {
  headers: string[]
  totalRows: number
  importable: number
  duplicateInFile: number
  malformed: Array<{ row: number; reason: string }>
  skipped: Array<{ email: string; reason: string }>
  sample: Array<{ email: string; name: string; company: string; title: string; country: string }>
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`)
  }
  return data as T
}

export const post = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) })
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) })
export const del = <T>(path: string) => api<T>(path, { method: "DELETE" })
