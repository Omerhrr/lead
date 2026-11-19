// Small RFC 4180 CSV reader for lead list imports: quoted fields, escaped
// quotes, CRLF/LF row breaks, BOM tolerance. Row mapping accepts the common
// header aliases (email/name/company/title/location/linkedin url/website).
export interface CsvLeadRow {
  email: string
  name: string
  company: string
  title: string
  country: string
  linkedinUrl: string
}

export interface CsvParseResult {
  rows: CsvLeadRow[]
  errors: Array<{ row: number; reason: string }>
  headers: string[]
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.some((f) => f.trim() !== "")) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== "")) rows.push(row)
  return rows
}

function pick(row: string[], headers: string[], ...aliases: string[]): string {
  for (const a of aliases) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === a)
    if (idx >= 0 && row[idx] !== undefined) return row[idx].trim()
  }
  return ""
}

export function parseLeadCsv(input: string): CsvParseResult {
  const table = parseCsv(input)
  if (table.length === 0) {
    return { rows: [], errors: [{ row: 0, reason: "empty file" }], headers: [] }
  }
  const headers = table[0]
  const rows: CsvLeadRow[] = []
  const errors: Array<{ row: number; reason: string }> = []
  const seen = new Set<string>()
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const lineNo = i + 1
    const email = pick(cells, headers, "email", "e-mail", "email address", "work email").toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.push({ row: lineNo, reason: email ? "invalid email syntax" : "missing email" })
      continue
    }
    if (seen.has(email)) {
      errors.push({ row: lineNo, reason: "duplicate in file" })
      continue
    }
    seen.add(email)
    rows.push({
      email,
      name: pick(cells, headers, "name", "full name", "first name", "contact") || email.split("@")[0],
      company: pick(cells, headers, "company", "company name", "organization", "account"),
      title: pick(cells, headers, "title", "job title", "role", "position"),
      country: pick(cells, headers, "country", "location", "region"),
      linkedinUrl: pick(cells, headers, "linkedin_url", "linkedin", "linkedin url", "profile"),
    })
  }
  return { rows, errors, headers }
}
