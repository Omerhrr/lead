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
- `autogtm-three-arm-split.png` — live three-way test: A/B/C arms with open
  rates, reply rates, leader badge, add/remove variant, auto-promote toggle.
- `autogtm-cta-field-export.png` — campaign "My copy" tab: tracked CTA link
  field (clicks measured per touch) + Export CSV button in the header.
- `autogtm-cta-clicks-ab.png` — full activity feed of the CTA demo campaign:
  opened/clicked badges per touch, variant labels, autopilot replies — the
  email funnel end to end (64 touches, 67% opened, 31% clicked).
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
  arms); "Remove" deletes an unused arm (guards: a live test never drops
  below two arms, arms with assigned leads are protected). Approved leads are
  split evenly (fewest-assigned arm first) and pinned to a variant for the
  whole sequence. Per-arm stats: sent, opens, open rate, replies, reply rate,
  hot, booked. Inline editing + one-click "Promote winner".
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
- **Click tracking (CTR)** — set a tracked CTA link on "My copy" (e.g. a
  booking page); it is appended to every email touch. Real sends wrap it as
  `GET /api/click/<messageId>?url=<target>` (302 to the target, per-message
  click counter); demo mode models clicks as ~40% of opens. Click rate shows
  as a per-variant tile and clicked touches get a badge in Activity.
- **Resend webhooks** — `POST /api/webhooks/resend` handles
  `email.opened` / `email.clicked` / `email.delivered`, mapping events to
  messages through the stored Resend `email_id` (Svix signature verification
  when `RESEND_WEBHOOK_SECRET` is set; unsigned accepted in demo mode).
- **CSV report export** — "Export CSV" in the campaign header downloads a
  lead-level report (`GET /api/campaigns/<id>/report`): variant attribution,
  touches, opens, clicks, replied/hot/booked, meeting date, sentiment, hook.
- **Metering, autopilot, compressed-time engine** — unchanged: $30 trial credit,
  $0.04/email, domain plans, LinkedIn seat billing, agent autopilot with
  meeting booking (1 campaign day ≈ 10 s).

## 3. Verification evidence (round 3)

`scripts/verify_round3.ts` (run with `bun`) drives the real API end to end:

- **Balanced multi-arm split** — live campaign "Med spas — three-way copy
  test" split 11/11/10 across arms A/B/C after engine ticks; per-arm stats
  A 55% / B 36% / C 60% reply rate, opens 70-73%, split-test leader badge on
  the statistically-leading arm (z-test vs runner-up shown in the UI).
- **Open-tracking pixel** — `GET /api/open/<messageId>` returns a 1×1 GIF and
  incremented the message `2 -> 4` on two hits, `openedAt` stamped; demo-mode
  simulated opens spread over the first campaign days.
- **Remove guards** — arm with assigned leads → HTTP 400; unused arm D added
  and removed cleanly (back to A/B/C); live test refusing to drop below two
  arms → HTTP 400.
- **Auto-promotion** — fixture with 20 leads/arm, A 20% vs B 50% reply rate:
  one tick closed the test and promoted B — `"Variant B auto-promoted — 50%
  vs 20% reply rate (p=0.05), test closed"`.
- Quality gates: `tsc --noEmit` clean, `eslint src` clean, dev log error-free.

## 4. Verification evidence (round 4)

`scripts/verify_round4.ts` (run with `bun`) — 22/22 assertions pass,
re-runnable (reuses the demo campaigns):

- **Tracked CTA + clicks** — live campaign "Med spas — CTA clicks demo": 64
  email touches embed the CTA; counters 64 sent / 43 opened (67%) / 20 clicked
  (31% CTR, demo funnel ~40% of opens click through). Click route returns 302
  to the target and incremented clicks 4 -> 5 with `clickedAt`; `javascript:`
  targets rejected with 400; the campaign copy rejects non-http(s) CTA values
  (saved as empty). Simulated clicks only occur on campaigns with a CTA link
  (`simulateOpens` gates on `ctaUrl`).
- **Per-arm CTR tile** — the A/B stats grid gained a Clicks % column next to
  Opens % (three-way campaign arms report 0% clicks — their touches predate
  the CTA link; data normalized for coherence).
- **CSV export** — `text/csv` attachment, header + 32 lead rows for the
  three-arm campaign with Variant attribution populated on every row.
- **Resend webhook** — `email.opened` -> opens+1, `email.clicked` -> clicks+1
  (mapped by Resend `email_id`), unknown event acknowledged as ignored,
  unknown `email_id` acknowledged as unmatched, missing `email_id` and
  malformed payloads rejected with 400.
