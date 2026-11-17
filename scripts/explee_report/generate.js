// generate.js — Explee.com Reverse Engineering Report
const {
  Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber,
  AlignmentType, HeadingLevel, NumberFormat, SectionType, LevelFormat,
  TableOfContents, PageBreak,
} = require("docx");
const fs = require("fs");
const L = require("./lib.js");

const ART = "/home/z/my-project/explee_analysis/artifacts";
const ASSETS = "/home/z/my-project/explee_analysis/report_assets";
const OUT = "/home/z/my-project/download/Explee_Reverse_Engineering_Report.docx";

const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

// ---------- header/footer builders ----------
function docHeader() {
  return new Header({ children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    border: { bottom: { style: "single", size: 2, color: L.PALETTE.table.innerLine } },
    children: [new TextRun({ text: "Explee.com Reverse Engineering Report", size: 16, color: "808080", font: { ascii: "Arial" } })],
  })] });
}
function pageNumFooter() {
  return new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })],
  })] });
}

// ---------- front matter: TOC ----------
const tocChildren = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 360 },
    children: [new TextRun({ text: "Table of Contents", bold: true, size: 32,
      color: L.HEAD_COLOR, font: { ascii: "Arial", eastAsia: "SimHei" } })],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [new TextRun({
      text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \"Update Field.\"",
      italics: true, size: 18, color: "888888", font: { ascii: "Times New Roman" },
    })],
  }),
  // NOTE: no trailing PageBreak here - the body section starts with SectionType.NEXT_PAGE;
  // an explicit PageBreak on top of that would create a blank page (postcheck blank-pages rule).
];

// ---------- body content ----------
const bodyChildren = [];

// ===== 1. Executive Summary =====
bodyChildren.push(L.heading("1. Executive Summary", 1));
bodyChildren.push(L.body("This report documents a black-box reverse engineering investigation of explee.com performed on 17 November 2026 using the REA (Reverse Engineer Anything) toolchain. All findings are grounded in captured evidence: seven full-page browser scenarios with screenshots, DOM and accessibility snapshots, the site's published OpenAPI 3.1 specification, HTTP response headers, DNS records, and a static reconstruction of the complete production JavaScript bundle set. No account was created and no authenticated page was accessed; every observation derives from publicly served material."));
bodyChildren.push(L.body("Explee today is not the animated-video tool its earlier history suggests. The site now markets a 24/7 AI outreach agent: a user submits their company domain, and the platform claims to identify ideal customers from a business database of 105 million companies and 400 million people profiles, write personalised first-touch emails, send follow-ups, and manage replies semi-autonomously. Internally the product is codenamed app-auto-gtm (\"auto go-to-market\"), and this codename leaks consistently through its API paths, frontend routes and analytics keys."));
bodyChildren.push(L.body([
  L.run("The investigation reached four headline conclusions. First, the technology stack is modern and coherent: a "),
  L.run("Next.js App Router frontend compiled with Turbopack", { bold: true }),
  L.run(" in production, a "),
  L.run("FastAPI backend", { bold: true }),
  L.run(" on api.explee.com exposing a fully public 68-path API, "),
  L.run("Logto-based OIDC authentication with PKCE", { bold: true }),
  L.run(", Cloudflare edge protection, Stripe payments paired with Basis Theory card tokenisation, and an MCP (Model Context Protocol) server that makes the whole product drivable from ChatGPT or Claude. Second, the product mechanics are fully recoverable from API schemas alone: natural-language campaign briefs, autopilot reply handling, per-email USD pricing with prepaid and postpaid balances, daily budgets, monthly caps, and even automated purchasing of cold-mail sending domains. Third, monetisation is usage-based credits rather than subscriptions, with published economics of roughly $30 per 750 emails and $10 per 1,000 database emails. Fourth, the platform shows unusually deliberate growth engineering: 628 programmatic SEO pages, an embedded MCP connector, an affiliate programme, and referral/credit hooks throughout the frontend bundle."),
]));
bodyChildren.push(L.body("Sections 2 and 3 describe method and product positioning; sections 4 to 8 cover architecture, API surface, user flows, agent internals and monetisation; section 9 records notable engineering choices; the appendix inventories the evidence artefacts and states the investigation's limits."));

