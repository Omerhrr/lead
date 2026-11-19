// Public API v1 authentication: Bearer keys hashed at rest (sha256), shown
// once at creation, revocable. A tiny in-memory rate limiter (60 req/min per
// key) protects the read endpoints.
import { createHash } from "crypto"
import { db } from "@/lib/db"

export const API_RATE_LIMIT = 60 // requests per minute per key
export const API_RATE_WINDOW_MS = 60_000

const buckets = new Map<string, { count: number; resetAt: number }>()

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function newApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `jd_live_${randomToken(32)}`
  return { raw, prefix: raw.slice(0, 16), hash: hashApiKey(raw) }
}

function randomToken(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSec: number
}

export function rateLimit(keyId: string): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(keyId)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(keyId, { count: 1, resetAt: now + API_RATE_WINDOW_MS })
    return { allowed: true, remaining: API_RATE_LIMIT - 1, resetInSec: API_RATE_WINDOW_MS / 1000 }
  }
  bucket.count++
  const remaining = Math.max(0, API_RATE_LIMIT - bucket.count)
  return {
    allowed: bucket.count <= API_RATE_LIMIT,
    remaining,
    resetInSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

export interface ApiAuth {
  ok: boolean
  status: number
  error?: string
  userId?: string
  keyId?: string
  headers?: Record<string, string>
}

// Resolve + validate the request's Bearer key against the workspace owner.
export async function authenticateApiKey(req: Request): Promise<ApiAuth> {
  const header = req.headers.get("authorization") ?? ""
  const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!raw) {
    return { ok: false, status: 401, error: "Missing API key - send Authorization: Bearer jd_live_..." }
  }
  const key = await db.apiKey.findUnique({ where: { hash: hashApiKey(raw) } })
  if (!key || key.revokedAt) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" }
  }
  const limit = rateLimit(key.id)
  const headers = {
    "X-RateLimit-Limit": String(API_RATE_LIMIT),
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": String(limit.resetInSec),
  }
  if (!limit.allowed) {
    return { ok: false, status: 429, error: `Rate limit exceeded - ${API_RATE_LIMIT} requests/min`, headers }
  }
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
  return { ok: true, status: 200, userId: key.userId, keyId: key.id, headers }
}
