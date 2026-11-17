# AutoGTM — deliverables

Everything shipped for this project, newest last.

## 1. Reverse-engineering report (companion doc)

- `Explee_Reverse_Engineering_Report.docx` — full black-box teardown of explee.com:
  product surface, funnel, tech stack fingerprint (Next.js App Router + Turbopack,
  FastAPI, Logto OIDC/PKCE, Stripe + Basis Theory), data model, pricing, and the
  feature-by-feature clone plan AutoGTM implements.
- `Explee_Reverse_Engineering_Report.pdf` — same report, PDF.
- `autogtm-ab-variants.png` — A/B split-test tab with per-variant stats.
- `autogtm-ab-settings-delivery.png` — settings tab: delivery-provider status panel.
- `autogtm-multiarm-overview.png` — campaign list + A/B tab after auto-promotion.
- `autogtm-variant-opens-stat.png` — variant card with open-rate stat.
- `autogtm-activity-opened-badges.png` — activity feed with per-message open badges.

## 2. The app (AutoGTM — explee.com clone)

Source lives in `/home/z/my-project/` (Next.js 16 App Router + Prisma/SQLite,
single process, emerald theme). Run with `bun run dev` then open
http://localhost:3000. Demo login: `riley@brightpath.io` (work email gate —
freemail domains are rejected by design).

Enhancements shipped on top of the base clone:

- **Real delivery hook** — `src/lib/email-provider.ts`. Set `RESEND_API_KEY`
  (HTTP API) or `SMTP_HOST` + optional `SMTP_PORT/USER/PASS/FROM` and every
  email touch is delivered for real; the outcome (`delivered|failed`) is
  recorded per message and shown in Campaigns → Settings. No provider env =
  simulation mode, nothing else changes. "Send test" verifies credentials.
- **Multi-arm split tests (A/B/C/D)** — "A/B test" seeds variants A and B from
  your copy; "Add variant" asks the AI for a fresh angle (C, then D, max 4
  arms). Approved leads are split evenly and pinned to a variant for the whole
  sequence. Per-arm stats: sent, opens, open rate, replies, reply rate, hot,
  booked. Inline editing + one-click "Promote winner".
- **Auto-promotion with significance testing** — flip "Auto-promote" and the
  engine closes the test itself once the leading arm beats the runner-up with
  a two-proportion z-test (p < 0.10, every arm ≥ 8 sends): winner copy becomes
  "My copy" and the test switches off. Implemented in `src/lib/stats.ts` +
  engine `autoPromotePass`, surfaced live in the A/B tab (leader, p-value,
  eligibility).
- **Open tracking** — every real send carries an HTML part with a 1×1 pixel
  (`GET /api/open/<messageId>`); hits increment per-message `opens`. In
  simulation mode reads are modeled instead (~66% eventual open rate, spread
  over the first campaign days). Open rate shows per variant; the Activity
  feed badges opened touches with a 👁 n× chip.
- **Metering, autopilot, compressed-time engine** — unchanged: $30 trial credit,
  $0.04/email, domain plans, LinkedIn seat billing, agent autopilot with
  meeting booking (1 campaign day ≈ 10 s).
