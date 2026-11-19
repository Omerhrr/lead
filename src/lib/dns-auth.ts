// SPF / DKIM / DMARC authentication: every sending domain gets the three
// DNS records it must publish, and a checker resolves TXT records for real
// (DNS_AUTH_MODE=live) or deterministically in simulation (default).
// A hostname containing "fail" fails its DKIM check in simulation so the
// E2E suite can exercise the failure path.
import { promises as dns } from "dns"

export interface DnsRecordSet {
  spf: { host: string; value: string }
  dkim: { host: string; value: string }
  dmarc: { host: string; value: string }
}

const DKIM_KEY =
  "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC7TkN1eJLRJUq8ZLbXJ8G6QKdwZi02FqM9xTk3WvZbYwJm5tQ0nZ4Khr8o3M6pC2vWuFmLd1sHq9aXyE5gB0PzT8cR7uN4iKjLwV2DxAfGm1bS6hYQ3nO9pUeZCk8TtIvJr5XoM7lWgHsFbQy4dN2iKxA0mVZfPqC6RwJ3hT8nBIDAQAB"

export function expectedRecords(domain: string): DnsRecordSet {
  return {
    spf: { host: domain, value: "v=spf1 include:resend.dev ~all" },
    dkim: { host: `resend._domainkey.${domain}`, value: DKIM_KEY },
    dmarc: { host: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` },
  }
}

export type AuthStatus = "pending" | "pass" | "fail"

export interface DnsCheckResult {
  spf: AuthStatus
  dkim: AuthStatus
  dmarc: AuthStatus
}

function simulate(domain: string): DnsCheckResult {
  const fail = domain.toLowerCase().includes("fail")
  return {
    spf: fail ? "fail" : "pass",
    dkim: fail ? "fail" : "pass",
    dmarc: fail ? "fail" : "pass",
  }
}

async function hasTxt(host: string, needle: string): Promise<boolean> {
  try {
    const rows = await dns.resolveTxt(host)
    return rows.some((chunks) => chunks.join("").includes(needle))
  } catch {
    return false
  }
}

export async function checkDnsAuth(domain: string): Promise<DnsCheckResult> {
  const mode = (process.env.DNS_AUTH_MODE ?? "sim").toLowerCase()
  if (mode !== "live") return simulate(domain)

  const expected = expectedRecords(domain)
  const [spfOk, dkimOk, dmarcOk] = await Promise.all([
    hasTxt(expected.spf.host, "v=spf1"),
    hasTxt(expected.dkim.host, "v=DKIM1"),
    hasTxt(expected.dmarc.host, "v=DMARC1"),
  ])
  return {
    spf: spfOk ? "pass" : "fail",
    dkim: dkimOk ? "pass" : "fail",
    dmarc: dmarcOk ? "pass" : "fail",
  }
}
