# Jidout - deliverables

Everything shipped for this project, newest last.

## 1. Evidence screenshots

- `jidout-ab-variants.png` - A/B split-test tab with per-variant stats.
- `jidout-ab-settings-delivery.png` - settings tab: delivery-provider status panel.
- `jidout-multiarm-overview.png` - campaign list + A/B tab after auto-promotion.
- `jidout-three-arm-split.png` - live three-way test: A/B/C arms with open
  rates, reply rates, leader badge, add/remove variant, auto-promote toggle.
- `jidout-cta-field-export.png` - campaign "My copy" tab: tracked CTA link
  field (clicks measured per touch) + Export CSV button in the header.
- `jidout-cta-clicks-ab.png` - full activity feed of the CTA demo campaign:
  opened/clicked badges per touch, variant labels, autopilot replies - the
  email funnel end to end (64 touches, 67% opened).
- `jidout-round5-tracked-links-pdf.png` - round-5 UI: "Export PDF" next to
  "Export CSV" in the campaign header and the "Tracked links" card with the
  CTA URL, click share bar and live counters (36 clicks · 100% share).
- `jidout-activity-clicked-badges.png` - activity feed mid-scroll: touch rows
  with variant labels and the tracking badges - emerald "clicked" (per-link
  CTA tracking) and sky "1×" opened (open pixel) - plus autopilot replies.
- `jidout-round6-warming.png` - Domains page: newly bought domain entering
  deliverability warming (amber flame badge, emerald progress bar,
  "warming day 0 · 10/40 emails/day") next to fully active domains.
- `jidout-round6-digest.png` - Overview: "Weekly report digest" card enabled
  ("On - 7 digests sent · last 11:15 PM") with the Pause digest button.
- `jidout-round6-unsubscribe.png` - one-click unsubscribe confirmation page:
  emerald "Unsubscribed" badge naming the removed address.
- `jidout-round7-team.png` - Team view: owner card, invite pending with
  Accept, active member holding a LinkedIn seat, invite form, seat summary.
- `jidout-round7-channel-mix.png` - campaign header channel-mix badge
  ("64 email · 7 LinkedIn") with Export CSV / Export PDF actions.
- `jidout-round7-linkedin-toggle.png` - Settings tab: "LinkedIn touches"
  switch alongside Autopilot and Auto-replies.
- `jidout-round8-linkedin-api.png` - campaign Activity feed with violet
  "via LinkedIn API" chips on the delivered LinkedIn DMs (channel-mix badge
  "17 email · 2 LinkedIn" in the header).
- `jidout-round8-audit.png` - Team view with the new Activity log card:
  invites, invite acceptance, seat assignments and role changes with actor,
  target and time per row.
- `jidout-campaign-report-sample.pdf` - one-page PDF summary report sample
  (funnel tiles, split-test arms, tracked links, next action).
- `jidout-campaign-report-sample.csv` - lead-level CSV report sample.
- `jidout-variant-opens-stat.png` - variant card with open-rate stat.
- `jidout-activity-opened-badges.png` - activity feed with per-message open badges.

## 2. The app

Source lives in `/home/z/my-project/` (Next.js 16 App Router + Prisma/SQLite,
single process, emerald theme). Run with `bun run dev` then open
http://localhost:3000. Demo login: `riley@brightpath.io` (work email gate -
freemail domains are rejected by design).

Enhancements shipped on top of the base clone:

- **Real delivery hook** - `src/lib/email-provider.ts`. Set `RESEND_API_KEY`
  (HTTP API) or `SMTP_HOST` + optional `SMTP_PORT/USER/PASS/FROM` and every
  email touch is delivered for real; the outcome (`delivered|failed`) is
  recorded per message and shown in Campaigns → Settings. No provider env =
  simulation mode, nothing else changes. "Send test" verifies credentials.
- **Multi-arm split tests (A/B/C/D)** - "A/B test" seeds variants A and B from
  your copy; "Add variant" asks the AI for a fresh angle (C, then D, max 4
  arms); "Remove" deletes an unused arm (guards: a live test never drops
  below two arms, arms with assigned leads are protected). Approved leads are
  split evenly (fewest-assigned arm first) and pinned to a variant for the
  whole sequence. Per-arm stats: sent, opens, open rate, replies, reply rate,
  hot, booked. Inline editing + one-click "Promote winner".
