// AI layer — replaces Explee's agent intelligence with z-ai LLM calls.
// Backend-only (z-ai-web-dev-sdk). Every function has a deterministic
// fallback so the engine never stalls if the LLM is unavailable.

import ZAI from "z-ai-web-dev-sdk"

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZai() {
  if (!zaiInstance) zaiInstance = await ZAI.create()
  return zaiInstance
}

async function llm(system: string, user: string, timeoutMs = 20000): Promise<string | null> {
  try {
    const zai = await getZai()
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: user },
        ],
        thinking: { type: "disabled" },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])) as Awaited<ReturnType<typeof zai.chat.completions.create>> | null
    const content = completion?.choices?.[0]?.message?.content
    return content && content.trim().length > 0 ? content : null
  } catch {
    return null
  }
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
  const start = cleaned.search(/[[{]/)
  if (start === -1) return null
  const candidate = cleaned.slice(start)
  try {
    return JSON.parse(candidate) as T
  } catch {
    try {
      return JSON.parse(candidate.substring(0, candidate.lastIndexOf("}") + 1)) as T
    } catch {
      return null
    }
  }
}

// ---------- nl-to-filters (mirrors their /search/nl-to-filters group) ----------

export interface LeadFilters {
  industries: string[]
  titles: string[]
  geography: string[]
  companySize: string[]
  keywords: string[]
}

const FILTER_SYSTEM = `You convert a B2B outreach campaign brief into structured targeting filters.
Respond with ONLY valid JSON, no markdown, matching exactly:
{"industries":["..."],"titles":["..."],"geography":["..."],"companySize":["1-10","11-50","51-200","201-500","500+"],"keywords":["..."]}
Rules: industries are business categories (max 4), titles are buyer personas (max 5, use words like "founder","ceo","marketing","operations"), geography is country names, companySize uses only the allowed buckets, keywords are 3-7 search keywords.`

export async function nlToFilters(brief: {
  offer: string
  customerProblem: string
  targetRole: string
  targetGeography: string
  targetCompanySize: string
  keywords: string
}): Promise<LeadFilters> {
  const user = `Campaign brief:\nOffer: ${brief.offer}\nCustomer problem: ${brief.customerProblem}\nTarget role: ${brief.targetRole}\nTarget geography: ${brief.targetGeography}\nTarget company size: ${brief.targetCompanySize}\nKeywords: ${brief.keywords}\nReturn the JSON filters only.`
  const parsed = parseJson<LeadFilters>(await llm(FILTER_SYSTEM, user))
  if (parsed && Array.isArray(parsed.industries)) {
    return {
      industries: (parsed.industries || []).slice(0, 4),
      titles: (parsed.titles || []).slice(0, 5),
      geography: (parsed.geography || []).slice(0, 5),
      companySize: (parsed.companySize || []).slice(0, 5),
      keywords: (parsed.keywords || []).slice(0, 8),
    }
  }
  // deterministic fallback
  return {
    industries: brief.keywords
      ? brief.keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
      : [],
    titles: brief.targetRole
      ? brief.targetRole.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
      : [],
    geography: brief.targetGeography
      ? brief.targetGeography.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
      : [],
    companySize: brief.targetCompanySize
      ? brief.targetCompanySize.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
      : [],
    keywords: [],
  }
}

// ---------- "My copy" — AI first-touch email ----------

export interface CampaignCopy {
  subject: string
  body: string
  warnings: string[]
}

const COPY_SYSTEM = `You write B2B cold outreach first-touch emails for an AI sales agent.
Write in the style of top 1% cold emailers: under 90 words, no fluff, personal hook in the first line referencing a specific fact, one clear CTA (soft ask), no "I hope this finds you well".
The body MUST use these merge tokens exactly once each where natural: {{first_name}}, {{company}}, {{hook}}. Sign off with just {{sender_name}}.
Also return 0-3 warnings about the brief (e.g. offer too vague, no social proof, overly broad ICP).
Respond with ONLY valid JSON: {"subject":"...","body":"...","warnings":["..."]}
The subject line: under 8 words, lowercase style acceptable, no clickbait, may reference {{company}}.`

export async function generateCampaignCopy(brief: {
  companyName: string
  senderName: string
  offer: string
  customerProblem: string
  targetRole: string
  language: string
  keywords: string
}): Promise<CampaignCopy> {
  const user = `Company sending: ${brief.companyName} (sender: {{sender_name}})\nOffer: ${brief.offer}\nProblem it solves: ${brief.customerProblem}\nTarget person: ${brief.targetRole}\nLanguage: ${brief.language}\nKeywords: ${brief.keywords}\nWrite the JSON now.`
  const parsed = parseJson<CampaignCopy>(await llm(COPY_SYSTEM, user))
  if (parsed && parsed.subject && parsed.body) {
    return {
      subject: parsed.subject,
      body: parsed.body,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 3) : [],
    }
  }
  // deterministic fallback
  const kw = brief.keywords || brief.customerProblem
  return {
    subject: `${brief.offer.split(".")[0].slice(0, 6) || "Quick idea"} for {{company}}`,
    body: `Hi {{first_name}},\n\nI noticed {{company}} — {{hook}}.\n\n${brief.offer} We solve exactly that: ${brief.customerProblem}\n\nWorth a quick look? I can send a 2-minute overview.\n\n{{sender_name}}`,
    warnings: ["Generated from fallback template — regenerate for AI polish"],
  }
}