// ===== 2. Methodology =====
bodyChildren.push(L.heading("2. Methodology and Evidence Base", 1));
bodyChildren.push(L.heading("2.1 Toolchain", 2));
bodyChildren.push(L.body("All captures were performed with REA v6.9.0, an evidence-first reverse engineering toolkit that records every observation as a digested Evidence record. Three REA capabilities carried the investigation. The browser scenario tool (capture-browser-scenario) drove a purpose-launched headless Chromium through declared actions and retained screenshots, DOM text, accessibility trees, history and storage fingerprints per step. The JavaScript application analyser (analyze-javascript-application) statically reconstructed the 38 downloaded production chunks into a 739-node module graph without executing any code. Finally, the OpenAPI inspection used the API's own published specification at api.explee.com/public/api/openapi.json."));
bodyChildren.push(L.heading("2.2 Captures performed", 2));
bodyChildren.push(L.tableTitle("Table 1: Capture inventory (17 November 2026)"));
bodyChildren.push(L.dataTable(
  ["Capture", "Method", "Key yield"],
  [
    ["DNS + robots + sitemap", "resolvers, HTTP fetch", "4 subdomains; 646 sitemap URLs"],
    ["7 full-page scenarios", "REA browser scenarios", "screenshots, DOM, a11y, storage per page"],
    ["HTTP header survey", "curl (HEAD/GET)", "Next.js RSC markers, CSP, cookies"],
    ["OpenAPI specification", "public JSON download", "68 paths, 152 schemas"],
    ["38 JS production chunks", "static download (1.9 MB)", "route inventory, 84 endpoint literals"],
    ["REA JS application graph", "analyze-javascript-application", "739 nodes, 916 edges, 813 findings"],
  ],
  [30, 30, 40]
));
bodyChildren.push(L.body("Evidence integrity is preserved end to end: every REA record embeds SHA-256 digests of captured artefacts (for example, the homepage final-state screenshot digest ac2be7ca65bfd60c... for step zero and 08b65d322779f226... after settling), and the reconstructed application graph pins a source manifest digest. Artefact paths are listed in the appendix.", { after: 120 }));
bodyChildren.push(L.heading("2.3 Scope and limits", 2));
bodyChildren.push(L.body("The investigation was deliberately passive. No sign-up was submitted, no account was created, no authenticated dashboard page was loaded, and no request bodies or credential material were captured - REA redacts request/response bodies and header values in scenario captures by default. The authenticated editor (the app-auto-gtm dashboard) is therefore reconstructed from its public gate, its frontend bundle literals and its API schemas rather than from direct observation. Source maps were referenced by four scripts but none were fetched successfully, so module names reflect bundle-internal identifiers. Findings about pricing and availability describe the site as observed on the capture date."));

// ===== 3. Product Overview =====
bodyChildren.push(L.heading("3. Product Overview and Positioning", 1));
bodyChildren.push(L.body("Explee's positioning sentence, taken from the page title and meta description, is: \"Enter your domain and let AI find ideal customers, write personalized emails, and handle follow-ups. Powered by 105M+ companies and 400M+ people profiles.\" The homepage leads with claimed aggregate results - \"$9 median cost per lead\", \"206,605 hot leads for 18,015 companies\", \"97% inbox rate\", \"From $1 per warm lead\" - and a simulated agent transcript in which the agent studies a customer's competitor sites (floral wholesalers), drafts a personalised opening email, and books a meeting after a reply. These are marketing claims, not audit results; they are recorded here because they define the product's promised unit economics."));
bodyChildren.push(L.body("The product wraps four distinct offers around one data platform. The Outreach Agent is the flagship: pay-as-you-go AI outbound with an autopilot inbox. The Global B2B Company Database is sold as bulk data by geography, and its 628 location and vertical pages form the bulk of the sitemap. A Google Maps Dataset advertises 218M+ places with 51 fields. Finally, two free tool pages - Segments Explorer (type business keywords, see market clusters and TAM counts) and a lookalike tool discovered in the route inventory - act as top-of-funnel lead magnets into the agent."));
bodyChildren.push(L.body("The internal codename app-auto-gtm appears in the dashboard route (/app-auto-gtm), roughly forty internal API prefixes (/api/app-auto-gtm/...), and the first-party analytics key autogtm_utm_first. A separate marketing route /autogtm exists in the sitemap, and the public API groups its entire outreach module under autogtm. The naming indicates the product's self-conception: an automated go-to-market engine rather than a sales tool operated by humans."));
bodyChildren.push(...L.image(`${ART}/homepage.png`, 560, "Figure 1: explee.com homepage as rendered in the capture browser (final state, after 6 s settle)."));

