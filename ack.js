/*! argnode Consent Kit 0.5.0 | MPL-2.0 | Copyright (c) Argnode Oy | https://www.argnode.com */
/*
 * One file, no dependencies.
 * The order of the startup sequence (B7) matters: consent default comes before
 * any Google tag can load, and the tool loads GTM or gtag itself to guarantee it.
 */
(function () {
  'use strict';

  if (window.ack && window.ack.__loaded) return; // included twice: keep the first one

  // ---------------------------------------------------------------- constants

  var CONSENT_SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization',
    'analytics_storage', 'personalization_storage', 'functionality_storage', 'security_storage'];
  var ALWAYS_GRANTED = ['security_storage', 'functionality_storage'];

  // B10.1: search, social and AI crawlers. Short on purpose; settings.bots.pattern replaces it.
  var DEFAULT_BOT_PATTERN = 'googlebot|adsbot-google|mediapartners-google|google-inspectiontool|' +
    'bingbot|duckduckbot|yandex|baiduspider|applebot|facebookexternalhit|linkedinbot|twitterbot|' +
    'slackbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|' +
    'perplexitybot|ccbot|bytespider|amazonbot|petalbot';

  var DEFAULT_SETTINGS = {
    loader: { mode: 'none', gtmId: null, gtagId: null, gtmDataLayerName: 'dataLayer' },
    consentMode: { waitForUpdate: 500, urlPassthrough: true, adsDataRedaction: true },
    language: { source: 'html', fixed: null, fallback: 'en' },
    storage: { cookieName: 'ack_consent', maxAgeDays: 365, domain: 'auto', path: '/', sameSite: 'Lax' },
    // attribution: 'text' (default) | 'logo' (top-right, hidden on small screens) | 'none'.
    // attributionLogo: 'on-light' (dark wordmark, for light banners) | 'on-dark'.
    banner: { attribution: 'text', attributionLogo: 'on-light', poweredByText: 'Powered by argnode',
      poweredByUrl: null, policyUrl: null, exemptPaths: [] },
    bots: { skip: true, pattern: null },
    css: true,
    customCss: false,
    customTexts: []
  };

  // B9.4: options a page script may set before ack.js loads (window.ackOptions).
  var pageOptions = window.ackOptions || {};

  var ATTRIBUTION_HOST = 'argnode.com';
  var POWERED_BY_PAGES = {
    en: 'https://www.argnode.com/en/services/analytics',
    fi: 'https://www.argnode.com/fi/palvelut/analytiikka'
  };

  // ------------------------------------------------------------------ helpers

  var script = document.currentScript;
  var baseUrl = (script ? script.src : '').split(/[?#]/)[0].replace(/[^/]*$/, '');

  function attr(name) {
    return script ? script.getAttribute('data-' + name) : null;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // Deep merge for settings and texts: values in `over` win, objects merge key by key.
  function merge(base, over) {
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    for (k in over) {
      out[k] = isPlainObject(base[k]) && isPlainObject(over[k]) ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function warn(msg) {
    if (window.console) console.warn('[ack] ' + msg);
  }

  // cyrb53: fast, synchronous, good enough to detect any change in a text file (B5).
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0').slice(0, 8);
  }

  // A placeholder ID such as GTM-XXXXXXX or G-XXXXXXXXXX must never be loaded.
  function isRealId(id) {
    return !!id && !/X{4,}/i.test(id);
  }

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  // ------------------------------------------------- 1. bot check (B7 step 1b)

  function isBot(pattern) {
    try {
      return new RegExp(pattern, 'i').test(navigator.userAgent || '');
    } catch (e) {
      warn('settings.bots.pattern is not a valid regular expression.');
      return false;
    }
  }

  var skipBots = attr('bots') !== 'off';
  if (skipBots && isBot(DEFAULT_BOT_PATTERN)) {
    // Fail safe: a bot gets no tags and no banner. It is never treated as consented.
    window.ack = { __loaded: true, bot: true, open: function () {}, getConsent: function () { return null; },
      on: function () {}, renderPolicy: function () {}, reset: function () {}, version: null };
    return;
  }

  // ------------------------------------------- 2. dataLayer and the gtag stub

  var dataLayerName = attr('datalayer') || 'dataLayer';
  var dataLayer = window[dataLayerName] = window[dataLayerName] || [];

  // gtag() must push the `arguments` object, not an array: that is what gtag.js and GTM read.
  function gtag() {
    dataLayer.push(arguments);
  }
  if (dataLayerName === 'dataLayer' && typeof window.gtag !== 'function') window.gtag = gtag;

  // ------------------------------------------------ 3. Consent Mode default

  function defaultSignals() {
    var s = {};
    CONSENT_SIGNALS.forEach(function (name) {
      s[name] = ALWAYS_GRANTED.indexOf(name) >= 0 ? 'granted' : 'denied';
    });
    return s;
  }

  var consentDefault = defaultSignals();
  consentDefault.wait_for_update = parseInt(attr('wait-for-update'), 10) || DEFAULT_SETTINGS.consentMode.waitForUpdate;
  gtag('consent', 'default', consentDefault);
  if (attr('url-passthrough') !== 'false') gtag('set', 'url_passthrough', true);
  if (attr('ads-data-redaction') !== 'false') gtag('set', 'ads_data_redaction', true);

  // ------------------------------------------------------ 4. GTM / gtag loader

  var loaderStarted = false;

  function loadScript(url) {
    var s = document.createElement('script');
    s.async = true;
    s.src = url;
    var first = document.getElementsByTagName('script')[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else document.head.appendChild(s);
  }

  function startLoader(mode, id) {
    if (loaderStarted || !mode || mode === 'none') return;
    if (!isRealId(id)) {
      warn('Loader mode "' + mode + '" has no real ID (got "' + id + '"). GTM/gtag is not loaded.');
      return;
    }
    loaderStarted = true;
    var l = dataLayerName === 'dataLayer' ? '' : '&l=' + encodeURIComponent(dataLayerName);
    if (mode === 'gtm') {
      dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(id) + l);
    } else if (mode === 'gtag') {
      gtag('js', new Date());
      gtag('config', id);
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id) + l);
    }
  }

  // With a data- attribute the loader starts now, before any network request (B14).
  if (attr('gtm')) startLoader('gtm', attr('gtm'));
  else if (attr('gtag')) startLoader('gtag', attr('gtag'));

  // ---------------------------------------------------------- stylesheets

  // ack.js adds its own <link>: no blocking <link> in the page and no inline
  // onload= handler, which a strict CSP (script-src 'self') would block.
  function addStylesheet(href) {
    return new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = link.onerror = function () { resolve(); };
      document.head.appendChild(link);
      setTimeout(resolve, 1500); // never hold the banner back for a slow stylesheet
    });
  }

  var baseCssReady = attr('css') === 'none' ? Promise.resolve() : addStylesheet(baseUrl + 'ack.css');

  // -------------------------------------------- 5. config files (B3.0)

  // Site file first, tracked sample second. Returns { text, data, file }.
  function fetchJson(path, samplePath) {
    return fetch(baseUrl + path, { credentials: 'same-origin' }).then(function (res) {
      if (res.ok) return res.text().then(function (text) { return { text: text, file: path }; });
      if (!samplePath) return null;
      return fetch(baseUrl + samplePath, { credentials: 'same-origin' }).then(function (res2) {
        if (!res2.ok) throw new Error('Cannot load ' + path + ' or ' + samplePath);
        return res2.text().then(function (text) { return { text: text, file: samplePath }; });
      });
    }).then(function (r) {
      if (!r) return null;
      try {
        r.data = JSON.parse(r.text);
      } catch (e) {
        throw new Error(r.file + ' is not valid JSON: ' + e.message);
      }
      return r;
    });
  }

  // ------------------------------------------------------- cookie storage

  var mainDomain = null; // e.g. "example.com"; null on localhost and IP addresses

  function readCookie(name) {
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (parts[i].slice(0, eq) === name) return parts[i].slice(eq + 1);
    }
    return null;
  }

  function cookieNames() {
    return (document.cookie ? document.cookie.split('; ') : []).map(function (p) {
      return p.slice(0, p.indexOf('='));
    });
  }

  // B6: find the shortest domain the browser accepts, the way Google Analytics does.
  // This handles suffixes like .co.uk without a public-suffix list.
  function findMainDomain() {
    var host = location.hostname;
    if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.indexOf(':') >= 0) return null;
    var parts = host.split('.');
    for (var i = parts.length - 2; i >= 0; i--) {
      var candidate = parts.slice(i).join('.');
      document.cookie = 'ack_test=1; path=/; domain=' + candidate;
      if (readCookie('ack_test') === '1') {
        document.cookie = 'ack_test=; path=/; domain=' + candidate + '; max-age=0';
        return candidate;
      }
    }
    return null;
  }

  function cookieDomain(storage) {
    if (storage.domain === 'host' || !storage.domain) return null;
    if (storage.domain === 'auto') return mainDomain;
    return storage.domain.replace(/^\./, '');
  }

  function writeCookie(name, value, storage) {
    var domain = cookieDomain(storage);
    document.cookie = name + '=' + value +
      '; path=' + (storage.path || '/') +
      '; max-age=' + Math.round(storage.maxAgeDays * 86400) +
      '; samesite=' + (storage.sameSite || 'Lax') +
      (domain ? '; domain=' + domain : '') +
      (location.protocol === 'https:' ? '; secure' : '');
  }

  // Delete on every scope a tag may have used: host only, the host, and the main domain.
  function deleteCookie(name) {
    var domains = [null, location.hostname];
    if (mainDomain) domains.push(mainDomain);
    domains.forEach(function (d) {
      document.cookie = name + '=; path=/; max-age=0' + (d ? '; domain=' + d : '');
    });
  }

  // Names may use * as a wildcard, e.g. "_ga_*".
  function deleteCookiesMatching(patterns) {
    var names = cookieNames();
    patterns.forEach(function (pattern) {
      var re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      names.forEach(function (n) {
        if (re.test(n)) deleteCookie(n);
      });
    });
  }

  // ------------------------------------------------------------ the engine

  var settings = DEFAULT_SETTINGS;
  var categories = [];   // from the cookie list
  var updatedDate = null;
  var version = null;    // hash of the cookie list (B5)
  var lang = 'en';
  var texts = null;
  var record = null;     // current consent record, or null
  var firedEvents = {};  // category events pushed on this page view (B9.2)
  var listeners = [];
  var dialog = null;
  var choiceMade = false;
  var textVersion = null;  // hash of the texts shown in the banner, stored with the choice
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function optionalCategories() {
    return categories.filter(function (c) { return !c.required; });
  }

  // Shown in the banner, and so grantable: necessary always; others only if they
  // list cookies and the page has not hidden them (ackOptions.hideCategories).
  function isShown(cat) {
    if (cat.required) return true;
    if (!(cat.cookies || []).length) return false;
    return (pageOptions.hideCategories || []).indexOf(cat.id) < 0;
  }

  function isGranted(cat, rec) {
    return !!(cat.required || (rec && rec.c && rec.c[cat.id]));
  }

  // A signal is granted if any granted category maps to it (B3.2).
  function signalsFor(rec) {
    var s = defaultSignals();
    categories.forEach(function (cat) {
      if (!isGranted(cat, rec)) return;
      (cat.consentMode || []).forEach(function (name) { s[name] = 'granted'; });
    });
    return s;
  }

  function pickText(map) {
    if (map == null) return '';
    if (typeof map === 'string') return map;
    return map[lang] != null ? map[lang] : map[settings.language.fallback] != null
      ? map[settings.language.fallback] : map[Object.keys(map)[0]];
  }

  // {domain} in the cookie list becomes the site's real cookie domain at runtime.
  function fillTokens(s) {
    return String(s).replace(/\{domain\}/g, cookieDomain(settings.storage) || location.hostname);
  }

  function resolveLanguage() {
    var src = settings.language.source;
    var wanted = [];
    if (src === 'fixed' && settings.language.fixed) wanted.push(settings.language.fixed);
    else if (src === 'browser') wanted = (navigator.languages || [navigator.language]).slice();
    else wanted.push(document.documentElement.lang || '');
    var out = [];
    wanted.forEach(function (l) {
      if (!l) return;
      l = l.toLowerCase();
      out.push(l);
      if (l.indexOf('-') > 0) out.push(l.split('-')[0]);
    });
    out.push(settings.language.fallback || 'en', 'en');
    return out.filter(function (l, i) { return out.indexOf(l) === i; });
  }

  // Try each candidate language until a text file exists; merge over en.json for missing keys.
  // Loaded only when the banner or the policy needs them: a returning visitor with a
  // valid consent never downloads a text file (B14).
  var textsPromise = null;
  function ensureTexts() {
    if (!textsPromise) textsPromise = loadTexts();
    return textsPromise;
  }

  function loadTexts() {
    var candidates = resolveLanguage();
    function tryNext(i) {
      if (i >= candidates.length) return Promise.reject(new Error('No language file found in i18n/'));
      return fetchJson('i18n/' + candidates[i] + '.json').then(function (r) {
        if (!r) return tryNext(i + 1);
        lang = candidates[i];
        return r.data;
      });
    }
    return tryNext(0).then(function (t) {
      var withFallback = lang === 'en' ? Promise.resolve(t)
        : fetchJson('i18n/en.json').then(function (en) { return en ? merge(en.data, t) : t; });
      return withFallback.then(function (t2) {
        if ((settings.customTexts || []).indexOf(lang) < 0) return t2;
        return fetchJson('i18n/custom/' + lang + '.json').then(function (c) {
          return c ? merge(t2, c.data) : t2;
        });
      });
    }).then(function (t) {
      texts = t;
      textVersion = hash(JSON.stringify(t));
      return t;
    });
  }

  // ---------------------------------------------------- B8: consent resolution

  function readStoredRecord() {
    var raw = readCookie(settings.storage.cookieName);
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch (e) {
      return null;
    }
  }

  function isValid(rec) {
    if (!rec || rec.v !== version || typeof rec.ts !== 'number' || !isPlainObject(rec.c)) return false;
    return rec.ts + settings.storage.maxAgeDays * 86400 > nowSeconds();
  }

  // The latest consent an earlier script (e.g. a CRM) pushed to the dataLayer.
  function readExternalRecord() {
    for (var i = dataLayer.length - 1; i >= 0; i--) {
      var e = dataLayer[i];
      if (e && e.event === 'ack_external_consent' && isPlainObject(e.ack)) return e.ack;
    }
    return null;
  }

  // A category that is not shown can never be granted: Accept all must not
  // grant (or fire tags for) something the visitor never saw.
  function normalise(c) {
    var out = {};
    optionalCategories().forEach(function (cat) {
      out[cat.id] = !!(c && c[cat.id]) && isShown(cat);
    });
    return out;
  }

  function sameChoice(a, b) {
    return !!a && !!b && JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
  }

  function cookiesToDelete(rec) {
    var keep = {};
    var drop = [];
    categories.forEach(function (cat) {
      if (!isGranted(cat, rec)) return;
      (cat.cookies || []).forEach(function (k) { keep[k.name] = true; });
    });
    categories.forEach(function (cat) {
      if (isGranted(cat, rec)) return;
      (cat.cookies || []).forEach(function (k) {
        if (!keep[k.name] && drop.indexOf(k.name) < 0) drop.push(k.name);
      });
    });
    return drop;
  }

  // ------------------------------------------------------- B9: outbound events

  function applyConsent(newRecord, changed) {
    record = newRecord;

    // B10 withdrawal: on every apply, delete the first-party cookies that no granted
    // category lists. A cookie listed in several categories (e.g. an ID used for both
    // statistics and marketing) stays while any one of them is granted. Running on
    // page load too also clears a cookie that something set without consent.
    deleteCookiesMatching(cookiesToDelete(newRecord));

    // B9.1, then the page's own hook, then B9.2, then B9.3: tags fired by a
    // category event already see the new consent state and anything the page
    // pushed in its hook (for example a user ID).
    gtag('consent', 'update', signalsFor(newRecord));
    if (typeof pageOptions.beforeCategoryEvents === 'function') {
      try { pageOptions.beforeCategoryEvents(JSON.parse(JSON.stringify(newRecord))); }
      catch (e) { warn('ackOptions.beforeCategoryEvents threw: ' + e.message); }
    }

    categories.forEach(function (cat) {
      if (!cat.event || !isGranted(cat, newRecord) || firedEvents[cat.event]) return;
      firedEvents[cat.event] = true; // never twice on one page view, even after remove and re-add
      dataLayer.push({ event: cat.event });
    });

    if (changed) {
      var detail = { v: newRecord.v, t: newRecord.t, ts: newRecord.ts, c: newRecord.c, src: newRecord.src };
      dataLayer.push({ event: 'ack_consent_update', ack: detail });
      try {
        document.dispatchEvent(new CustomEvent('ack:consent', { detail: detail }));
      } catch (e) { /* very old browser: the dataLayer event is enough */ }
      listeners.forEach(function (fn) {
        try { fn(detail); } catch (e) { warn('A consent listener threw: ' + e.message); }
      });
    }
  }

  function saveChoice(c, src) {
    var rec = { v: version, t: textVersion, ts: nowSeconds(), c: normalise(c), src: src };
    writeCookie(settings.storage.cookieName, encodeURIComponent(JSON.stringify(rec)), settings.storage);
    applyConsent(rec, true);
  }

  // ----------------------------------------------------------- B10: banner

  function attribution() {
    if (settings.banner.showPoweredBy === false) return 'none'; // setting name before 0.2
    var a = settings.banner.attribution;
    return a === 'logo' || a === 'none' ? a : 'text';
  }

  function poweredByHref(surface) {
    if (settings.banner.poweredByUrl) return settings.banner.poweredByUrl;
    var page = POWERED_BY_PAGES[lang] || POWERED_BY_PAGES.en;
    var host = location.hostname.toLowerCase();
    // No UTM tags on Argnode's own site: a tagged internal link would restart the session.
    if (host === ATTRIBUTION_HOST || host.slice(-ATTRIBUTION_HOST.length - 1) === '.' + ATTRIBUTION_HOST) return page;
    return page + '?utm_source=' + encodeURIComponent(host) +
      '&utm_medium=referral&utm_campaign=evergreen-consent-kit&utm_content=' + surface;
  }

  function poweredByHtml(surface, cls) {
    if (attribution() === 'none') return '';
    return '<p class="' + cls + '"><a class="' + cls + '__link" href="' + escapeHtml(poweredByHref(surface)) +
      '" rel="noopener" target="_blank">' + escapeHtml(settings.banner.poweredByText) + '</a></p>';
  }

  function logoHtml() {
    if (attribution() !== 'logo') return '';
    var file = settings.banner.attributionLogo === 'on-dark' ? 'on-dark' : 'on-light';
    return '<a class="ack-banner__logo" href="' + escapeHtml(poweredByHref('banner')) + '" rel="noopener" target="_blank">' +
      '<img src="' + escapeHtml(baseUrl + 'assets/argnode-wordmark-' + file + '.svg') + '" alt="' +
      escapeHtml(settings.banner.poweredByText) + '" width="110" height="15"></a>';
  }

  function cookieTableHtml(cat, cls) {
    var t = texts.table;
    var cols = ['name', 'provider', 'domain', 'purpose', 'duration', 'setWhen', 'sharedWith'];
    var head = cols.map(function (c) { return '<th scope="col">' + escapeHtml(t[c]) + '</th>'; }).join('');
    var rows = (cat.cookies || []).map(function (k) {
      return '<tr>' + cols.map(function (c) {
        var v = fillTokens(pickText(k[c]));
        return c === 'name' ? '<th scope="row"><code>' + escapeHtml(v) + '</code></th>' : '<td>' + escapeHtml(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="' + cls + '-wrap"><table class="' + cls + '"><thead><tr>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function categoryHtml(cat, current) {
    var id = 'ack-cat-' + escapeHtml(cat.id);
    var n = (cat.cookies || []).length;
    var toggle = cat.required
      ? '<input type="checkbox" class="ack-switch__input" id="' + id + '" checked disabled>' +
        '<span class="ack-switch__label">' + escapeHtml(pickText(cat.label)) + '</span>' +
        '<span class="ack-switch__state">' + escapeHtml(texts.categoryAlwaysOn) + '</span>'
      : '<input type="checkbox" class="ack-switch__input" id="' + id + '" name="' + escapeHtml(cat.id) + '"' +
        (isGranted(cat, current) ? ' checked' : '') + '>' +
        '<span class="ack-switch__label">' + escapeHtml(pickText(cat.label)) + '</span>';
    return '<div class="ack-category ack-category--' + escapeHtml(cat.id) + '">' +
      '<label class="ack-switch" for="' + id + '">' + toggle + '</label>' +
      '<p class="ack-category__description">' + escapeHtml(pickText(cat.description)) + '</p>' +
      '<details class="ack-category__details"><summary class="ack-category__summary">' +
      escapeHtml(String(texts.cookiesSummary || 'Cookies ({n})').replace('{n}', n)) + '</summary>' +
      cookieTableHtml(cat, 'ack-table') + '</details></div>';
  }

  // B10: pages a visitor can read before a choice (cookie and privacy policy).
  // Path only, exact match: host, query, hash, case and a trailing slash do not count.
  function normalisePath(p) {
    p = String(p || '').split(/[?#]/)[0].toLowerCase().replace(/\/+$/, '');
    return p || '/';
  }

  function isExemptPage() {
    var list = settings.banner.exemptPaths;
    if (!Array.isArray(list) || !list.length) return false;
    var here = normalisePath(location.pathname);
    return list.some(function (p) { return normalisePath(p) === here; });
  }

  function policyUrl() {
    var u = settings.banner.policyUrl;
    return u ? pickText(u) : null;
  }

  function bannerHtml(current, showCategories) {
    var policy = policyUrl();
    // Categories with no cookies are not shown in the banner (B3.2), necessary always is.
    var cats = categories.filter(isShown);
    return '<dialog class="ack-banner' + (showCategories ? ' ack-banner--expanded' : '') + '" id="ack-banner" aria-labelledby="ack-title" lang="' + escapeHtml(lang) + '">' +
      '<form class="ack-banner__inner" method="dialog">' +
      '<div class="ack-banner__header">' +
      '<h2 class="ack-banner__title" id="ack-title" tabindex="-1">' + escapeHtml(texts.title) + '</h2>' +
      logoHtml() + '</div>' +
      '<p class="ack-banner__intro">' + escapeHtml(texts.intro) +
      (policy ? ' <a class="ack-banner__policy-link" href="' + escapeHtml(policy) + '">' + escapeHtml(texts.policyLink) + '</a>' : '') +
      '</p>' +
      '<div class="ack-categories"' + (showCategories ? '' : ' hidden') + '>' +
      cats.map(function (c) { return categoryHtml(c, current); }).join('') + '</div>' +
      // Visual order = DOM order = tab order. The default action is always last,
      // in the bottom-right corner: Accept on the first layer, Save once the
      // categories are open. Accept and Reject sit side by side, equal size.
      '<div class="ack-actions">' +
      '<button type="button" class="ack-button ack-button--customize" data-ack-action="customize"' + (showCategories ? ' hidden' : '') + '>' + escapeHtml(texts.customize) + '</button>' +
      '<button type="button" class="ack-button ack-button--reject" data-ack-action="reject">' + escapeHtml(texts.rejectAll) + '</button>' +
      '<button type="button" class="ack-button ack-button--accept" data-ack-action="accept">' + escapeHtml(texts.acceptAll) + '</button>' +
      '<button type="button" class="ack-button ack-button--save" data-ack-action="save"' + (showCategories ? '' : ' hidden') + '>' + escapeHtml(texts.save) + '</button>' +
      '</div>' +
      (attribution() === 'text' ? poweredByHtml('banner', 'ack-powered') : '') +
      '</form></dialog>';
  }

  function closeBanner() {
    if (!dialog) return;
    choiceMade = true;
    var d = dialog;
    dialog = null;
    d.close();
    d.parentNode.removeChild(d);
  }

  function onBannerClick(e) {
    var btn = e.target.closest && e.target.closest('[data-ack-action]');
    if (!btn || !dialog) return;
    var action = btn.getAttribute('data-ack-action');
    var all = {};
    optionalCategories().forEach(function (c) { all[c.id] = true; });

    if (action === 'customize') {
      dialog.querySelector('.ack-categories').hidden = false;
      dialog.classList.add('ack-banner--expanded');
      btn.hidden = true;
      dialog.querySelector('.ack-button--save').hidden = false;
      var firstToggle = dialog.querySelector('.ack-switch__input:not([disabled])');
      if (firstToggle) firstToggle.focus();
      return;
    }
    if (action === 'accept') saveChoice(all, 'banner');
    else if (action === 'reject') saveChoice({}, 'banner');
    else if (action === 'save') {
      var c = {};
      optionalCategories().forEach(function (cat) {
        var input = dialog.querySelector('input[name="' + cat.id + '"]');
        c[cat.id] = !!(input && input.checked);
      });
      saveChoice(c, 'banner');
    }
    closeBanner();
  }

  function showBanner(reopen) {
    if (dialog) return;
    choiceMade = false;
    var wrap = document.createElement('div');
    wrap.innerHTML = bannerHtml(record, reopen);
    dialog = wrap.firstChild;
    dialog.addEventListener('click', onBannerClick);
    // Escape does nothing (B10): the visitor must choose with one of the buttons.
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); });
    // Some browsers close a modal on a second Escape even if cancel is prevented.
    // Without a choice, open it again.
    dialog.addEventListener('close', function () {
      if (!choiceMade && dialog) dialog.showModal();
    });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    var title = dialog.querySelector('#ack-title');
    if (title) title.focus();
  }

  // --------------------------------------------------- B12: policy renderer

  function formatDate(ddmmyyyy) {
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(ddmmyyyy || '');
    if (!m) return ddmmyyyy || '';
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric' })
        .format(new Date(+m[3], +m[2] - 1, +m[1]));
    } catch (e) {
      return ddmmyyyy;
    }
  }

  function policyHtml() {
    var out = '<div class="ack-policy" lang="' + escapeHtml(lang) + '">' +
      '<p class="ack-policy__intro">' + escapeHtml(texts.policyIntro) + '</p>' +
      '<p class="ack-policy__meta">' + escapeHtml(texts.policyUpdated) + ': ' + escapeHtml(formatDate(updatedDate)) +
      ' &middot; ' + escapeHtml(texts.policyVersion) + ': <code>' + escapeHtml(version) + '</code></p>';
    categories.forEach(function (cat) {
      out += '<section class="ack-policy__category ack-policy__category--' + escapeHtml(cat.id) + '">' +
        '<h3 class="ack-policy__title">' + escapeHtml(pickText(cat.label)) + '</h3>' +
        '<p class="ack-policy__description">' + escapeHtml(pickText(cat.description)) + '</p>' +
        ((cat.cookies || []).length ? cookieTableHtml(cat, 'ack-policy__table')
          : '<p class="ack-policy__none">' + escapeHtml(texts.policyNone) + '</p>') +
        '</section>';
    });
    out += '<p class="ack-policy__actions"><button type="button" class="ack-button ack-button--change" data-ack-open>' +
      escapeHtml(texts.policyChange) + '</button></p>' +
      poweredByHtml('cookie-policy', 'ack-policy__powered') + '</div>';
    return out;
  }

  function renderPolicy(target) {
    return ready.then(ensureTexts).then(function () { return domReady; }).then(function () {
      var els = typeof target === 'string' ? document.querySelectorAll(target) : [target];
      Array.prototype.forEach.call(els, function (el) { if (el) el.innerHTML = policyHtml(); });
    });
  }

  // --------------------------------------------------------- public API (B13)

  function open() {
    return ready.then(ensureTexts).then(function () { return domReady; }).then(function () { showBanner(true); });
  }

  // Delegated, so a footer link works whenever it is added and never throws if clicked early.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-ack-open]');
    if (!el) return;
    e.preventDefault();
    open();
  });

  window.ack = {
    __loaded: true,
    open: open,
    getConsent: function () { return record ? JSON.parse(JSON.stringify(record)) : null; },
    on: function (name, fn) { if (name === 'consent' && typeof fn === 'function') listeners.push(fn); },
    renderPolicy: renderPolicy,
    reset: function () {
      return ready.then(ensureTexts).then(function () {
        deleteCookie(settings.storage.cookieName);
        if (record) applyConsent({ v: version, ts: nowSeconds(), c: normalise({}), src: 'reset' }, false);
        record = null;
        showBanner(false);
      });
    },
    ready: ready
  };
  Object.defineProperty(window.ack, 'version', { get: function () { return version; } });

  // --------------------------------------------------------------- startup

  // ack.js is async and may run before <body> exists. Network and consent work
  // start at once; only DOM work (banner, policy) waits for this.
  var domReady = new Promise(function (resolve) {
    if (document.readyState !== 'loading') resolve();
    else document.addEventListener('DOMContentLoaded', function () { resolve(); });
  });

  Promise.all([
    fetchJson('settings.json', 'settings.sample.json'),
    fetchJson('cookies.json', 'cookies.sample.json')
  ]).then(function (r) {
    var s = r[0], k = r[1];
    settings = merge(DEFAULT_SETTINGS, s ? s.data : {});
    if (k.file !== 'cookies.json') {
      warn('Running on cookies.sample.json. Create cookies.json with this site\'s real cookies to be compliant.');
    }
    categories = k.data.categories || [];
    updatedDate = k.data.updated || null;
    version = hash(k.text); // the resolved file, so replacing the sample re-prompts (B3.0)
    mainDomain = findMainDomain();

    // Late bot check with the deployer's own pattern. The loader may have started
    // already; consent stays denied, so nothing is measured.
    if (settings.bots.skip && skipBots && settings.bots.pattern && isBot(settings.bots.pattern)) return 'bot';

    if (settings.loader.mode === 'gtm') startLoader('gtm', settings.loader.gtmId);
    else if (settings.loader.mode === 'gtag') startLoader('gtag', settings.loader.gtagId);
    if (settings.customCss) addStylesheet(baseUrl + 'custom.css');
    // B9.4: a page may preset the consent, also as a promise (e.g. a CRM lookup).
    // Wait for it at most consentTimeoutMs; no answer means no preset.
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, pageOptions.consentTimeoutMs || 2000);
    });
    return Promise.race([Promise.resolve(pageOptions.consent).catch(function () { return null; }), timeout]);
  }).then(function (preset) {
    if (preset === 'bot') return;

    // B8: external source (dataLayer push, then the page preset), then the local cookie, then the banner.
    var stored = readStoredRecord();
    if (isValid(stored)) stored.c = normalise(stored.c);
    var pushed = readExternalRecord();
    var external = pushed && pushed.v === version ? pushed : (preset && isPlainObject(preset.c) ? preset : null);
    if (external) {
      var rec = { v: version, ts: external.ts || nowSeconds(), c: normalise(external.c), src: 'external' };
      var changed = !(isValid(stored) && sameChoice(stored.c, rec.c));
      if (changed) writeCookie(settings.storage.cookieName, encodeURIComponent(JSON.stringify(rec)), settings.storage);
      applyConsent(changed ? rec : stored, changed);
    } else if (isValid(stored)) {
      applyConsent(stored, false);
    }
    readyResolve();

    return domReady.then(function () {
      if (document.querySelector('[data-ack-policy]')) renderPolicy('[data-ack-policy]');
      // No banner on an exempt page: consent stays at the denied default, nothing is stored.
      if (!record && !isExemptPage()) {
        return Promise.all([ensureTexts(), baseCssReady]).then(function () { showBanner(false); });
      }
    });
  }).catch(function (err) {
    warn(err && err.message ? err.message : String(err));
  });
})();
