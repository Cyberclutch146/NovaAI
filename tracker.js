;(function (window, document, history) {
  'use strict';

  var scriptEl = document.currentScript
    || document.querySelector('script[src*="tracker"]');

  var projectId = '';
  if (scriptEl && scriptEl.src) {
    try {
      var srcUrl = new URL(scriptEl.src);
      projectId = srcUrl.searchParams.get('id') || '';
    } catch (_e) {
    }
  }

  var ENDPOINT = (scriptEl && scriptEl.getAttribute('data-endpoint'))
    || '/api/collect';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
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

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var SESSION_KEY = '_a_sid';
  var sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = generateUUID();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (_e) {
    sessionId = generateUUID();
  }

  var BATCH_INTERVAL = 2000;
  var BATCH_SIZE = 10;
  var queue = [];
  var flushTimer = null;

  function flush() {
    if (queue.length === 0) return;

    var batch = queue.slice();
    queue.length = 0;

    var payload = JSON.stringify({
      project_id: projectId,
      events: batch
    });

    var sent = false;

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      try {
        var blob = new Blob([payload], { type: 'application/json' });
        sent = navigator.sendBeacon(ENDPOINT, blob);
      } catch (_e) {
        sent = false;
      }
    }

    if (!sent && typeof fetch === 'function') {
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true
        }).catch(function () {
        });
      } catch (_e) {
      }
    }
  }

  function enqueue(eventName, props) {
    queue.push({
      event_name: eventName,
      session_id: sessionId,
      url: location.href,
      referrer: document.referrer,
      props: props || null,
      ts: Date.now()
    });

    if (queue.length >= BATCH_SIZE) {
      flush();
    }
  }

  flushTimer = setInterval(flush, BATCH_INTERVAL);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });

  var lastUrl = location.href;
  var SPA_DELAY = 300; 

  function handleNavigation() {
    setTimeout(function () {
      var currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        enqueue('pageview', null);
      }
    }, SPA_DELAY);
  }

  var origPushState = history.pushState;
  history.pushState = function () {
    var result = origPushState.apply(this, arguments);
    handleNavigation();
    return result;
  };

  var origReplaceState = history.replaceState;
  history.replaceState = function () {
    var result = origReplaceState.apply(this, arguments);
    handleNavigation();
    return result;
  };

  window.addEventListener('popstate', handleNavigation);

  function track(name, props) {
    if (typeof name !== 'string' || !name) return;
    enqueue(name, props || null);
  }

  function page() {
    lastUrl = location.href;
    enqueue('pageview', null);
  }

  var isLocalhost = /^localhost$|^127(\.[0-9]+){0,2}\.[0-9]+$|^\[::1?\]$/.test(
    location.hostname
  );

  if (!isLocalhost) {
    if (document.visibilityState === 'visible' || document.visibilityState === undefined) {
      enqueue('pageview', null);
    } else {
      var onVisible = function () {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          enqueue('pageview', null);
        }
      };
      document.addEventListener('visibilitychange', onVisible);
    }
  }

  var api = {
    track: track,
    page: page
  };

  try {
    Object.defineProperty(window, 'analytics', {
      value: api,
      writable: false,
      configurable: true, 
      enumerable: true
    });
  } catch (_e) {
    window.analytics = api;
  }

})(window, document, window.history);