// ===== 4. Technical Architecture =====
bodyChildren.push(L.heading("4. Technical Architecture", 1));
bodyChildren.push(L.heading("4.1 Component map", 2));
bodyChildren.push(L.tableTitle("Table 2: Observed component inventory"));
bodyChildren.push(L.dataTable(
  ["Layer", "Technology", "Evidence"],
  [
    ["Frontend framework", "Next.js App Router (React Server Components)", "Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch"],
    ["Build tooling", "Turbopack production build", "turbopack-*.js runtime chunk; 38 hashed chunks, 1.9 MB total"],
    ["Edge / CDN", "Cloudflare", "cf-clearance cookie, /cdn-cgi/ paths, Turnstile iframe in CDP target tree"],
    ["Backend API", "FastAPI (Python) on api.explee.com", "Scalar docs UI, OpenAPI 3.1, FastAPI favicon"],
    ["API gateway", "Next.js server-side proxy /api/*", "frontend fetches relative /api/app-auto-gtm/... paths"],
    ["Authentication", "Logto CIAM (OIDC + PKCE, Ory Hydra core)", "auth.explee.com/oidc/auth; _logto and _interaction cookie pairs"],
    ["Payments", "Stripe (live publishable key) + Basis Theory v2.15.0", "js.stripe.com; js.basistheory.com/web-elements/2.15.0"],
    ["Analytics", "Self-hosted Plausible + GTM (GTM-MCGK7M8T)", "plausible.explee.com/js/script.js"],
    ["Error tracking", "Sentry, EU ingest (de region)", "DSN o4510034052972544.ingest.de.sentry.io"],
    ["Booking", "calendar.explee.com scheduling page", "link \"quick-chat-with-explee\" in bundle"],
    ["AI distribution", "MCP server at api.explee.com/public/api/mcp", "integration page; Streamable HTTP with OAuth"],
  ],
  [22, 38, 40]
));
bodyChildren.push(L.heading("4.2 Frontend", 2));
bodyChildren.push(L.body("The marketing site and the authenticated dashboard share one Next.js application. The homepage references 38 hashed JavaScript chunks (1.9 MB) plus CSS bundles; the chunk names carry no semantic routing hints, consistent with Turbopack's opaque hashing. Route-level code splitting exists but module identities are internal. The bundle contains the full dashboard client logic - project creation, campaign editors, inbox, billing pages - meaning the product's frontend feature surface is fully inspectable without an account, even though every data call is gated."));
bodyChildren.push(L.body("Rendering is server-first: RSC vary headers on the HTML response and a robot-friendly statically generated corpus (646 sitemap URLs). A client-side cookie gate (explee_dcs, ten-minute TTL) and a 24-hour HttpOnly cookie (ex_pl) appear on first visit; their purpose is session continuity and likely bot-differentiation, alongside Cloudflare's Turnstile challenge observed inside the CDP target tree."));
bodyChildren.push(L.heading("4.3 Backend and data layer", 2));
bodyChildren.push(L.body("api.explee.com serves a FastAPI application with a public, well-maintained OpenAPI 3.1 document (68 paths, 152 component schemas, version 1.0.0). The Next.js frontend does not call this host directly from the browser for first-party data; instead it calls relative /api/* paths that the Next.js server proxies, keeping cookies and any internal tokens same-origin. Only the public integration surfaces (API docs link, MCP endpoint) point at the api host explicitly. The database-facing endpoints (search, enrich, dedup) and the outreach engine (autogtm) sit behind the same host; an /api/ai-employee/waitlist path in the bundle suggests an additional AI-employee product line in development."));
bodyChildren.push(...L.image(`${ART}/explorer.png`, 560, "Figure 2: Segments Explorer, a free semantic-search tool page (suggested keyword chips visible)."));