- **Auto-promotion with significance testing** - flip "Auto-promote" and the
  engine closes the test itself once the leading arm beats the runner-up with
  a two-proportion z-test (p < 0.10, every arm ≥ 8 sends): winner copy becomes
  "My copy" and the test switches off. Implemented in `src/lib/stats.ts` +
  engine `autoPromotePass`, surfaced live in the A/B tab (leader, p-value,
  eligibility).
- **Open tracking** - every real send carries an HTML part with a 1×1 pixel
  (`GET /api/open/<messageId>`); hits increment per-message `opens`. In
  simulation mode reads are modeled instead (~66% eventual open rate, spread
  over the first campaign days). Open rate shows per variant; the Activity
  feed badges opened touches with a 👁 n× chip.
- **Click tracking (CTR)** - set a tracked CTA link on "My copy" (e.g. a
  booking page); it is appended to every email touch. Real sends wrap it as
  `GET /api/click/<messageId>?url=<target>` (302 to the target, per-message
  click counter); demo mode models clicks as ~40% of opens. Click rate shows
  as a per-variant tile and clicked touches get a badge in Activity.
- **Per-link breakdown** - every hit (click route, webhook, demo sim) writes a
  `ClickEvent` row (message, campaign, URL). The Activity tab shows a
  "Tracked links" card with clicks + share per URL; `topLinks` ships in the
  campaign API.
- **Resend webhooks** - `POST /api/webhooks/resend` handles
  `email.opened` / `email.clicked` / `email.delivered` / `email.bounced` /
  `email.complained`, mapping events to messages through the stored Resend
  `email_id` (Svix signature verification when `RESEND_WEBHOOK_SECRET` is
  set; unsigned accepted in demo mode).
- **Bounce + complaint suppression** - a bounced or complained event flips
  the message to bounced/failed, suppresses the lead (engine stops mailing
  them) and upserts an account-wide `SuppressEntry` with the reason
  ("hard bounce" / "spam complaint"), so future lead pools exclude them.
- **CSV report export** - "Export CSV" in the campaign header downloads a
  lead-level report (`GET /api/campaigns/<id>/report`): variant attribution,
  touches, opens, clicks, replied/hot/booked, meeting date, sentiment, hook.
- **PDF summary report** - "Export PDF" (`GET /api/campaigns/<id>/report-pdf`,
  pdfkit) renders a one-page report: funnel tiles (leads, touches, open %,
  click %, replies, hot, booked), the split-test arms table, tracked links
  with click counts, and the campaign's next action.
- **Metering, autopilot, compressed-time engine** - unchanged: $30 trial credit,
  $0.04/email, domain plans, LinkedIn seat billing, agent autopilot with
  meeting booking (1 campaign day ≈ 10 s).

## 3. Verification evidence (round 3)

`scripts/verify_round3.ts` (run with `bun`) drives the real API end to end:

- **Balanced multi-arm split** - live campaign "Med spas - three-way copy
  test" split 11/11/10 across arms A/B/C after engine ticks; per-arm stats
  A 55% / B 36% / C 60% reply rate, opens 70-73%, split-test leader badge on
  the statistically-leading arm (z-test vs runner-up shown in the UI).
- **Open-tracking pixel** - `GET /api/open/<messageId>` returns a 1×1 GIF and
  incremented the message `2 -> 4` on two hits, `openedAt` stamped; demo-mode
  simulated opens spread over the first campaign days.
- **Remove guards** - arm with assigned leads → HTTP 400; unused arm D added
  and removed cleanly (back to A/B/C); live test refusing to drop below two
  arms → HTTP 400.
- **Auto-promotion** - fixture with 20 leads/arm, A 20% vs B 50% reply rate:
  one tick closed the test and promoted B - `"Variant B auto-promoted - 50%
  vs 20% reply rate (p=0.05), test closed"`.
- Quality gates: `tsc --noEmit` clean, `eslint src` clean, dev log error-free.

## 4. Verification evidence (round 4)

`scripts/verify_round4.ts` (run with `bun`) - 22/22 assertions pass,
re-runnable (reuses the demo campaigns):

- **Tracked CTA + clicks** - live campaign "Med spas - CTA clicks demo": 64
  email touches embed the CTA; counters 64 sent / 43 opened (67%) / 20 clicked
  (31% CTR, demo funnel ~40% of opens click through). Click route returns 302
  to the target and incremented clicks 4 -> 5 with `clickedAt`; `javascript:`
  targets rejected with 400; the campaign copy rejects non-http(s) CTA values
  (saved as empty). Simulated clicks only occur on campaigns with a CTA link
  (`simulateOpens` gates on `ctaUrl`).
