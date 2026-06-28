# 🔒 AaaS — Analytics as a Service

> **⚠️ WARNING: This project is in VERY EARLY STAGES of development. APIs will change, features are incomplete, and it is NOT production-ready. Use at your own risk.**

A privacy-first browser analytics tracker. No cookies. No fingerprinting. Under 1.5 KB gzipped.

---

## What Is This?

AaaS is a lightweight, cookie-free analytics snippet designed to give you meaningful traffic insights without compromising your users' privacy. It's built as a single JavaScript file with zero dependencies — drop it into any website and it just works.

For a deeper explanation of the project's goals, architecture, and philosophy, see **[ABOUT.md](./ABOUT.md)**.

## Current Status

| Area | Status |
|---|---|
| Client-side tracker (IIFE) | ✅ Built |
| Auto page view tracking | ✅ Working |
| SPA navigation detection | ✅ Working |
| Custom event tracking | ✅ Working |
| Event batching (sendBeacon) | ✅ Working |
| Server / collection endpoint | ❌ Not started |
| Dashboard / UI | ❌ Not started |
| npm package | ❌ Not started |
| Documentation site | ❌ Not started |

## Quick Start

### 1. Build the tracker

```bash
npm install
node build.js
```

This produces `tracker.min.js` (~1.24 KB gzipped).

### 2. Add to your site

```html
<script async src="/tracker.min.js?id=YOUR_PROJECT_ID" data-endpoint="/api/collect"></script>
```

| Attribute | Description |
|---|---|
| `?id=` | Your project identifier (parsed from the script URL) |
| `data-endpoint` | Where events are sent (defaults to `/api/collect`) |

### 3. Use the API

```js
// Automatic page views fire on load — no setup needed.

// Track custom events:
analytics.track('signup', { plan: 'pro', source: 'landing' });
analytics.track('purchase', { amount: 49.99, currency: 'USD' });

// Manual pageview (for hash-based routers or custom navigation):
analytics.page();
```

### 4. Test locally

```bash
npx serve .
# Open http://localhost:3000/test.html
```

## Project Structure

```
AaaS/
├── tracker.js          # Full annotated source (~270 lines)
├── tracker.min.js      # Production build (1.24 KB gzipped)
├── build.js            # esbuild build script with size reporting
├── test.html           # Interactive test harness
├── ABOUT.md            # Project explainer & architecture
├── README.md           # You are here
└── package.json
```

## How It Works (TL;DR)

1. **Session ID** — A random UUID stored in `sessionStorage` (tab-scoped, dies on close)
2. **Page views** — Auto-tracked on load; SPA navigations detected via `history.pushState` monkey-patching
3. **Event delivery** — Batched via `navigator.sendBeacon` (2s interval or 10 events), with `fetch(keepalive)` fallback
4. **Tab close** — `visibilitychange` event flushes any buffered events before the tab dies

## Privacy Guarantees

- 🚫 **No cookies** — nothing written to `document.cookie`
- 🚫 **No fingerprinting** — no canvas, AudioContext, font, or screen fingerprinting
- 🚫 **No cross-site tracking** — sessionStorage is origin + tab scoped
- 🚫 **No persistent identifiers** — session ID is destroyed when the tab closes
- 🚫 **No PII collection** — the session ID is a random UUID, not derived from any user data
- ✅ **GDPR / ePrivacy compatible** — follows the same legal basis as Plausible and Fathom

## Payload Shape

Each event sent to the server looks like:

```json
{
  "project_id": "YOUR_PROJECT_ID",
  "events": [
    {
      "event_name": "pageview",
      "session_id": "a1b2c3d4-...",
      "url": "https://example.com/pricing",
      "referrer": "https://google.com",
      "props": null,
      "ts": 1719578400000
    }
  ]
}
```

## CSP Configuration

If your site uses a Content Security Policy, add:

```
script-src 'self' https://your-analytics-domain.com;
connect-src 'self' https://your-analytics-domain.com;
```

If self-hosted (same origin), `'self'` alone is sufficient.

## Browser Support

| Feature | Minimum Browser |
|---|---|
| Core tracking | Chrome 39+, Firefox 31+, Safari 11.1+, Edge 14+ |
| `crypto.randomUUID()` | Chrome 92+, Firefox 95+, Safari 15.4+ |
| Fallback UUID | Chrome 11+, Firefox 21+, Safari 6.1+ |

## Roadmap

> Remember: **very early stages**. Everything below is aspirational.

- [ ] Collection server (Node.js / serverless)
- [ ] Persistent storage (ClickHouse or SQLite)
- [ ] Analytics dashboard
- [ ] npm package (`@aaas/tracker`)
- [ ] Self-hosting guide
- [ ] Proxy/CNAME setup for ad-blocker bypass
- [ ] Engagement / time-on-page tracking
- [ ] Outbound link & file download tracking
- [ ] A/B test event support

## Contributing

This project is not yet accepting contributions — the architecture is still being shaped. Watch/star the repo to get notified when that changes.

## License

ISC