// ===== 5. API Surface =====
bodyChildren.push(L.heading("5. API Surface", 1));
bodyChildren.push(L.heading("5.1 Public API", 2));
bodyChildren.push(L.body("The public API is organised in eight functional groups. The outreach group (autogtm) dominates with 67 of 90 operations across campaigns, projects, budgets, inbox, domains and suppress lists. Search exposes companies, people, domain-keyed lookups and a natural-language-to-filters endpoint (POST /search/nl-to-filters), which is the signature AI feature: search criteria written in prose are converted to structured filters. Enrichment resolves email addresses from names (single and batch) and phone numbers from LinkedIn URLs. A find-and-enrich asynchronous job combines both, with task polling. The remaining groups cover deduplication lists, a billing balance, API-key owner identity (GET /me), async task listing, webhooks and feedback."));
bodyChildren.push(...L.image(`${ASSETS}/chart_endpoints.png`, 560, "Figure 3: Distribution of the 90 HTTP operations across the eight functional modules of the public API."));
bodyChildren.push(L.body("Authentication for the public API is key-based (GET /me returns the API key owner); the MCP connector page instructs users to create a key named \"Claude/ChatGPT connector\" and revoke it to disable campaign tools. Scope on the OAuth resource token minted at sign-in points at https://explee.com/api, indicating the browser session and the programmatic API converge on the same backend authorisation layer."));
bodyChildren.push(L.heading("5.2 Internal dashboard API (recovered from JS)", 2));
bodyChildren.push(L.body("Static analysis of the 38 chunks recovered 84 endpoint literals and candidates. The internal, browser-facing API mirrors the public one but adds account and billing surfaces not present in the published specification. Notable recovered paths include:"));
for (const p of [
  "GET/POST /api/app-auto-gtm/projects - dashboard project list and creation",
  "POST /api/app-auto-gtm/billing/cards and /billing/cards/setup-intent - Stripe payment method setup via Basis Theory tokenisation",
  "GET/PATCH /api/app-auto-gtm/billing/{balance, usage-daily, credits-activity, vat, address, postpaid, linkedin-seats}",
  "GET /api/app-auto-gtm/subscription and /subscription/plan-trial{,/offer} - trial mechanics",
  "GET/PATCH /api/app-auto-gtm/outreach/{mailboxes, domains, materials, byod/{orders, subscriptions, avatars}}",
  "GET/POST /api/app-auto-gtm/linkedin/{access, cabinet-arm} - LinkedIn integration control",
  "GET /api/app-auto-gtm/{segments, spent-today, unread-counts, reply-recipients, sending-identity, referral, trial-notice, self-reported-source}",
  "POST /api/user/email-change/{code, confirm}, GET /api/user/profile, GET /api/user/email-status",
  "POST /api/ai-employee/waitlist - unannounced product waitlist",
]) {
  bodyChildren.push(L.listItem(p, "ep-list"));
}
bodyChildren.push(L.body("The byod prefix (bring-your-own-domain) and the domains endpoints confirm the platform both sells sending domains and manages customer-supplied ones, including generated avatars for mailbox identities. The cabinet-arm LinkedIn path is an internal codename whose exact function could not be determined without an authenticated session.", { after: 120 }));
bodyChildren.push(L.heading("5.3 MCP server", 2));
bodyChildren.push(L.body("The product ships a first-party MCP server at https://api.explee.com/public/api/mcp using Streamable HTTP transport with OAuth sign-in. The integration page documents setup for ChatGPT, Claude, Claude Code (claude mcp add --transport http explee ...) and Cursor, and lists three tool families: find companies (search the 100M+ company database), run the GTM analysis (assess who any company should sell to, based on its website), and manage campaigns (read hot leads and inbox replies, set daily budgets, start or stop campaigns). This makes Explee one of the SaaS products treating AI assistants as a primary distribution channel rather than a feature."));