- **Per-arm CTR tile** - the A/B stats grid gained a Clicks % column next to
  Opens % (three-way campaign arms report 0% clicks - their touches predate
  the CTA link; data normalized for coherence).
- **CSV export** - `text/csv` attachment, header + 32 lead rows for the
  three-arm campaign with Variant attribution populated on every row.
- **Resend webhook** - `email.opened` -> opens+1, `email.clicked` -> clicks+1
  (mapped by Resend `email_id`), unknown event acknowledged as ignored,
  unknown `email_id` acknowledged as unmatched, missing `email_id` and
  malformed payloads rejected with 400.

## 5. Verification evidence (round 5)

`scripts/verify_round5.ts` (run with `bun`) - 21/21 assertions pass;
`verify_round4.ts` re-run after the webhook change - 22/22 still pass.

- **Per-link breakdown** - a click-route hit wrote a `ClickEvent` with the
  target URL; a webhook `email.clicked` with a distinct deep link wrote its
  own row; the campaign API aggregates `topLinks` by URL (CTA at 30+ clicks,
  deep link 1). The Activity tab renders the "Tracked links" card with
  per-URL share bars (screenshot). Historical demo clicks were backfilled
  into `ClickEvent` rows so message counters and the breakdown agree.
- **PDF summary report** - `GET /api/campaigns/<id>/report-pdf` returns
  `application/pdf` (~3.3 KB, %PDF magic, attachment filename); without a
  session it 401s. The rendered page shows the funnel tiles, split-test arms
  table, tracked links and next action (sample saved as
  `jidout-campaign-report-sample.pdf`).
- **Bounce + complaint suppression** - webhook `email.bounced` on a fixture
  message flipped it to bounced/failed, suppressed the lead and upserted
  `SuppressEntry(reason="hard bounce")`; `email.complained` updated the
  reason to "spam complaint"; the suppressed lead is excluded from sends.
- Quality gates: `tsc --noEmit` clean, `eslint src` clean, dev log error-free.

## 6. Verification evidence (round 6)

`scripts/verify_round6.ts` (run with `bun`) - 31/31 assertions pass;
rounds 3/4/5 suites re-run afterwards - all still pass.

