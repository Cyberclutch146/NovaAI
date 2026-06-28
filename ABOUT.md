# About AaaS — Analytics as a Service

## The Problem

Modern web analytics is broken. The dominant tools — Google Analytics, Adobe Analytics, Mixpanel — are bloated, privacy-hostile, and increasingly at odds with global privacy regulations. They:

- **Set dozens of cookies** that track users across the entire web
- **Ship 100+ KB of JavaScript** that tanks your Core Web Vitals
- **Fingerprint devices** using canvas, AudioContext, and font enumeration
- **Require cookie consent banners** that annoy users and hurt conversion rates
- **Sell or leverage your data** because the analytics product *is* the advertising product

Privacy-focused alternatives like [Plausible](https://plausible.io), [Fathom](https://usefathom.com), and [Umami](https://umami.is) have proven there's a better way. AaaS takes inspiration from all three and pushes further.

## What Is AaaS?

**AaaS (Analytics as a Service)** is an open-source, privacy-first web analytics system. At its core, it's a tiny JavaScript tracker (under 1.5 KB gzipped) that you drop into any website to collect page views and custom events — without cookies, without fingerprinting, and without compromising your users' privacy.

### What It Does

- **Tracks page views** — automatically on page load, and across SPA client-side navigations (React, Next.js, Vue, Svelte, Angular — all work out of the box)
- **Tracks custom events** — `analytics.track('signup', { plan: 'pro' })` for anything you want to measure
- **Batches and delivers events** — using `navigator.sendBeacon` for reliable delivery, even when the user closes the tab
- **Identifies sessions, not people** — a random UUID in `sessionStorage` groups events within a single browser tab, and is destroyed when the tab closes

### What It Does NOT Do

- ❌ Set cookies
- ❌ Use localStorage (persistent across sessions)
- ❌ Fingerprint the device (canvas, audio, fonts, screen)
- ❌ Collect IP addresses (server should hash/discard them)
- ❌ Track users across sites, tabs, or sessions
- ❌ Build user profiles
- ❌ Require a GDPR consent banner

## Architecture

AaaS has two main components (only the first is built so far):

### 1. Client-Side Tracker (`tracker.js`)

A vanilla JavaScript IIFE (Immediately Invoked Function Expression) with zero dependencies. It:

1. **Parses its own config** from the `<script>` tag's `src` URL and `data-*` attributes — a pattern shared by Plausible, Umami, and Fathom
2. **Generates a session ID** using `crypto.randomUUID()` (with a `crypto.getRandomValues()` fallback for older browsers) and stores it in `sessionStorage`
3. **Auto-tracks the initial page view** — but only if the page is visible (handles prerendering)
4. **Detects SPA navigations** by monkey-patching `history.pushState` and `history.replaceState`, plus listening for `popstate` events
5. **Queues events** and flushes them in batches every 2 seconds or when 10 events accumulate
6. **Flushes on tab hide** — listens for `visibilitychange` to send buffered events before the browser kills the page
7. **Sends data via `sendBeacon`** (with a `fetch(keepalive: true)` fallback) — both survive page unload

### 2. Collection Server (Not Yet Built)

A lightweight API endpoint that receives event batches and stores them. Planned features:

- Receives `POST /api/collect` with the JSON payload
- Validates the project ID
- Enriches events with server-side data (geo from IP, device from User-Agent) then immediately discards the raw IP
- Stores events in a time-series-friendly database (ClickHouse or SQLite)
- Powers a simple dashboard for viewing traffic

## Design Decisions

### Why `sessionStorage` Instead of Server-Side Hashing?

Plausible and Fathom identify visitors by hashing `IP + User-Agent + salt` on the server, rotating the salt daily. This is elegant but has trade-offs:

| | Server-Side Hash (Plausible/Fathom) | sessionStorage UUID (AaaS) |
|---|---|---|
| **Client-side storage** | None | sessionStorage (tab-scoped) |
| **Session accuracy** | Approximate — merges tabs, breaks with VPNs | Exact — one UUID per tab |
| **Privacy** | IP touches the server (even if hashed) | No PII ever leaves the browser |
| **Cross-tab linking** | Yes (same IP+UA = same hash) | No (each tab is independent) |
| **Proxy/CDN compatibility** | Requires raw IP access | Works behind any proxy |

We chose sessionStorage because it gives **better session accuracy** while being **more private** (the server never sees the raw IP for identity purposes).

### Why Batch Events?

None of the three reference trackers (Plausible, Umami, Fathom) batch events client-side — each event fires an individual HTTP request. For sites with many custom events, this creates unnecessary network chatter. Our batching (2s interval or 10 events) reduces request count while keeping latency low.

### Why `sendBeacon` Over `fetch`?

`navigator.sendBeacon` is purpose-built for analytics:

- **Survives page unload** — the browser queues the request and sends it even after the page is destroyed
- **Non-blocking** — fire-and-forget, doesn't tie up the main thread
- **Simple** — no promises, no error handling, no response processing

The 64 KiB payload limit is a non-issue with our batching strategy (10 events ≈ 2-3 KB).

### Why Not Fingerprint?

Device fingerprinting (canvas, AudioContext, font lists, screen dimensions) can uniquely identify users with high accuracy. We don't use it because:

1. **It's personal data under GDPR** — the European Data Protection Board considers fingerprints "personal data" when they can single out an individual
2. **Browsers are killing it** — Firefox ETP, Safari ITP, and Chrome Privacy Sandbox all actively degrade fingerprinting signals
3. **It's unnecessary** — a random UUID provides session identity without any user information
4. **The W3C says don't** — the W3C Privacy Principles state that APIs should expose only the entropy necessary for their intended function

### Why `async` Script Loading?

The tracker is loaded with `<script async>` because:

- Analytics scripts are independent — they don't need the DOM to be parsed
- `async` downloads in parallel and executes as soon as downloaded — zero render blocking
- This is the exact pattern used by GA4, Plausible, and Fathom
- Impact on Core Web Vitals: effectively zero (1.24 KB gzipped, no DOM manipulation)

## How This Compares

| Feature | AaaS | Plausible | Umami | Fathom | GA4 |
|---|---|---|---|---|---|
| **Gzipped size** | 1.24 KB | < 1 KB | < 2 KB | ~1.6 KB | ~134 KB |
| **Cookies** | None | None | None | None | Multiple |
| **Fingerprinting** | None | None | None | None | Yes |
| **Client batching** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **SPA support** | Auto | Auto | Auto | Config flag | Config |
| **Consent banner needed** | No | No | No | No | Yes |
| **Open source** | Yes | Yes | Yes | No (Lite only) | No |
| **Self-hostable** | Planned | Yes | Yes | No | No |

## Current Limitations

> ⚠️ This project is in **very early stages**. The following are known gaps:

- **No server component** — the tracker sends events, but there's nowhere to receive them yet
- **No dashboard** — you can't visualize the data
- **No npm package** — you must build from source
- **No engagement tracking** — time-on-page, scroll depth, etc. are not yet implemented
- **No outbound link tracking** — clicks to external domains are not captured
- **No bot filtering** — the server will need to filter out bots and crawlers
- **API may change** — `window.analytics` naming, payload shape, and config attributes are all subject to change

## Project Name

**AaaS** stands for **Analytics as a Service**. The name reflects the goal: a self-contained analytics system you can deploy as a service — not a library you integrate into your framework, but a standalone tool that works with any website.