// ===== 6. Product Flows =====
bodyChildren.push(L.heading("6. Product Flows", 1));
bodyChildren.push(L.heading("6.1 Visitor to authenticated session", 2));
bodyChildren.push(L.body("The authentication flow, reconstructed from redirects and cookies, is a strict OIDC authorization-code flow with PKCE. Requesting any protected route (for example /app-auto-gtm or /sign-in) returns a 307 to auth.explee.com/oidc/auth with client_id yb37qgq72o4s2o8kao78v, redirect_uri https://explee.com/callback, response_type=code, prompt=consent, scope \"openid offline_access email\" and resource https://explee.com/api. The login UI is hosted by Logto at auth.explee.com/sign-in?app_id=..., offers email sign-in (\"Work emails only\") and a \"Continue with LinkedIn\" button, and carries the \"Powered by Logto\" badge. Registering without an active interaction session is refused (\"404 Not Found - Session not found\"), demonstrating that account creation cannot be initiated out of band. Session cookies observed: _logto/_logto.sig on the auth host, logto_<app_id> on the main host, and _interaction/_interaction.sig - the latter two are the Ory Hydra interaction cookies underlying Logto's OIDC implementation."));
bodyChildren.push(...L.image(`${ART}/signin.png`, 470, "Figure 4: Logto-hosted sign-in page on auth.explee.com (email + LinkedIn, work-emails-only gate)."));
bodyChildren.push(L.heading("6.2 Onboarding to campaign lifecycle", 2));
bodyChildren.push(L.body("Campaign mechanics are recoverable precisely because the API schemas document them. A project is created from the user's domain (ProjectCreate carries domain, sender_name and a no_website answer object for domain-less businesses). A campaign is then defined by a natural-language brief - CampaignCreate fields: offer, customer_problem, target_role, target_geography, target_company_size, positive_criteria, negative_criteria, example_clients, keywords, instructions, followup_instructions and language. The platform generates a lead pool, the user approves it (POST /campaigns/{id}/approve), and sending proceeds under a state machine (CampaignStatusResponse exposes state, sending_now, next_action, allowed_actions and schedule_resumes_on)."));
bodyChildren.push(L.body("Two AI-owned artefacts sit inside every campaign and project: \"My copy\" (CampaignMyCopy: mode, subject, body, warnings, source) is the AI-written first-touch email, previewable per lead (my-copy/preview), editable, and switchable between AI-generated and user-authored sources. The inbox (campaigns/{id}/inbox) holds per-lead conversation threads with reply, mark-replied, status and note endpoints, and the project-level autopilot settings (autopilot_enabled, auto_reply_enabled, auto_reply_delay_minutes, reply_cc_emails) determine whether the agent answers replies autonomously after a configured delay."));
bodyChildren.push(L.heading("6.3 Deliverability infrastructure flow", 2));
bodyChildren.push(L.body("A distinctive flow is domain provisioning. The DomainPlan schema (email_price_usd, emails_per_day, domains_needed, domains_owned, domains_to_buy, daily_budget_usd) and the domain-availability/domain-suggestions endpoints show the platform calculating how many sending domains a campaign needs for its daily email budget, suggesting domains to order, and tracking owned inventory. BYOD subscriptions and orders manage customer-supplied domains; avatars generate mailbox identities. Sending identity, mailboxes and cc/validate endpoints complete the cold-email infrastructure story: Explee operates (or procures) rotating sending infrastructure on the customer's behalf - the homepage's \"No SDRs or email infra needed\" claim maps directly onto these endpoints."));