- **One-click unsubscribe (RFC 8058)** - every email touch now carries a
  per-lead opt-out token: the send path mints it lazily, appends a
  "One click to opt out" footer to the text/HTML part and mails
  `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  headers through the configured provider. The public
  `/api/unsubscribe/<token>` route accepts GET (human click -> styled emerald
  confirmation page) and POST (mail-client one-click); both suppress the
  lead, flip it to unsubscribed and upsert `SuppressEntry(reason="unsubscribe")`
  on the account. Malformed and unknown tokens 404. The engine's simulated
  "remove me" replies run the same suppression path. 14 assertions.
- **Scheduled weekly digest** - per-project cadence (`off` | `weekly`):
  Overview card toggles it via `POST /api/overview`; the engine tick fires the
  first digest immediately after enabling (lastReportAt cleared) and then one
  per demo-compressed week (120s). Each digest emails the account owner a
  funnel row per campaign (approved/touches/opened/clicked/replies/hot/booked)
  through the configured provider (simulated in demo mode); `reportCount` and
  `lastReportAt` surface on the Overview card. Immediate re-ticks don't
  double-send; invalid cadences are rejected. 9 assertions.
- **Domain-warming simulator** - new sending domains (platform buy and
  verified BYOD) start at 10 emails/day and ramp +10 per warming day; one tick
  advances every warming domain a day, flipping to active at the 40/day cap
  (10 → 20 → 30 → 40 verified). The engine's send quota counts warming volume
  (`campaignCapacity` includes warming domains), and the Domains page shows a
  live progress bar per warming domain plus a "warming" count in the plan
  stats. 8 assertions.
- Quality gates re-run: `tsc --noEmit` clean, `eslint src` clean, dev log
  error-free.

## 7. Verification evidence (round 7)

`scripts/verify_round7.ts` (run with `bun`) - 41/41 assertions pass;
rounds 3/4/5/6 suites re-run afterwards - all still pass.

- **LinkedIn touches as a first-class channel** - the engine already mixed
  LinkedIn touches into follow-ups (30% per follow-up for leads with a
  profile URL, billed $0.12/touch against $29/seat months); round 7 made the
  channel controllable and visible: campaigns gain a `linkedinEnabled` flag
  (PATCH round-trip verified), the Settings tab gets a "LinkedIn touches"
  switch, the engine gates the channel roll on the flag (OFF is deterministic
  email - first touch and forced follow-up asserted), ON produces real
  `channel="linkedin"` messages (no subject line, no unsubscribe footer), the
  campaign API exposes the channel mix (`emailTouches` / `linkedinTouches`,
  verified against the database) and the detail header shows an
  "N email · N LinkedIn" badge. Usage rows and the credit ledger bill the
  touches. 12 assertions.
- **Team / workspace seats** - new `TeamMember` model + `/api/team` routes:
  invite (email normalization, duplicate/self/invalid guards), accept
  (invited → active, double-accept rejected), role management (owner reserved;
  member/viewer), LinkedIn seat assignment bound to the billing account's
  seat count (over-assign rejected, free + re-assign verified), removal,
  401 without session. The new Team view in the sidebar renders the owner
  card, pending invites with Accept, seat badges and the invite form. 20
  assertions.
- **Deployable-template packaging** - `.env.example` documenting every env
  var (DATABASE_URL, APP_URL, Resend key/from/webhook secret, SMTP set,
  REPORT_INTERVAL_MS), three-stage `Dockerfile` on `oven/bun:1` (standalone
  output, prisma generate at build, first-run `prisma db push`, /app/db
  volume, EXPOSE 3000), `.dockerignore`, root `README.md` with quickstart,
  env table, Docker + bare-Bun deploy and the feature map, `db:seed` npm
  script. 9 assertions.
- Quality gates re-run: `tsc --noEmit` clean, `eslint src` clean, dev log
  error-free.

Screenshots (in this folder):

- `jidout-round7-team.png` - Team view: owner card, invite pending with
  Accept, active member holding a LinkedIn seat, invite form, seat summary
  ("LinkedIn seats: 1/1 assigned · 0 available").
- `jidout-round7-channel-mix.png` - campaign header with the channel-mix
  badge ("64 email · 7 LinkedIn") next to the state badge and Export buttons.
- `jidout-round7-linkedin-toggle.png` - Settings tab with the "LinkedIn
  touches" switch in the autopilot card.

## 8. Verification evidence (round 8)

`scripts/verify_round8.ts` (run with `bun`) - 55/55 assertions pass;
rounds 3/4/5/6/7 suites re-run afterwards against a clean server - all still
pass (21/22/21/32/45 PASS, 0 FAIL).

- **Real LinkedIn API adapter** - `src/lib/linkedin-provider.ts`, the channel
  twin of the email provider hook: set `LINKEDIN_ACCESS_TOKEN` and every
  LinkedIn DM is handed to the LinkedIn API (`POST /v2/ugcPosts`,
  `LINKEDIN_API_URL` override for testing); without a token touches stay
  simulated. Module-level checks cover null/simulated default, delivered with
  the API's URN id, request payload shape (recipient/sender/text) and the 500
  → `failed` mapping. The engine now marks LinkedIn touches `pending` and
  records `deliveryStatus/provider/providerMessageId` on the message row
  (API failures are retryable, so status stays `sent`). The campaign Activity
  feed shows a violet "via LinkedIn API" chip on delivered DMs, and the
  E2E run asserted a real delivered touch end to end against a local mock
  API while email touches stayed simulated in the same run. 17 assertions.
- **Workspace audit trail** - new `AuditEvent` model + `logAudit` helper
  (fire-and-forget): team actions (invited / accepted / role_changed /
  seat_assigned / seat_freed / removed), campaign lifecycle (created /
  updated incl. the LinkedIn channel toggle and start/stop actions) and
  billing seat changes land as rows with actor, target and detail. New
  `GET /api/audit` (401 unauthenticated, limit param, newest-first) and an
  "Activity log" card on the Team view. 31 assertions.
- **CI pipeline** - `.github/workflows/ci.yml` runs on push/PR: bun setup,
  prisma db push + seed, `tsc --noEmit`, `eslint src`, then all six verify
  suites as separate steps against a freshly started dev server (simulation
  mode). YAML validated by a real parser in the E2E. Docs updated:
  `.env.example` + README environment table document the LinkedIn adapter
  vars, README records the round-8 suite and the CI matrix. 7 assertions.
- Quality gates re-run: `tsc --noEmit` clean, `eslint src` clean, dev log
  error-free. Harness note: the dev server only lives inside a single tool
  call in this sandbox, so `scripts/devctl.sh` boots/stops it per work block
  and `turbopackFileSystemCacheForDev: false` keeps the persistent Turbopack
  cache from corrupting on those hard stops.

Screenshots (in this folder):

- `jidout-round8-linkedin-api.png` - Activity feed of the adapter demo
  campaign: LinkedIn touch rows carry the "via LinkedIn API" chip, email
  rows keep the unsubscribe footer; header shows "17 email · 2 LinkedIn".
- `jidout-round8-audit.png` - Team view with the Activity log card showing
  the full trail (invites with role, acceptance, seat assignment/freeing,
  role change viewer -> member, removal) with actor + timestamp per row.

## 9. Verification evidence (round 9) - deliverability + inbound data

Closing the gap to explee.com's deliverability stack, verified by
`scripts/verify_round9.ts` (58 assertions):

- **Pre-send mailbox verification** - every lead entering a pool is checked
  (syntax, disposable domains, role accounts, catch-all/no-MX heuristics,
  deterministic per address) and charged $0.005/check with a campaign-attributed
  ledger row. The campaign policy gates the send queue: `skip_invalid` kept all
  invalid mailboxes at zero touches, `skip_invalid_risky` stopped risky ones
  too. Pool badges (valid/risky/invalid with reason) in the lead table.
- **SPF/DKIM/DMARC authentication** - every domain gets its three expected DNS
  records; the checker validates TXT records (sim mode deterministic, live mode
  resolves real TXT via node:dns). Authenticated BYOD domains start warming;
  failure paths verified on a fail-gate domain. Audited per check.
- **Pre-warmed domain store** - six ready-to-send domains with reputation
  92-98, warming age and send history; renting charges $12, flips the domain
  active at full 40/day cap fully authenticated (no ramp). Duplicate/unknown
  rents rejected.
- **CSV lead list import** - dry-run preview with importable/duplicate-in-file/
  malformed/skipped breakdown + sample table; commit creates source=csv leads
  that are verified on entry; workspace duplicates and suppression-list domains
  are skipped; importing into a sending campaign is rejected.

Screenshots (in this folder):

- `jidout-round9-domains-store-dns.png` - Domains view: pre-warmed store cards
  (reputation, warming age, $12 Rent now, "ready to send on day one") and the
  per-domain AUTHENTICATION rows with SPF/DKIM/DMARC pass chips + Check DNS.
- `jidout-round9-verify-pool.png` - Lead pool with the Verified column (valid /
  invalid badges + reason tooltips), Verify pool + Import CSV actions and the
  "15 valid - 0 risky - 1 invalid" summary line.
- `jidout-round9-csv-import.png` - CSV import dialog after a dry-run preview:
  importable/duplicate/malformed/skipped badges and the sample row table.

## 10. Verification evidence (round 10) - scale + monetization

Closing the remaining explee gaps that are buildable, verified by
`scripts/verify_round10.ts` (57 assertions):

- **30 campaign languages** - language picker on every campaign (30 entries);
  AI copy generation carries the language; the engine's deterministic
  follow-ups are localized for 12 languages (German subject AW:/body asserted
  in the suite) with English fallback for the rest.
- **Calendar booking** - autopilot negotiation ends in a confirmed Meeting row
  carrying the workspace booking URL, the reply contains the booking link,
  meetings list on the overview with .ics download (`text/calendar`, 401
  without session).
- **Public API v1** - Bearer keys (sha256-hashed, shown once, prefix
  jd_live_...), read-only endpoints for campaigns (funnel + spend + CPL),
  leads (verification verdicts), meetings; 401 for missing/wrong/revoked keys,
  rate-limit headers and a 429 past 60 req/min; key create/revoke audited.
- **Cost per warm lead** - all ledger charges carry a campaignId: per-campaign
  spend and CPL exactly match the ledger sum in the public API, overview rows,
  CSV report column and the PDF report tile.
- **Per-result pricing** - switch billing to a $1-20 success fee per warm lead:
  exactly one warm_lead_fee charge per warm lead, flagged on the lead, included
  in CPL spend; per-action mode charges nothing.

Screenshots (in this folder):

- `jidout-round10-language-settings.png` - Settings tab: "Campaign language
  (30 available)" selector + "Mailbox verification policy" selector.
- `jidout-round10-meetings-overview.png` - Overview: "Upcoming meetings" card
  (confirmed meeting with .ics download icon) and per-campaign CPL rows.
- `jidout-round10-billing-pricing.png` - Billing: "Pricing model" card with the
  Per action / Per result choice and the success-fee input.
- `jidout-round10-api-keys.png` - Developers view: API keys list with the
  Zapier integration key and the API docs (v1) endpoint reference.

Full QA: `scripts/qa_round10.sh` runs rounds 9 + 10 + the rounds 3-8
regression (all eight suites), then tsc/eslint and the dev-log error gate.
