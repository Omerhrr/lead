# Jidout

**Jidout** (Arabic *jid*, "find" + Japanese *jidou*, "automatic") is a 24/7 AI outbound-sales agent built as a
single Next.js application. Write a campaign brief, get an AI-scored lead pool from a 105M-company style
B2B database, approve it, and autopilot runs the sequence: email + LinkedIn touches, tracked opens and
clicks, replies, negotiation autopilot, meetings - all metered against a prepaid balance.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, standalone output), React 19, Tailwind 4 + shadcn/ui |
| DB | Prisma 6 + SQLite (zero-config, file-based) |
| Email | Provider hook: Resend HTTP API or generic SMTP via nodemailer; demo simulation when unset |
| AI | z-ai-web-dev-sdk for brief-to-copy, lead hooks and variant alternatives (deterministic fallback) |
| PDF/CSV | pdfkit one-page campaign reports, lead-level CSV export |
| Runtime | Bun (dev + production server) |

## Quickstart

```bash
bun install
cp .env.example .env          # DATABASE_URL is the only required var
bunx prisma db push           # create the SQLite schema
bun run db:seed               # fill the simulated 105M-company B2B database (Explorer)
bun run dev                   # http://localhost:3000
```

Sign in with any work email - the first login creates the account with a $30 trial
(the pre-provisioned demo account is **riley@brightpath.io**, no password). Freemail
domains are rejected at the door, mirroring the real product, and onboarding walks
you through your company profile and first campaign.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | SQLite file URL (`file:./db/custom.db`) |
| `APP_URL` | prod | Public base URL used in unsubscribe/open/click links embedded in emails |
| `RESEND_API_KEY` | no | Enables real delivery over the Resend API |
| `RESEND_FROM` | no | Verified sender identity, e.g. `Riley <riley@yourbrand.io>` |
| `RESEND_WEBHOOK_SECRET` | no | Svix secret verifying `POST /api/webhooks/resend` (bounces/complaints auto-suppress) |
| `SMTP_HOST/PORT/USER/PASS/FROM` | no | Generic SMTP fallback delivery |
| `LINKEDIN_ACCESS_TOKEN` | no | Enables real LinkedIn touches over the LinkedIn API (`POST /v2/ugcPosts`) |
| `LINKEDIN_API_URL` | no | LinkedIn API base override (E2E mock testing) |
| `REPORT_INTERVAL_MS` | no | Digest interval (default 120000 = demo-compressed week) |

Without any provider the app runs in simulation mode: the engine still schedules touches, replies and
autopilot, and everything is metered - flipping a provider on later is zero-risk.

## Deploy

### Docker

```bash
docker build -t jidout .
docker run -p 3000:3000 --env-file .env -v jidout-db:/app/db jidout
```

The image is a three-stage build (deps → build → runner) on `oven/bun:1`. The SQLite database lives on
the `/app/db` volume; schema is pushed automatically on first start.

### Bare Bun / VPS

```bash
bun install
bunx prisma db push && bun run db:seed   # seed optional
bun run build
bun run start                            # standalone server on :3000
```

## Feature map

- **Brief → pool → sequence** - campaign state machine (draft → pool_ready → approved → sending →
  paused/completed), AI lead scoring with hook facts, approve/reject before anything sends.
- **Multi-arm split tests** - up to 4 variants (A-D), balanced assignment, z-test promotion
  (auto-promote at p < 0.10), AI-generated angles.
- **Tracking** - 1×1 open pixel, tracked CTA links (`/api/click/[id]`), per-link CTR breakdown,
  Resend webhooks (opened/clicked/delivered/bounced/complained).
- **Deliverability** - domain plan with warming ramp (10 → 40 emails/day), per-domain progress,
  suppression list (hard bounce / spam complaint / unsubscribe), RFC 8058 one-click unsubscribe
  (`List-Unsubscribe` headers + `/api/unsubscribe/[token]`).
- **Inbox + autopilot** - conversations with sentiment, hot-lead detection, meeting negotiation,
  LinkedIn touches as a second channel (toggle per campaign).
- **Reports** - one-page PDF (funnel, arms, tracked links), lead-level CSV, scheduled weekly digest
  emailed to the account owner.
- **Billing** - prepaid balance ($0.04/email, $12/domain, $29/LinkedIn seat per month, $0.12/LinkedIn
  touch), daily/monthly caps, transaction ledger, usage heatmap.
- **Team** - workspace seats with roles (owner/member/viewer), invite/accept flow, LinkedIn seat
  assignment.

## Repo layout

```
prisma/schema.prisma    # 14 models: users→campaigns→leads→messages→click events→suppression
src/lib/engine.ts       # the simulation + scheduling core (tick-driven)
src/lib/email-provider.ts  # Resend/SMTP/demo delivery hook
src/app/api/*           # ~30 route handlers (auth, campaigns, tick, webhooks, reports, team, ...)
src/components/app/     # dashboard views (overview, campaigns, inbox, domains, billing, team, explorer)
scripts/                # seed + per-round E2E verification suites (verify_round3..7.ts)
```

## Verification

Each feature round ships a runnable E2E suite against a dev server:

```bash
bun scripts/verify_round3.ts   # split tests, auto-promotion, open tracking
bun scripts/verify_round4.ts   # CTA clicks, CSV export, webhooks
bun scripts/verify_round5.ts   # per-link CTR, PDF report, bounce suppression
bun scripts/verify_round6.ts   # unsubscribe, digest, domain warming
bun scripts/verify_round7.ts   # LinkedIn toggle, team seats, template packaging
bun scripts/verify_round8.ts   # LinkedIn API adapter, workspace audit trail
```

`bunx tsc --noEmit` and `bunx eslint src` must stay clean. The same matrix
(type-check, lint, all six suites against a fresh dev server) runs in CI on
every push - see `.github/workflows/ci.yml`.