// ---------- A/B/C split-test arms — fresh angle for an added variant ----------

// Writes a DIFFERENT angle than the control copy so a new arm is a real test,
// not a duplicate. Deterministic question-style fallback keeps the flow alive.
export async function generateVariantAlternative(ctx: {
  offer: string
  customerProblem: string
  language: string
  controlSubject: string
  controlBody: string
}): Promise<{ subject: string; body: string }> {
  const user = `Offer: ${ctx.offer}\nProblem it solves: ${ctx.customerProblem}\nLanguage: ${ctx.language}\n\nControl subject: """${ctx.controlSubject}"""\nControl body: """${ctx.controlBody}"""\n\nWrite a DIFFERENT angle for the same offer: different hook and opening line, same token rules. Return JSON: {"subject":"...","body":"..."}`
  const parsed = parseJson<{ subject?: string; body?: string }>(
    await llm(COPY_SYSTEM, user, 12000)
  )
  if (parsed?.subject && parsed?.body) {
    return { subject: parsed.subject, body: parsed.body }
  }
  const subj = ctx.controlSubject.replace(/[.?!]+$/, "")
  return {
    subject: `quick question about ${subj}`.slice(0, 80),
    body: `Hi {{first_name}} — quick question: does {{hook}} at {{company}} cost you deals today?\n\n${ctx.customerProblem} is what we fix, ${ctx.offer.toLowerCase()}\n\nOpen to a 15-minute look?\n\n{{sender_name}}`,
  }
}

// ---------- Autopilot reply generation ----------

const AUTOPILOT_SYSTEM = `You are an AI sales autopilot replying to a warm inbound lead for the company described. Reply in under 80 words, human, no headers, no signatures beyond nothing, no markdown. Match the lead's tone. If the stage is "propose_meeting", offer two specific weekday time slots. If the stage is "confirm", confirm the chosen slot warmly and mention sending a calendar invite. If the stage is "answer", answer the lead's question crisply and end with a soft nudge toward a short call.`

export async function autopilotReply(ctx: {
  companyName: string
  offer: string
  customerProblem: string
  leadName: string
  leadCompany: string
  leadMessage: string
  stage: "propose_meeting" | "confirm" | "answer"
  slot?: string
}): Promise<string> {
  const user = `Company: ${ctx.companyName}\nOffer: ${ctx.offer}\nProblem solved: ${ctx.customerProblem}\nLead: ${ctx.leadName} at ${ctx.leadCompany} said:\n"""${ctx.leadMessage}"""\nStage: ${ctx.stage}${ctx.slot ? `\nChosen slot: ${ctx.slot}` : ""}\nWrite only the reply text.`
  const text = await llm(AUTOPILOT_SYSTEM, user, 12000)
  if (text) return text.trim()
  // fallbacks keep the engine alive without the LLM
  if (ctx.stage === "propose_meeting")
    return `Great to hear, ${ctx.leadName.split(" ")[0]} — this is exactly what we built for ${ctx.leadCompany}. Would Thursday 10:00 or Friday 14:00 work for a quick 15-minute call?`
  if (ctx.stage === "confirm")
    return `${ctx.slot || "That slot"} works perfectly — calendar invite is on its way. Looking forward to it!`
  return `Good question. In short: ${ctx.customerProblem} — we handle it end to end, typically live within a week. Happy to walk you through it in 15 minutes if useful.`
}

// ---------- Segments Explorer (mirrors /tools/explorer) ----------

export interface MarketCluster {
  name: string
  description: string
  tamCompanies: number
  neighboringNiches: string[]
}

const EXPLORER_SYSTEM = `You are a market research engine. Given business keywords, return 3 market clusters a company could target.
Respond with ONLY valid JSON: {"clusters":[{"name":"...","description":"one sentence","tamCompanies":12345,"neighboringNiches":["...","..."]}]}
tamCompanies is your realistic estimate of companies worldwide in that cluster.`

export async function explorerClusters(query: string): Promise<MarketCluster[]> {
  const parsed = parseJson<{ clusters: MarketCluster[] }>(
    await llm(EXPLORER_SYSTEM, `Keywords: ${query}. Return the JSON clusters.`, 20000)
  )
  if (parsed && Array.isArray(parsed.clusters)) {
    return parsed.clusters.slice(0, 3).map((c) => ({
      name: c.name,
      description: c.description,
      tamCompanies: Math.max(500, Math.round(c.tamCompanies || 10000)),
      neighboringNiches: Array.isArray(c.neighboringNiches) ? c.neighboringNiches.slice(0, 4) : [],
    }))
  }
  const base = query.split(/[,;]+/)[0]?.trim() || "niche"
  return [
    { name: `Core ${base} providers`, description: `Businesses whose primary offer is ${base}.`, tamCompanies: 42000, neighboringNiches: [`${base} suppliers`, `${base} software`] },
    { name: `Adjacent ${base} services`, description: `Companies buying ${base} services to resell or bundle.`, tamCompanies: 18000, neighboringNiches: ["agencies", "consultancies"] },
    { name: `${base} franchises`, description: `Franchise and multi-location operators in ${base}.`, tamCompanies: 7300, neighboringNiches: ["franchise groups", "regional chains"] },
  ]
}