// ===== 7. Agent internals =====
bodyChildren.push(L.heading("7. Agent and Campaign Engine Internals", 1));
bodyChildren.push(L.body("The \"editor\" of this product is the campaign brief plus its AI outputs. Unlike a media editor with timelines, the entire creative surface is textual: the user describes the offer, the customer problem, target roles and geographies, positive and negative criteria and example clients; the engine produces targeting, copy and follow-up schedules. Table 3 consolidates the engine's control surface as declared in the API schemas."));
bodyChildren.push(L.tableTitle("Table 3: Campaign engine control surface (from public OpenAPI schemas)"));
bodyChildren.push(L.dataTable(
  ["Control", "Fields", "Behaviour"],
  [
    ["Campaign brief", "offer, customer_problem, target_role/geography/company_size, positive/negative_criteria, example_clients, keywords", "Natural-language inputs that drive lead selection and copywriting"],
    ["Instructions", "instructions, followup_instructions, language", "Free-text steering for tone and follow-up policy"],
    ["Lead approval", "POST approve, leads_pool used/total/pending", "Human gate before sending; pool tracked per campaign"],
    ["Copy (My copy)", "mode, subject, body, warnings, source", "AI-drafted first touch; preview per lead; AI/user source switch"],
    ["Follow-ups", "max_touches, delay_days", "Automatic cadence after the first email"],
    ["Schedule", "days[], working_hours, timezone, use_system_schedule", "Business-hours sending windows"],
    ["Autopilot", "autopilot_enabled, auto_reply_enabled, auto_reply_delay_minutes, reply_cc_emails", "Autonomous reply handling with delay and CC policy"],
    ["Budgets", "daily_limit_usd (campaign), daily_budget_usd (project), monthly_cap_usd", "Spend ceilings at three levels"],
    ["Quality gates", "deduped, enriched_from_base, flagged_freemail, skipped_country, skipped_invalid_email", "Import-time data hygiene counters"],
  ],
  [20, 42, 38]
));
bodyChildren.push(L.body("Two further internals round out the engine. Hot leads are a first-class API collection (GET /autogtm/hot-leads) with per-campaign hot_leads counters, indicating a reply-classification model feeding a prioritised list. Compliance machinery is equally explicit: erased-leads (GET) supports GDPR erasure reporting, and suppress lists exist separately for companies and people with list-level CRUD. The import pipeline (campaigns/import) runs as an asynchronous task with per-row outcomes, deduplication and freemail flagging - evidence that list quality is treated as a product concern, not an afterthought."));
bodyChildren.push(L.body("The LinkedIn dimension is visible in three places: UsageProject counts linkedin_touches alongside emails_sent and spend; billing exposes linkedin-seats; and the frontend calls linkedin/access and linkedin/cabinet-arm. Combined with the \"Continue with LinkedIn\" social login, this indicates LinkedIn outreach or enrichment as a billable, seat-based component of the agent, though its exact mechanics sit behind authentication."));

// ===== 8. Monetization =====
bodyChildren.push(L.heading("8. Monetization Mechanics", 1));
bodyChildren.push(L.body("The pricing page presents two tabs: Outreach Agent and Database. The agent tab is explicitly \"Pay as you go with no subscription\": a slider from $30 (labelled \"Get $30 to try it\") scales the package - $30 buys approximately 750 emails, expected to yield roughly 2-6 warm leads and about 1 meeting, with an advertised cost-per-lead range of $1-$20. The database tab prices bulk data: emails from $10 per 1,000, deep research from $5 per 1,000, with semantic search and custom AI enrichment free and enterprise support attached. The homepage separately advertises \"$30 in free credits\" for new users."));
bodyChildren.push(L.tableTitle("Table 4: Published pricing points (as captured)"));
bodyChildren.push(L.dataTable(
  ["Item", "Price / mechanism", "Source"],
  [
    ["Outreach agent starter", "$30 slider entry; ~750 emails; $1-$20 cost per lead", "Pricing page"],
    ["Free credits", "$30 in free credits", "Homepage"],
    ["Database emails", "from $10 per 1,000", "Pricing page"],
    ["Deep research", "from $5 per 1,000", "Pricing page"],
    ["Semantic search / AI enrichment", "free", "Pricing page"],
    ["LinkedIn seats", "separate billed seats", "billing/linkedin-seats endpoint"],
    ["Median cost per lead (claim)", "$9 median", "Homepage"],
  ],
  [30, 42, 28]
));
bodyChildren.push(L.body("Under the headline pricing, the API schemas expose the real metering system. OutreachBillingResponse combines billing_mode, balance_usd, prepaid_balance_usd, email_price_usd, spent_today_usd, daily_budget_usd and a PostpaidState - meaning the platform supports both prepaid credit balances and postpaid arrangements. Spend is metered per email and per LinkedIn touch; three budget ceilings (campaign daily, project daily, project monthly cap with monthly_cap_reached flag) bound runaway spend; CreditDeposit records carry kind, amount_usd, occurred_at and expires_at, so credits can expire. Plan trials are explicit endpoints (subscription/plan-trial and /offer, plus a trial-notice), and the ask-owner billing endpoint suggests seat-sharing flows for teams."));
bodyChildren.push(L.body("Card handling is deliberately outsourced: the frontend loads Basis Theory's web elements SDK (v2.15.0) alongside Stripe, and cards are attached through a setup-intent endpoint. Basis Theory tokenises card data in its vault so raw PANs never touch Explee's servers, shrinking PCI scope; the billing module still manages VAT (billing/vat), addresses and invoices around the Stripe customer object. Growth loops are instrumented in the bundle: a referral endpoint, an affiliate programme with header/footer entry points, and a self-reported-source field captured at signup."));

