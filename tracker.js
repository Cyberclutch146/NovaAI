/**
 * Privacy-First Browser Analytics Tracker
 * ========================================
 *
 * A lightweight, cookie-free, GDPR-friendly analytics snippet.
 * Zero dependencies. Designed as an IIFE to prevent global scope pollution
 * (shared pattern across Plausible, Umami, and Fathom trackers).
 *
 * Public API:
 *   window.analytics.track(eventName, props?)  — fire a custom event
 *   window.analytics.page()                    — manually fire a pageview
 *
 * Payload shape per event:
 *   { event_name, session_id, url, referrer, props, ts }
 *
 * Size target: < 1.5 KB gzipped (comparable to Plausible < 1 KB, Fathom ~1.6 KB)
 */
;(function (window, document, history) {
  'use strict';

  // ─── CONFIGURATION ──────────────────────────────────────────────────
  // Parse project ID from own script tag's `src` query parameter.
  // This follows the Umami/Plausible pattern of self-configuration via
  // `document.currentScript` — all three trackers read `data-*` attributes
  // or URL params from their own `<script>` tag.
  //
  // Expected usage:
  //   <script async src="/tracker.min.js?id=PROJECT_123"></script>
  //
  // Fallback: if `document.currentScript` is unavailable (IE11, some edge
  // cases), we fall back to querySelector. See compatibility table in brief.
  var scriptEl = document.currentScript
    || document.querySelector('script[src*="tracker"]');

  var projectId = '';
  if (scriptEl && scriptEl.src) {
    try {
      var srcUrl = new URL(scriptEl.src);
      projectId = srcUrl.searchParams.get('id') || '';
    } catch (_e) {
      // URL constructor unavailable or invalid src — projectId stays empty.
      // This is acceptable: the server can reject events without a project ID.
    }
  }

  // ─── ENDPOINT ───────────────────────────────────────────────────────
  // The analytics collection endpoint. When self-hosting, users configure
  // this to their own server. For the test harness, we use a mock URL.
  //
  // CSP note (from research): Users with strict Content-Security-Policy
  // headers must whitelist this domain in `connect-src` for sendBeacon/fetch
  // to succeed. Document this:
  //   connect-src 'self' https://your-analytics-domain.com;
  //   script-src  'self' https://your-analytics-domain.com;
  var ENDPOINT = (scriptEl && scriptEl.getAttribute('data-endpoint'))
    || '/api/collect';

  // ─── SESSION IDENTITY ───────────────────────────────────────────────
  // Chosen: sessionStorage + crypto.randomUUID()
  //
  // WHY sessionStorage over cookies or localStorage (from research):
  // - Tab-scoped: each tab gets an independent session. Closing the tab
  //   destroys the ID, preventing cross-session tracking.
  // - No cross-site tracking: unlike cookies, sessionStorage is
  //   origin-scoped AND tab-scoped.
  // - No persistence: the ID cannot survive a browser restart.
  //
  // WHY NOT server-side hashing (like Plausible/Fathom):
  // - Server-side IP+UA hashing merges different tabs as one "visitor"
  //   and requires the server to see the raw IP, which some deployments
  //   (Cloudflare, proxies) strip or anonymize.
  // - A client-side random UUID contains zero user information.
  //
  // LEGAL BASIS (from research):
  // - The ID is random (no PII), ephemeral (tab-scoped), and not cross-site.
  // - Plausible/Fathom operate without consent under GDPR Art. 6(1)(f)
  //   "legitimate interest." Our approach is arguably less invasive than
  //   their IP+UA hashing. The French CNIL exempts audience measurement
  //   tools meeting specific conditions from consent requirements.
  //
  // DEVICE FINGERPRINTING (explicitly avoided — W3C Privacy Principles):
  // - Canvas, AudioContext, font enumeration, and screen fingerprinting
  //   are NOT used. W3C states APIs should expose only the entropy
  //   necessary for their intended function. A random UUID provides
  //   session identity without any user-identifying information.
  // - Browser vendors (Firefox ETP, Safari ITP, Chrome Privacy Sandbox)
  //   actively degrade fingerprinting signals.
  // - EDPB Guidelines 8/2020 consider device fingerprints "personal data"
  //   when they single out an individual, creating a consent obligation.

  /**
   * Generate a v4 UUID using crypto.randomUUID() with fallback.
   *
   * crypto.randomUUID() support (from research):
   *   Chrome 92+, Edge 92+, Firefox 95+, Safari 15.4+
   *   Requires HTTPS (secure context).
   *
   * Fallback uses crypto.getRandomValues() (from research):
   *   Chrome 11+, Firefox 21+, Safari 6.1+
   *   Works on both HTTP and HTTPS.
   *
   * Last-resort fallback: Math.random() — only for extremely old browsers.
   */
  function generateUUID() {
    // Primary: native crypto.randomUUID() — fastest, spec-compliant
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    // Fallback: construct v4 UUID from crypto.getRandomValues()
    // This covers older browsers and non-HTTPS contexts where randomUUID
    // is unavailable but getRandomValues exists.
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set version 4 (0100) in byte 6
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      // Set variant 10 in byte 8
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) {
        var h = bytes[i].toString(16);
        if (h.length === 1) h = '0' + h;
        hex.push(h);
      }
      return (
        hex[0] + hex[1] + hex[2] + hex[3] + '-' +
        hex[4] + hex[5] + '-' +
        hex[6] + hex[7] + '-' +
        hex[8] + hex[9] + '-' +
        hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15]
      );
    }

    // Last resort: Math.random() — not cryptographically secure but
    // sufficient for non-identifying session grouping.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Get or create session ID from sessionStorage.
   *
   * Fallback: if sessionStorage is unavailable (sandboxed iframes, data: URLs,
   * SecurityError in some browsers), we generate a per-pageload ID stored in
   * a closure variable. Analytics still works — sessions just won't group
   * across SPA navigations in that edge case.
   */
  var SESSION_KEY = '_a_sid';
  var sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (_e) {
    // sessionStorage unavailable — SecurityError (sandboxed iframe, data: URL)
    // or quota exceeded. Fall back to in-memory session ID.
    sessionId = generateUUID();
  }

  // ─── EVENT QUEUE & BATCHING ─────────────────────────────────────────
  // Batching strategy (from research):
  //
  // WHY batch instead of sending each event immediately?
  // - Reduces HTTP request count → less network overhead
  // - sendBeacon has a 64 KiB payload limit; batching keeps payloads small
  //   and predictable
  // - None of the three reference trackers (Plausible/Umami/Fathom) batch
  //   client-side; this is our enhancement over their designs
  //
  // Flush triggers:
  // 1. Timer: every 2 seconds
  // 2. Batch full: >= 10 events
  // 3. Visibility change: when tab becomes hidden (research: visibilitychange
  //    is more reliable than pagehide/unload, works on mobile, doesn't
  //    disable bfcache)
  var BATCH_INTERVAL = 2000; // 2 seconds
  var BATCH_SIZE = 10;       // max events per batch
  var queue = [];
  var flushTimer = null;

  /**
   * Flush the event queue to the server.
   *
   * Primary: navigator.sendBeacon() (from research):
   *   - Fire-and-forget, survives page unload
   *   - 64 KiB payload limit (research: browsers enforce this)
   *   - POST only, no custom headers (Content-Type set via Blob)
   *   - Returns boolean: false if payload exceeds limit or queue is saturated
   *   - Supported: Chrome 39+, Firefox 31+, Safari 11.1+
   *
   * Fallback: fetch() with keepalive: true (from research):
   *   - Modern successor to sendBeacon, more flexible
   *   - Survives page unload like sendBeacon
   *   - Supports custom headers and all HTTP methods
   *   - Supported: Chrome 66+, Firefox 52+, Safari 12.2+
   *
   * Last-resort: plain fetch() (no keepalive) — may be cancelled on unload
   * but is better than nothing.
   */
  function flush() {
    if (queue.length === 0) return;

    // Take current batch and reset queue
    var batch = queue.slice();
    queue.length = 0;

    var payload = JSON.stringify({
      project_id: projectId,
      events: batch
    });

    var sent = false;

    // Primary: sendBeacon with Blob for correct Content-Type
    // Research: sendBeacon can only send POST, and doesn't support custom
    // headers. Using a Blob with type 'application/json' ensures the server
    // receives the correct Content-Type header.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        sent = navigator.sendBeacon(ENDPOINT, blob);
      } catch (_e) {
        sent = false;
      }
    }

    // Fallback: fetch with keepalive
    // Research: keepalive: true ensures the request completes even if the
    // page is being unloaded. No strict size limit like sendBeacon.
    if (!sent && typeof fetch === 'function') {
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true
        }).catch(function () {
          // Silently fail — fire-and-forget analytics should never throw
          // or disrupt the host page.
        });
      } catch (_e) {
        // fetch itself threw (extremely rare) — nothing more we can do.
      }
    }
  }

  /**
   * Enqueue an event. Triggers immediate flush if batch is full.
   */
  function enqueue(eventName, props) {
    queue.push({
      event_name: eventName,
      session_id: sessionId,
      url: location.href,
      referrer: document.referrer,
      props: props || null,
      ts: Date.now()
    });

    // Flush immediately if batch size reached
    if (queue.length >= BATCH_SIZE) {
      flush();
    }
  }

  // ─── FLUSH TIMER ────────────────────────────────────────────────────
  // Start the periodic flush interval.
  // Research: setInterval is universally supported and sufficient for a
  // 2-second analytics batching interval. requestIdleCallback would be
  // more "polite" to the main thread but has limited Safari support and
  // adds complexity for marginal benefit in a sub-1ms flush operation.
  flushTimer = setInterval(flush, BATCH_INTERVAL);

  // ─── VISIBILITY CHANGE FLUSH ────────────────────────────────────────
  // Research: The visibilitychange event is the industry-standard hook for
  // flushing analytics on tab hide/close. It fires when:
  //   - User switches tabs
  //   - User minimizes the browser
  //   - User navigates away
  //   - User closes the tab
  //
  // WHY visibilitychange over pagehide/unload (from research):
  // - unload is unreliable on mobile browsers and disables bfcache
  // - pagehide is better than unload but visibilitychange covers MORE
  //   scenarios (tab switching without page unloading)
  // - visibilitychange: Chrome 33+, Firefox 18+, Safari 7+
  //
  // Combined with sendBeacon, this ensures buffered events are delivered
  // even when the user abruptly closes the tab.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });

  // ─── SPA NAVIGATION DETECTION ──────────────────────────────────────
  // Approach: Monkey-patch history.pushState and history.replaceState,
  // plus listen for popstate (back/forward buttons).
  //
  // WHY monkey-patching (from research):
  // - The popstate event only fires on browser back/forward — NOT on
  //   programmatic pushState/replaceState calls.
  // - Every major SPA framework (React Router, Next.js, Vue Router,
  //   SvelteKit, Angular Router) uses pushState internally.
  // - This is the same approach used by Umami (monkey-patches both
  //   pushState and replaceState) and Plausible (monkey-patches pushState
  //   and listens to popstate).
  //
  // SAFETY (from Umami's implementation):
  // - Original method is always called first → app behavior never broken
  // - We use `arguments` (not spread) to preserve the native Arguments
  //   object — critical per GA4 research (gtag.js depends on this)
  // - Patch applied once during IIFE init (before router init in most cases)
  //
  // 300ms DELAY (from Umami source code):
  // - After pushState fires, the DOM/title may not have updated yet.
  // - Umami uses a 300ms setTimeout before tracking the pageview to allow
  //   the framework to update document.title and DOM state.
  var lastUrl = location.href;
  var SPA_DELAY = 300; // ms — from Umami's delayDuration constant

  function handleNavigation() {
    // Debounce: only track if URL actually changed
    // This prevents duplicate pageviews when replaceState is called
    // without changing the URL (common in Next.js scroll restoration).
    setTimeout(function () {
      var currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        enqueue('pageview', null);
      }
    }, SPA_DELAY);
  }

  // Monkey-patch pushState
  // Following Umami's hook pattern: store original, replace with wrapper,
  // call original inside wrapper, then trigger our callback.
  var origPushState = history.pushState;
  history.pushState = function () {
    var result = origPushState.apply(this, arguments);
    handleNavigation();
    return result;
  };

  // Monkey-patch replaceState
  // Umami patches both pushState and replaceState. Plausible only patches
  // pushState. We follow Umami's more thorough approach because some
  // frameworks (e.g., Next.js App Router) use replaceState for certain
  // navigations (scroll restoration, URL state updates).
  var origReplaceState = history.replaceState;
  history.replaceState = function () {
    var result = origReplaceState.apply(this, arguments);
    handleNavigation();
    return result;
  };

  // Listen for popstate (browser back/forward buttons)
  // This is universally supported and fires on back/forward navigation
  // in all frameworks.
  window.addEventListener('popstate', handleNavigation);

  // ─── PUBLIC API ─────────────────────────────────────────────────────
  // Exposed on window.analytics following the spec:
  //   analytics.track(name, props?) — custom event
  //   analytics.page()              — manual pageview

  /**
   * Track a custom event.
   * @param {string} name - Event name (e.g., 'signup', 'purchase')
   * @param {Object} [props] - Optional key-value properties
   */
  function track(name, props) {
    if (typeof name !== 'string' || !name) return;
    enqueue(name, props || null);
  }

  /**
   * Manually track a pageview. Useful for:
   * - Hash-based routers (hashchange is legacy, not auto-detected)
   * - Custom navigation patterns not using pushState
   * - Frameworks that bypass the History API
   */
  function page() {
    lastUrl = location.href;
    enqueue('pageview', null);
  }

  // ─── AUTO PAGEVIEW ──────────────────────────────────────────────────
  // Fire initial pageview on script load.
  // All three reference trackers (Plausible, Umami, Fathom) auto-track the
  // initial page load. Plausible checks that the page is visible first;
  // we do the same.
  //
  // We do NOT check `navigator.doNotTrack` by default because:
  // - Research shows DNT is deprecated and being removed from browsers
  // - Major privacy-focused trackers (Plausible) do not honor it by default
  // - Our tracker collects no personal data, making DNT less relevant
  // However, we do skip localhost (following Plausible's pattern).
  var isLocalhost = /^localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(
    location.hostname
  );

  if (!isLocalhost) {
    // Only track if the page is currently visible
    // (prevents double-counting from background prerendering)
    if (document.visibilityState === 'visible' || document.visibilityState === undefined) {
      enqueue('pageview', null);
    } else {
      // Page was prerendered or opened in background — wait for it to become visible
      var onVisible = function () {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          enqueue('pageview', null);
        }
      };
      document.addEventListener('visibilitychange', onVisible);
    }
  }

  // ─── EXPOSE PUBLIC API ──────────────────────────────────────────────
  // Use a non-enumerable, non-writable property to reduce likelihood of
  // accidental overwriting by other scripts. But fall back to simple
  // assignment for older browsers lacking defineProperty support.
  var api = {
    track: track,
    page: page
  };

  try {
    Object.defineProperty(window, 'analytics', {
      value: api,
      writable: false,
      configurable: true, // allow re-definition if user explicitly wants to
      enumerable: true
    });
  } catch (_e) {
    window.analytics = api;
  }

})(window, document, window.history);