// ===== 9. Notable engineering choices =====
bodyChildren.push(L.heading("9. Notable Engineering Choices", 1));
bodyChildren.push(L.body("Turbopack in production. Explee ships Turbopack-built chunks to real users, which is still uncommon; the choice signals a very current Next.js toolchain and acceptance of opaque chunk hashing in exchange for build speed."));
bodyChildren.push(L.body("The public API as a growth surface. Publishing a complete, tidy OpenAPI document for the outreach engine - including webhooks, async task patterns and per-row import results - turns integration into a distribution channel and is consistent with the MCP-first positioning. The same engine serves the dashboard, so API and UI cannot drift far apart."));
bodyChildren.push(L.body("CIAM over hand-rolled auth. Logto (with Ory Hydra interaction cookies underneath) provides OIDC + PKCE with an explicit resource indicator for the API and offline_access for refresh tokens. The strict session binding on registration (direct /register access is refused without an interaction) shows correct implementation rather than marketing."));
bodyChildren.push(L.body("PCI scope engineering. Pairing Stripe with Basis Theory tokenisation is the pattern of a team that wants Stripe's rails without touching raw card numbers - notable because many SaaS teams accept the simpler Stripe Elements-only trade-off."));
bodyChildren.push(L.body("EU-leaning data posture. Sentry is configured against the German ingest region, a compliance-faq page exists alongside legal routes excluded from robots.txt (/legal/, /data/), an erased-leads endpoint exposes GDPR erasure state, and suppress lists are first-class. The self-hosted Plausible instance also keeps analytics data in-house."));
bodyChildren.push(L.body("Bot management with a soft front door. Cloudflare Turnstile appeared inside the CDP target tree, email addresses are obfuscated via /cdn-cgi/l/email-protection, and a short-TTL cookie gate precedes page content. Marketing pages stay crawler-friendly while interactive surfaces accumulate friction."));

// ===== 10. Appendix =====
bodyChildren.push(L.heading("10. Evidence Appendix", 1));
bodyChildren.push(L.heading("10.1 Artefact inventory", 2));
bodyChildren.push(L.tableTitle("Table 5: Evidence artefacts (under explee_analysis/)"));
bodyChildren.push(L.dataTable(
  ["Artefact", "Size", "Content"],
  [
    ["openapi.json", "428 KB", "Public API specification, 68 paths, 152 schemas"],
    ["sitemap.xml", "118 KB", "646 URLs (628 b2b-database pages)"],
    ["homepage.html / api_docs.html", "177 KB / 626 KB", "Raw HTML captures"],
    ["*_scenario.json (7 files)", "0.28-1.4 MB each", "REA browser scenario Evidence bundles"],
    ["js_site/ (38 chunks)", "1.9 MB", "Production JavaScript, SHA-256 pinned"],
    ["jsapp_analysis.json", "118 MB", "REA application graph: 739 nodes, 916 edges, 813 findings"],
    ["artifacts/*.png (8)", "28-202 KB each", "Page screenshots (1280x720)"],
    ["artifacts/*.dom.txt, *.accessibility.txt", "0.4-475 KB", "Per-page DOM and accessibility snapshots"],
  ],
  [34, 22, 44]
));
bodyChildren.push(...L.image(`${ASSETS}/chart_graph.png`, 540, "Figure 5: Composition of the reconstructed JavaScript application graph."));
bodyChildren.push(L.heading("10.2 Captured storage and cookies", 2));
bodyChildren.push(L.body("Scenario storage snapshots (values hashed by REA) recorded these cookie names on the main host: explee_dcs (10-minute TTL), ex_pl (HttpOnly, 24-hour TTL), ex_auth_redirect, and logto_yb37qgq72o4s2o8kao78v after the auth redirect; on auth.explee.com: _logto, _logto.sig, _interaction, _interaction.sig; on the apex domain: cf_clearance (Cloudflare). LocalStorage keys recovered from the bundle: nows_description, slack_mockup, autogtm_utm_first. SessionStorage on the auth host holds app_id."));
bodyChildren.push(L.heading("10.3 Unknowns and residual limits", 2));
bodyChildren.push(L.body("The following remain unknown by design: any authenticated dashboard behaviour beyond its API schemas and bundle literals; the exact LLM models or vendors behind copywriting, nl-to-filters and reply classification (no vendor strings surfaced in the bundle); the identity of the LinkedIn automation internals (cabinet-arm); pricing behind paywalls deeper than the public page; and server-side infrastructure beyond the FastAPI host. Four scripts referenced source maps that were not retrievable, so original module names and an exact framework-version census were not recoverable. All marketing figures quoted in this report (105M companies, 97% inbox rate, $9 median CPL, 206,605 hot leads) are the site's own claims, not independently verified measurements."));

// ---------- numbering config ----------
const numbering = {
  config: [
    {
      reference: "ep-list",
      levels: [{
        level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 560, hanging: 360 } } },
      }],
    },
  ],
};

// ---------- assemble document ----------
const doc = new Document({
  creator: "REA automated analysis",
  title: "Explee.com Reverse Engineering Report",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 22, color: L.BODY_COLOR },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Arial", eastAsia: "SimHei" }, size: 32, bold: true, color: L.HEAD_COLOR },
        paragraph: { spacing: { before: 400, after: 180, line: 312 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Arial", eastAsia: "SimHei" }, size: 28, bold: true, color: L.HEAD_COLOR },
        paragraph: { spacing: { before: 280, after: 120, line: 312 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { ascii: "Arial", eastAsia: "SimHei" }, size: 24, bold: true, color: L.HEAD_COLOR },
        paragraph: { spacing: { before: 220, after: 100, line: 312 }, outlineLevel: 2 },
      },
    },
  },
  numbering,
  sections: [
    { // Section 1: cover — margin 0, no footer
      properties: {
        page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } },
      },
      children: L.buildCoverR1({
        title: "Explee.com Reverse Engineering Report",
        subtitle: "Technical analysis of the AI outreach platform: architecture, product flows, agent internals and monetization mechanics",
        englishLabel: "BLACK-BOX ANALYSIS",
        metaLines: [
          "Target: explee.com (captured 17 November 2026)",
          "Toolchain: REA (Reverse Engineer Anything) v6.9.0",
          "Method: passive capture - no account created, no authenticated access",
          "Evidence: 7 browser scenarios, public OpenAPI, 38 JS chunks",
        ],
        footerLeft: "REA evidence-based analysis",
        footerRight: "November 2026",
        palette: L.PALETTE,
      }),
    },
    { // Section 2: front matter (TOC) — Roman numerals
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: tocChildren,
    },
    { // Section 3: body — Arabic from 1
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: docHeader() },
      footers: { default: pageNumFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync("/home/z/my-project/download", { recursive: true });
  fs.writeFileSync(OUT, buf);
  console.log("written:", OUT, buf.length, "bytes");
});
