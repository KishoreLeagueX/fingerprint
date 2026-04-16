/**
 * Custom Fingerprint Signal Collector
 */

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------

/** SHA-256 hasher — returns first 16 hex chars of SHA-256(str) */
async function hashString(str) {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ---------------------------------------------------------------------------
// BROWSER DETECTION HELPERS (matching open-source fp4)
// ---------------------------------------------------------------------------
function _countTrue(arr) { return arr.reduce((n, v) => n + (v ? 1 : 0), 0); }

/** Chromium / Chrome family */
function _isChromium() {
  const n = window, e = navigator;
  return _countTrue([
    'webkitPersistentStorage' in e, 'webkitTemporaryStorage' in e,
    0 === (e.vendor || '').indexOf('Google'),
    'webkitResolveLocalFileSystemURL' in n, 'BatteryManager' in n,
    'webkitMediaStream' in n, 'webkitSpeechGrammar' in n,
  ]) >= 5;
}

/** WebKit—based (Safari, iOS browsers) */
function _isWebKit() {
  const n = window;
  return _countTrue([
    'ApplePayError' in n, 'CSSPrimitiveValue' in n, 'Counter' in n,
    0 === navigator.vendor.indexOf('Apple'), 'RGBColor' in n, 'WebKitMediaKeys' in n,
  ]) >= 4;
}

/** Desktop Safari (not iOS Safari, not Macintosh Chrome) */
function _isDesktopWebKit() {
  const n = window, e = n.HTMLElement, t = n.Document;
  return _countTrue([
    'safari' in n, !('ongestureend' in n), !('TouchEvent' in n),
    !('orientation' in n), e && !('autocapitalize' in e.prototype),
    t && 'pointerLockElement' in t.prototype,
  ]) >= 4;
}

/** Gecko / Firefox */
function _isGecko() {
  const n = window;
  return _countTrue([
    'buildID' in navigator,
    'MozAppearance' in ((document.documentElement?.style) ?? {}),
    'onmozfullscreenchange' in n, 'mozInnerScreenX' in n,
    'CSSMozDocumentRule' in n, 'CanvasCaptureMediaStream' in n,
  ]) >= 4;
}

/** Chrome 115+ (non-Android) */
function _isChromiumNewEra() {
  const n = window, e = navigator, t = n.CSS, r = n.HTMLButtonElement;
  return _countTrue([
    !('getStorageUpdates' in e), r && 'popover' in r.prototype,
    'CSSCounterStyleRule' in n,
    t.supports('font-size-adjust: ex-height 0.5'),
    t.supports('text-transform: full-width'),
  ]) >= 4;
}

/** Safari on iOS (actual device or simulator) */
function _isIOS() {
  if (!_isWebKit()) return false;
  if (!_isDesktopWebKit()) return false;
  const n = window, e = n.URLPattern;
  return _countTrue([
    'union' in Set.prototype, 'Iterator' in n,
    e && 'hasRegExpGroups' in e.prototype,
    'RGB8' in WebGLRenderingContext.prototype,
  ]) >= 3;
}

/** Android (Chromium or Firefox) */
function _isAndroid() {
  const isChromium = _isChromium(), isGecko = _isGecko(), n = window, e = navigator;
  if (isChromium) {
    return _countTrue([
      !('SharedWorker' in n),
      e.connection && 'ontypechange' in e.connection,
      !('sinkId' in new Audio()),
    ]) >= 2;
  }
  if (isGecko) {
    return _countTrue([
      'onorientationchange' in n, 'orientation' in n,
      /android/i.test(e.appVersion),
    ]) >= 2;
  }
  return false;
}

/**
 * Run a callback inside a hidden same-origin iframe.
 * Cleans up after itself. Returns the callback's return value.
 * Matches withIframe() from open-source fp4.
 */
async function _withIframe(callback, srcdoc = '') {
  await new Promise(resolve => {
    if (document.body) return resolve();
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });

  const iframe = document.createElement('iframe');
  try {
    await new Promise((resolve, reject) => {
      let loaded = false;
      iframe.onload = () => { loaded = true; resolve(); };
      iframe.onerror = reject;
      const s = iframe.style;
      s.setProperty('display', 'block', 'important');
      s.position = 'absolute'; s.top = '0'; s.left = '0'; s.visibility = 'hidden';
      if (srcdoc && 'srcdoc' in iframe) { iframe.srcdoc = srcdoc; }
      else { iframe.src = 'about:blank'; }
      document.body.appendChild(iframe);
      // Also fire if already complete (some browsers skip onload for about:blank)
      const check = () => {
        if (loaded) return;
        if (iframe.contentWindow?.document?.readyState === 'complete') resolve();
        else setTimeout(check, 10);
      };
      check();
    });

    // Wait for iframe body
    while (!iframe.contentWindow?.document?.body) {
      await new Promise(r => setTimeout(r, 50));
    }

    return await callback(iframe, iframe.contentWindow);
  } finally {
    iframe.parentNode?.removeChild(iframe);
  }
}
// WebGL context helper (shared by signals 49 & 50)
function _getWebGLContext() {
  const canvas = document.createElement('canvas');
  let gl;
  canvas.addEventListener('webglCreateContextError', () => { gl = undefined; });
  for (const t of ['webgl', 'experimental-webgl']) {
    try { gl = canvas.getContext(t); } catch (_) {}
    if (gl) break;
  }
  return gl || null;
}

// WebGL parameter / extension-parameter enum sets (used by signal 50)
// Parameters whose values should be read (from fp4 pn set)
const _WEBGL_PARAMS = new Set([
  10752,2849,2884,2885,2886,2928,2929,2930,2931,2932,2960,2961,2962,2963,2964,2965,2966,
  2967,2968,2978,3024,3042,3088,3089,3106,3107,32773,32777,32823,32824,32936,32937,32938,
  32939,32968,32969,32970,32971,3317,33170,3333,3379,3386,33901,33902,34016,34024,34076,
  3408,3410,3411,3412,3413,3414,3415,34467,34816,34817,34818,34819,34877,34921,34930,
  35660,35661,35724,35738,35739,36003,36004,36005,36347,36348,36349,37440,37441,37443,
  7936,7937,7938,
]);
// Extension parameters (from fp4 bn set)
const _WEBGL_EXT_PARAMS = new Set([
  34047,35723,36063,34852,34853,34854,34229,36392,36795,38449,
]);


// ===========================================================================
// VISITOR ID — Fuzzy Weighted Similarity (mirrors Fingerprint Pro server logic)
// ===========================================================================

/**
 * Signal weights — must sum to 1.0.
 *
 * Weighting philosophy:
 *   HIGH  — signals rooted in physical hardware (CPU, GPU, audio DSP, OS fonts)
 *           → impossible for extensions to intercept or fake convincingly
 *   LOW   — signals known to be intercepted by anti-fingerprint tools
 *           (canvas, canvasPrng) → still contribute, but can't kill the ID alone
 *   ZERO  — volatile signals excluded entirely (PRNG entropy, timer precision,
 *           connection rtt, online status, perf time origin, ad blocker result)
 */
const SIGNAL_WEIGHTS = {
  // ── Hardware-level (impossible to fake) ────────────────────────────
  audioFingerprint:     0.12,   // OfflineAudioContext DSP — hardware specific
  mathFingerprint:      0.10,   // CPU FPU trig precision — V8/SpiderMonkey/JSC differ
  float32NanByte:       0.03,   // CPU byte-order of IEEE 754 NaN
  // ── GPU / WebGL ─────────────────────────────────────────────────────
  webGL:                0.06,   // GPU renderer string
  webGLExtensions:      0.06,   // full WebGL params + extension params
  webGLCanvas:          0.05,   // rendered scene pixel hash
  // ── OS installed software ───────────────────────────────────────────
  fonts:                0.09,   // installed font set (Jaccard similarity)
  fontPreferences:      0.04,   // 7 font-stack widths — OS text rendering
  speechVoices:         0.03,   // OS TTS voices
  // ── Browser engine identity ─────────────────────────────────────────
  evalLength:           0.04,   // eval.toString().length differs by engine
  errorStackFormat:     0.03,   // "v8" / "spidermonkey" / "jsc"
  wasmFeatures:         0.04,   // SIMD / bulk-memory etc.
  sourceBufferTypes:    0.02,   // typeof SourceBuffer per engine
  // ── Screen / Display ────────────────────────────────────────────────
  screenInfo:           0.04,   // resolution + colorDepth + DPR
  screenFrame:          0.03,   // window insets (notch / taskbar)
  hardwareInfo:         0.04,   // CPU cores + device memory
  // ── Canvas (low weight — Canvas Defender randomises) ─────────────────
  canvas2d:             0.03,   // raw text + geometry dataURLs
  canvasPrng:           0.02,   // seeded pixel hash
  // ── OS / Locale preferences ─────────────────────────────────────────
  timezone:             0.03,
  languages:            0.03,
  intlLocale:           0.02,
  platform:             0.03,
  // ── CSS Media Features (individual) ─────────────────────────────────
  colorGamut:           0.02,
  contrast:             0.02,
  reducedMotion:        0.01,
  hdr:                  0.01,
  invertedColors:       0.01,
  forcedColors:         0.01,
  monochrome:           0.01,
  // ── Navigator / Browser config ──────────────────────────────────────
  vendorInfo:           0.02,   // vendor string + flavors
  pluginsLength:        0.02,
  mimeTypesCount:       0.01,
  mediaFeatures:        0.01,   // legacy merged object (kept for compat)
  touchSupport:         0.01,
  navigatorFunctionNames: 0.01,
  applePay:             0.01,   // 1 = available; -1 = not; -3 = iframe
  // ── CSS / API flags ─────────────────────────────────────────────────
  cssBackdropFilter:    0.01,
  // ── Extended/Pro signals ────────────────────────────────────────────
  incognito:            0.04,   // private browsing detection
  reducedTransparency:  0.01,
  hoverNone:            0.01,   // touch vs mouse primary input
  anyHoverNone:         0.01,
  pointerCoarse:        0.01,   // input pointer type
  anyPointerCoarse:     0.01,
  storageEstimate:      0.02,   // quota size fingerprint
  battery:              0.02,   // battery hardware
  permissions:          0.02,   // camera/mic/geo permission states
  rtcPeerConnection:    0.03,   // local subnet IP (very stable)
  mediaDevices:         0.02,   // device count
  browserScaleFactor:   0.01,
  apiAvailability:      0.02,   // 15 API presence flags
};
// Weights are normalized at runtime → changing individual values is safe

// ---------------------------------------------------------------------------
// SIGNAL SIMILARITY FUNCTIONS
// Each returns a score in [0.0 … 1.0]
// ---------------------------------------------------------------------------

/** Jaccard similarity for two flat arrays treated as sets */
function jaccardSimilarity(a, b) {
  const setA = new Set(a), setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 1.0;
}

/** Per-key average match for plain objects — each key is either exact-match or not */
function objectKeySimilarity(current, stored) {
  const keys = Object.keys(stored).filter(k => k in current);
  if (!keys.length) return 0;
  const matches = keys.filter(k => current[k] === stored[k]).length;
  return matches / keys.length;
}

/**
 * Dispatch table — one function per signal key.
 * Returns 0–1 score comparing current vs stored value.
 */
function computeSignalSimilarity(key, current, stored) {
  if (current === null || current === undefined) return null;
  if (stored  === null || stored  === undefined) return null;

  switch (key) {

    // ── Number signals with tight tolerance ───────────────────────────
    case 'audioFingerprint': {
      if (typeof current !== 'number' || typeof stored !== 'number') return 0;
      // Negative = error code: must match exactly
      if (current < 0 || stored < 0) return current === stored ? 1 : 0;
      const pct = Math.abs(current - stored) / (Math.abs(stored) + 1e-10);
      // < 0.01% difference → same hardware; DSPs don't drift
      return pct < 0.0001 ? 1.0 : pct < 0.005 ? 0.6 : 0;
    }

    case 'evalLength':
    case 'float32NanByte':
    case 'mimeTypesCount':
    case 'pluginsLength':
      return current === stored ? 1.0 : 0;

    // ── String/enum exact match ────────────────────────────────────────
    case 'errorStackFormat':
    case 'intlLocale':
    case 'timezone':
    case 'platform':
    case 'webGLCanvas':
    case 'canvasPrng':
    case 'cssBackdropFilter':
    case 'navigatorFunctionNames':
    case 'colorGamut':
    case 'contrast':
    case 'reducedMotion':
    case 'hdr':
    case 'invertedColors':
    case 'forcedColors':
    case 'monochrome':
    case 'applePay':
    case 'screenFrame':
    case 'privateClickMeasurement':
      return current === stored ? 1.0 : 0;

    // ── Math fingerprint: object of floats, key-by-key comparison ─────
    case 'mathFingerprint': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const keys = Object.keys(stored).filter(k => k in current);
      if (!keys.length) return 0;
      let matches = 0;
      for (const k of keys) {
        const cv = current[k], sv = stored[k];
        if (typeof cv !== 'number' || typeof sv !== 'number') continue;
        // FPU trig results are deterministic — must match exactly
        const pct = Math.abs(cv - sv) / (Math.abs(sv) + 1e-20);
        if (pct < 1e-10) matches++;
      }
      return matches / keys.length;
    }

    // ── WebGL: GPU renderer strings are the most stable part ──────────
    case 'webGL': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      let score = 0, total = 0;
      // Renderer unmasked = strongest GPU signal
      for (const f of ['rendererUnmasked', 'vendorUnmasked', 'renderer', 'vendor', 'version']) {
        if (current[f] !== undefined && stored[f] !== undefined) {
          score += current[f] === stored[f] ? 1 : 0;
          total++;
        }
      }
      return total > 0 ? score / total : 0;
    }

    // ── WebGL extensions: compare supported extension set ─────────────
    case 'webGLExtensions': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      // Compare extension list (Jaccard) + a sample of parameters
      let score = 0, parts = 0;
      if (Array.isArray(current.extensions) && Array.isArray(stored.extensions)) {
        score += jaccardSimilarity(current.extensions, stored.extensions);
        parts++;
      }
      if (Array.isArray(current.unsupportedExtensions) && Array.isArray(stored.unsupportedExtensions)) {
        score += jaccardSimilarity(current.unsupportedExtensions, stored.unsupportedExtensions);
        parts++;
      }
      if (typeof current.parameters === 'object' && typeof stored.parameters === 'object') {
        score += objectKeySimilarity(current.parameters, stored.parameters);
        parts++;
      }
      return parts > 0 ? score / parts : 0;
    }

    // ── Canvas 2D: raw dataURL comparison (or legacy hash compat) ──────
    case 'canvas2d': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const winding = (current.winding === stored.winding) ? 1 : 0;
      // Support both raw dataURL and legacy textHash/geometryHash
      const textM = current.text !== undefined
        ? (current.text === stored.text ? 1 : 0)
        : (current.textHash === stored.textHash ? 1 : 0);
      const geoM  = current.geometry !== undefined
        ? (current.geometry === stored.geometry ? 1 : 0)
        : (current.geometryHash === stored.geometryHash ? 1 : 0);
      return (winding + textM + geoM) / 3;
    }

    // ── Fonts: Jaccard over installed font names ───────────────────────
    case 'fonts': {
      if (!Array.isArray(current) || !Array.isArray(stored)) return 0;
      return jaccardSimilarity(current, stored);
    }

    // ── Font preferences: compare per-stack widths (within 1px tolerance) ─
    case 'fontPreferences': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const keys = Object.keys(stored).filter(k => k in current);
      if (!keys.length) return 0;
      const matches = keys.filter(k => Math.abs(current[k] - stored[k]) < 1).length;
      return matches / keys.length;
    }

    // ── Speech voices: Jaccard over voice names ────────────────────────
    case 'speechVoices': {
      if (!Array.isArray(current) || !Array.isArray(stored)) return 0;
      const namesC = current.map(v => v && v.name).filter(Boolean);
      const namesS = stored.map(v => v && v.name).filter(Boolean);
      return jaccardSimilarity(namesC, namesS);
    }

    // ── Screen: resolution array + colorDepth + DPR ───────────────────
    case 'screenInfo': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      let score = 0, total = 0;
      // resolution is [larger, smaller]
      if (Array.isArray(current.resolution) && Array.isArray(stored.resolution)) {
        score += (current.resolution[0] === stored.resolution[0] &&
                  current.resolution[1] === stored.resolution[1]) ? 1 : 0;
        total++;
      } else {
        // Legacy flat format compat
        for (const f of ['width', 'height']) {
          if (f in current && f in stored) { score += current[f] === stored[f] ? 1 : 0; total++; }
        }
      }
      for (const f of ['colorDepth', 'devicePixelRatio']) {
        if (f in current && f in stored) { score += current[f] === stored[f] ? 1 : 0; total++; }
      }
      return total > 0 ? score / total : 0;
    }

    // ── Hardware: concurrency + memory ────────────────────────────────
    case 'hardwareInfo': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const concMatch = current.hardwareConcurrency === stored.hardwareConcurrency ? 1 : 0;
      const memMatch  = current.deviceMemory         === stored.deviceMemory         ? 1 : 0;
      return (concMatch + memMatch) / 2;
    }

    // ── Languages: flatten nested arrays, Jaccard ─────────────────────
    case 'languages': {
      const flatC = [].concat(...(Array.isArray(current) ? current : [current]));
      const flatS = [].concat(...(Array.isArray(stored)  ? stored  : [stored]));
      return jaccardSimilarity(flatC, flatS);
    }

    // ── Vendor: vendor string + flavors array ─────────────────────────
    case 'vendorInfo': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const vendorMatch = current.vendor === stored.vendor ? 1 : 0;
      const flavorsMatch = jaccardSimilarity(current.flavors || [], stored.flavors || []);
      return (vendorMatch + flavorsMatch) / 2;
    }

    // ── WasmFeatures: object of booleans ──────────────────────────────
    case 'wasmFeatures':
    case 'sourceBufferTypes':
      if (typeof current !== typeof stored) return 0;
      if (typeof current === 'object' && current !== null) return objectKeySimilarity(current, stored);
      return current === stored ? 1.0 : 0;

    // ── Touch support: multi-field ────────────────────────────────────
    case 'touchSupport': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      const fields = ['maxTouchPoints', 'touchEvent', 'touchStart'];
      const matches = fields.filter(f => current[f] === stored[f]).length;
      return matches / fields.length;
    }

    // ── Media features: prefer-color-scheme, colorGamut, etc. ─────────
    case 'mediaFeatures': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      return objectKeySimilarity(current, stored);
    }


    // ── Extended/Pro: most are simple exact/Jaccard matches ──────────────
    case 'incognito':
    case 'reducedTransparency':
    case 'hoverNone':
    case 'anyHoverNone':
    case 'pointerCoarse':
    case 'anyPointerCoarse':
    case 'browserScaleFactor':
      return current === stored ? 1.0 : 0;

    case 'storageEstimate': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      // quota changes in private vs normal — exact match
      return current.quota === stored.quota && current.persisted === stored.persisted ? 1.0 : 0.5;
    }

    case 'battery': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      // chargingTime/dischargingTime fluctuate; only level+charging matter
      const lev  = current.level   === stored.level   ? 1 : 0;
      const chg  = current.charging === stored.charging ? 1 : 0;
      return (lev + chg) / 2;
    }

    case 'permissions': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      return objectKeySimilarity(current, stored);
    }

    case 'rtcPeerConnection': {
      if (!Array.isArray(current) || !Array.isArray(stored)) return 0;
      return jaccardSimilarity(current, stored);
    }

    case 'mediaDevices': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      return objectKeySimilarity(current, stored);
    }

    case 'apiAvailability': {
      if (typeof current !== 'object' || typeof stored !== 'object') return 0;
      return objectKeySimilarity(current, stored);
    }

    default:
      // Generic fallback: exact equality
      try {
        return JSON.stringify(current) === JSON.stringify(stored) ? 1.0 : 0;
      } catch (_) {
        return current === stored ? 1.0 : 0;
      }
  }
}

// ---------------------------------------------------------------------------
// CORE: Compute weighted similarity score
// ---------------------------------------------------------------------------

/**
 * Compares current signals against a stored profile.
 * Returns { score, breakdown } where score is 0.0–1.0.
 */
function computeSimilarityScore(currentSignals, storedSignals) {
  let weightedSum = 0;
  let totalWeight = 0;
  const breakdown = {};

  // Normalize weights so they always sum to 1.0 regardless of which signals succeeded
  const weightEntries = Object.entries(SIGNAL_WEIGHTS);
  const rawTotal = weightEntries.reduce((s, [, w]) => s + w, 0);

  for (const [key, rawWeight] of weightEntries) {
    const weight = rawWeight / rawTotal;
    const simScore = computeSignalSimilarity(key, currentSignals[key], storedSignals[key]);

    if (simScore === null) {
      // Signal unavailable on this browser — skip, re-normalize
      breakdown[key] = { score: null, weight, status: 'unavailable' };
      continue;
    }

    weightedSum  += simScore * weight;
    totalWeight  += weight;
    breakdown[key] = { score: simScore, weight, contribution: simScore * weight };
  }

  const finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { score: finalScore, breakdown };
}

// ---------------------------------------------------------------------------
// SEED: Hash of hardened (un-spoofable) signals — used only to mint new IDs
// ---------------------------------------------------------------------------

/** Signals that no extension can intercept or randomize — used for ID seeding */
const HARDENED_KEYS = [
  'audioFingerprint', 'mathFingerprint', 'float32NanByte',
  'evalLength', 'errorStackFormat', 'wasmFeatures',
  'platform', 'hardwareInfo', 'screenInfo', 'timezone',
  'webGL', 'fonts',
];

/**
 * Deterministic recursive serializer.
 * - Object keys always sorted → insertion order never matters
 * - Numbers rounded to 10 significant digits → absorbs float drift
 * - null/undefined/NaN/Infinity → unique sentinels
 */
function stableSerialize(value) {
  if (value === null)            return '\x00null';
  if (value === undefined)       return '\x00undef';
  if (typeof value === 'boolean') return value ? '\x00T' : '\x00F';
  if (typeof value === 'number') {
    if (Number.isNaN(value))     return '\x00NaN';
    if (!Number.isFinite(value)) return value > 0 ? '\x00+Inf' : '\x00-Inf';
    return 'n:' + parseFloat(value.toPrecision(10)).toString();
  }
  if (typeof value === 'string') return 's:' + value;
  if (Array.isArray(value))      return '[' + value.map(stableSerialize).join(',') + ']';
  if (typeof value === 'object') {
    const pairs = Object.keys(value).sort()
      .map(k => JSON.stringify(k) + ':' + stableSerialize(value[k]));
    return '{' + pairs.join(',') + '}';
  }
  return String(value);
}

async function sha256hex(str) {
  const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function mintVisitorId(signals) {
  const hardened = {};
  for (const k of HARDENED_KEYS) {
    if (signals[k] !== null && signals[k] !== undefined) hardened[k] = signals[k];
  }
  const hex = await sha256hex(stableSerialize(hardened));
  return hex.slice(0, 32);
}

// ---------------------------------------------------------------------------
// MAIN: matchOrCreateVisitor — the full fuzzy pipeline
// ---------------------------------------------------------------------------

const FP_STORAGE_KEY   = 'fp_visitor_profile_v1';
const MATCH_THRESHOLD  = 0.75;   // ≥75% weighted similarity → same visitor
const PROFILE_VERSION  = 1;

/**
 * Full fuzzy-matching visitor ID pipeline:
 *
 *  First visit:
 *    collect signals → mint ID from hardened signals → store profile → return ID
 *
 *  Return visit:
 *    collect signals → load stored profile → compute 0–1 similarity score
 *      ≥ 0.75  → SAME visitor → refresh profile → return stored ID
 *      < 0.75  → profile too different → mint new ID → overwrite profile
 *
 * Canvas Defender example:
 *    canvas2d similarity = 0.33 (only winding matches, hashes differ)
 *    canvas2d weight     = 0.04
 *    contribution loss   = 0.04 × (1 - 0.33) = 0.027
 *    All other 25 signals match perfectly → score ≈ 0.97 → same visitor ✓
 */
async function matchOrCreateVisitor(signals) {
  // ---------- Try to load existing profile ----------
  let stored = null;
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === PROFILE_VERSION) stored = parsed;
    }
  } catch (_) {}

  // ---------- Compare against stored profile ----------
  if (stored) {
    const { score, breakdown } = computeSimilarityScore(signals, stored.signals);
    const pct = (score * 100).toFixed(1);

    console.group(`[FuzzyMatch] Similarity: ${pct}% (threshold ${MATCH_THRESHOLD * 100}%)`);
    console.log('[FuzzyMatch] Breakdown (score × weight contribution):');
    const rows = Object.entries(breakdown)
      .filter(([, v]) => v.score !== null)
      .sort(([, a], [, b]) => b.weight - a.weight);
    for (const [key, { score: s, contribution }] of rows) {
      const bar  = s === 1 ? '✓' : s === 0 ? '✗' : `~${(s*100).toFixed(0)}%`;
      const loss = s < 1 ? ` (−${((1-s)*breakdown[key].weight*100).toFixed(2)}%)` : '';
      console.log(`  ${key.padEnd(24)} ${bar}  weight=${( breakdown[key].weight*100).toFixed(1)}%${loss}`);
    }
    console.groupEnd();

    if (score >= MATCH_THRESHOLD) {
      // Same visitor — update profile signals with latest readings
      stored.signals   = extractProfileSignals(signals);
      stored.lastSeen  = Date.now();
      stored.visits    = (stored.visits || 1) + 1;
      try { localStorage.setItem(FP_STORAGE_KEY, JSON.stringify(stored)); } catch (_) {}

      console.log(`%c[FuzzyMatch] MATCH (${pct}%) → visitorId: ${stored.visitorId}`,
                  'color:#27ae60;font-weight:bold');
      return { visitorId: stored.visitorId, score, isNew: false, visits: stored.visits };
    }

    console.warn(`[FuzzyMatch] NO MATCH (${pct}%) — creating new profile`);
  }

  // ---------- New visitor or profile too different → mint fresh ID ----------
  const visitorId = await mintVisitorId(signals);
  const profile = {
    version:   PROFILE_VERSION,
    visitorId,
    signals:   extractProfileSignals(signals),
    firstSeen: Date.now(),
    lastSeen:  Date.now(),
    visits:    1,
  };
  try { localStorage.setItem(FP_STORAGE_KEY, JSON.stringify(profile)); } catch (_) {}

  console.log(`%c[FuzzyMatch] NEW visitor → visitorId: ${visitorId}`,
              'color:#4361ee;font-weight:bold');
  return { visitorId, score: stored ? 0 : null, isNew: true, visits: 1 };
}

/** Extract only the signals relevant to matching (keeps localStorage lean) */
function extractProfileSignals(signals) {
  const out = {};
  for (const key of Object.keys(SIGNAL_WEIGHTS)) {
    if (signals[key] !== undefined) out[key] = signals[key];
  }
  return out;
}


// (MurmurHash3 removed — SHA-256 via crypto.subtle is used exclusively)

/** @deprecated Do not call — throws immediately */
function murmur3_128() {
  throw new Error('murmur3_128 removed; use sha256hex() instead');
}

/** Wrap a signal collector: logs label + value, returns { label, value } */
function collectSignal(label, fn) {
  try {
    const value = fn();
    if (value && typeof value.then === 'function') {
      return value.then(v => {
        console.log(`[Signal] ${label}:`, v);
        return { label, value: v };
      }).catch(err => {
        console.warn(`[Signal] ${label}: ERROR —`, err.message);
        return { label, value: null, error: err.message };
      });
    }
    console.log(`[Signal] ${label}:`, value);
    return Promise.resolve({ label, value });
  } catch (err) {
    console.warn(`[Signal] ${label}: ERROR —`, err.message);
    return Promise.resolve({ label, value: null, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// SIGNAL 01 [Early/Critical] — User Agent
// ---------------------------------------------------------------------------
function collectUserAgent() {
  return collectSignal('userAgent', () => navigator.userAgent);
}

// ---------------------------------------------------------------------------
// SIGNAL 02 [Early/Critical] — User-Agent Client Hints (Chromium only)
// ---------------------------------------------------------------------------
async function collectClientHints() {
  return collectSignal('clientHints', async () => {
    const uaData = navigator.userAgentData;
    if (!uaData || typeof uaData !== 'object') return null;
    const highEntropy = await uaData.getHighEntropyValues([
      'brands', 'mobile', 'platform', 'platformVersion',
      'architecture', 'bitness', 'model', 'uaFullVersion', 'fullVersionList'
    ]).catch(() => ({}));
    return {
      brands: uaData.brands,
      mobile: uaData.mobile,
      platform: uaData.platform,
      highEntropy
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 03 [Early/Critical] — Platform (with proper WebKit/iOS iPad detection, matches fp4)
// ---------------------------------------------------------------------------
function collectPlatform() {
  return collectSignal('platform', () => {
    const platform = navigator.platform;
    // On WebKit/iOS, 'MacIntel' may be reported for iPad — detect correctly
    if (platform === 'MacIntel' && _isWebKit() && !_isDesktopWebKit()) {
      if (navigator.platform === 'iPad') return 'iPad';
      const s = screen, ratio = s.width / s.height;
      const isIpad = _countTrue([
        'MediaSource' in window,
        !!Element.prototype.webkitRequestFullscreen,
        ratio > 0.65 && ratio < 1.53,
      ]) >= 2;
      return isIpad ? 'iPad' : 'iPhone';
    }
    return platform;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 04 [Early/Critical] — Navigator Language Singular
// Source: BA() in fpjs.cdn.adgeist.ai.js — navigator.language (single string)
// ---------------------------------------------------------------------------
function collectNavigatorLanguage() {
  return collectSignal('navigatorLanguage', () => navigator.language || null);
}

// ---------------------------------------------------------------------------
// SIGNAL 05 [Early/Critical] — Languages (with Chromium guard matching fp4)
// ---------------------------------------------------------------------------
function collectLanguages() {
  return collectSignal('languages', () => {
    const nav = navigator;
    const result = [];
    const primary = nav.language || nav.userLanguage || nav.browserLanguage || nav.systemLanguage;
    if (primary !== undefined) result.push([primary]);
    if (Array.isArray(nav.languages)) {
      // Chromium guard: only include navigator.languages if this is NOT the
      // specific new-era Chromium that has confusing RTCEncodedAudioFrame etc.
      const skipChromiumLanguages = _isChromium() && _countTrue([
        !('MediaSettingsRange' in window),
        'RTCEncodedAudioFrame' in window,
        '' + window.Intl === '[object Intl]',
        '' + window.Reflect === '[object Reflect]',
      ]) >= 3;
      if (!skipChromiumLanguages) result.push(nav.languages.slice());
    } else if (typeof nav.languages === 'string' && nav.languages) {
      result.push(nav.languages.split(','));
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 06 [Early/Critical] — Navigator Extra Properties
// ---------------------------------------------------------------------------
function collectNavigatorExtras() {
  return collectSignal('navigatorExtras', () => ({
    cpuClass:        navigator.cpuClass,
    oscpu:           navigator.oscpu,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
    productSub:      navigator.productSub,
    appVersion:      navigator.appVersion
  }));
}

// ---------------------------------------------------------------------------
// SIGNAL 07 [Early/Critical] — Navigator App Version
// Source: xW / sl in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectAppVersion() {
  return collectSignal('appVersion', () => navigator.appVersion || null);
}

// ---------------------------------------------------------------------------
// SIGNAL 08 [Early/Critical] — Navigator Product Sub
// Source: uW / pl in fpjs.cdn.adgeist.ai.js — should be "20030107" in Chromium
// ---------------------------------------------------------------------------
function collectProductSub() {
  return collectSignal('productSub', () => navigator.productSub || null);
}

// ---------------------------------------------------------------------------
// SIGNAL 09 [Early/Critical] — Vendor + Vendor Flavors
// ---------------------------------------------------------------------------
function collectVendorInfo() {
  return collectSignal('vendorInfo', () => {
    const flavors = [];
    for (const key of [
      'chrome', 'safari', '__crWeb', '__gCrWeb', 'yandex', '__yb', '__ybro',
      '__firefox__', '__edgeTrackingPreventionStatistics', 'webkit',
      'oprt', 'samsungAr', 'ucweb', 'UCShellJava', 'puffinDevice'
    ]) {
      const v = window[key];
      if (v && typeof v === 'object') flavors.push(key);
    }
    return {
      vendor: navigator.vendor || '',
      flavors: flavors.sort()
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 10 [Early/Critical] — Navigator Function Names
// Source: HU() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectNavigatorFunctionNames() {
  return collectSignal('navigatorFunctionNames', () => {
    const names = [];
    const excludes = ['webkitPersistentStorage', 'connectionSpeed', 'xr', 'hid'];
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(navigator))) {
      if (excludes.includes(key)) continue;
      try {
        const val = navigator[key];
        if (typeof val === 'function' && val.name !== undefined) names.push(val.name);
      } catch (_) {
        return { error: true };
      }
    }
    return hashString(names.join(','));
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 11 [Early/Critical] — Navigator Descriptor Check (tamper detection)
// Source: UH() / gN() in fpjs.cdn.adgeist.ai.js
// Checks if navigator properties have proper getter descriptors (not modified)
// ---------------------------------------------------------------------------
function collectNavigatorDescriptors() {
  return collectSignal('navigatorDescriptors', () => {
    const props = ['hardwareConcurrency', 'language', 'languages', 'platform',
                   'userAgent', 'vendor', 'maxTouchPoints', 'deviceMemory'];
    const result = {};
    for (const prop of props) {
      try {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), prop)
                  || Object.getOwnPropertyDescriptor(navigator, prop);
        if (!desc) { result[prop] = 'missing'; continue; }
        if (desc.get) {
          // Native getter will throw when converted to string without native context
          result[prop] = 'getter:' + (desc.get.toString().includes('[native code]') ? 'native' : 'modified');
        } else {
          result[prop] = 'value:' + typeof desc.value;
        }
      } catch (_) {
        result[prop] = 'error';
      }
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 12 [Early/Critical] — UA Client Hints Available (boolean)
// Source: Dv() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectUaDataAvailable() {
  return collectSignal('uaDataAvailable', () =>
    !!(navigator.userAgentData && typeof navigator.userAgentData === 'object')
  );
}

// ---------------------------------------------------------------------------
// SIGNAL 13 [Early/Critical] — Screen Resolution (sorted descending, like OS version)
// ---------------------------------------------------------------------------
function collectScreenInfo() {
  return collectSignal('screenInfo', () => {
    const s = screen;
    const width  = parseInt(s.width)  || null;
    const height = parseInt(s.height) || null;
    // Return [larger, smaller] — landscape/portrait agnostic (matches fp4 K())
    const dims = [width, height];
    dims.sort((a, b) => b - a);
    return {
      resolution: dims,
      colorDepth: s.colorDepth,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 14 [Early/Critical] — Screen Frame (taskbar/dock insets, with fullscreen poll)
// Matches fp4 nn() + en() — polls until fullscreen is exited, rounds to 10px
// ---------------------------------------------------------------------------
function collectScreenFrame() {
  return collectSignal('screenFrame', async () => {
    function getFrame() {
      const s = screen;
      const _s = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
      return [
        _s(s.availTop),
        _s(s.width)  == null ? null : (_s(s.width)  - (_s(s.availWidth)  || 0) - (_s(s.availLeft) || 0)),
        _s(s.height) == null ? null : (_s(s.height) - (_s(s.availHeight) || 0) - (_s(s.availTop)  || 0)),
        _s(s.availLeft),
      ];
    }
    function isAllZero(frame) { return frame.every(v => !v); }
    function roundFrame(frame) { return frame.map(v => v === null ? null : Math.round(v / 10) * 10); }

    let frame = getFrame();

    // If fullscreen is active, exit it first (same as fp4)
    if (isAllZero(frame)) {
      const doc = document;
      const fsElement = doc.fullscreenElement || doc.msFullscreenElement ||
                        doc.mozFullScreenElement || doc.webkitFullscreenElement;
      if (fsElement) {
        try {
          await (doc.exitFullscreen || doc.msExitFullscreen ||
                 doc.mozCancelFullScreen || doc.webkitExitFullscreen).call(doc);
          frame = getFrame();
        } catch (_) {}
      }
    }

    return roundFrame(frame);
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 15 [Early/Critical] — Window Dimensions (outer + inner)
// Source: zW in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWindowDimensions() {
  return collectSignal('windowDimensions', () => ({
    outerWidth:  window.outerWidth,
    outerHeight: window.outerHeight,
    innerWidth:  window.innerWidth,
    innerHeight: window.innerHeight
  }));
}

// ---------------------------------------------------------------------------
// SIGNAL 16 [Early/Critical] — High DPI Media Query (device pixel ratio ≥ 2)
// Source: bU() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectHighDpi() {
  return collectSignal('highDpi', () => {
    if (typeof window.matchMedia !== 'function') return null;
    const mq = window.matchMedia(
      '(-webkit-min-device-pixel-ratio: 2), (min-device-pixel-ratio: 2), (min-resolution: 192dpi)'
    );
    return mq.matches !== undefined ? mq.matches : null;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 17 [Early/Critical] — Timezone
// ---------------------------------------------------------------------------
function collectTimezone() {
  return collectSignal('timezone', () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    } catch (_) {}
    const year = new Date().getFullYear();
    const offset = -Math.max(
      parseFloat(new Date(year, 0, 1).getTimezoneOffset()),
      parseFloat(new Date(year, 6, 1).getTimezoneOffset())
    );
    return `UTC${offset >= 0 ? '+' : ''}${offset}`;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 18 [Early/Critical] — Performance Time Origin
// Source: Zq() / HO() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectPerformanceTimeOrigin() {
  return collectSignal('performanceTimeOrigin', () => {
    const t = performance.timeOrigin;
    return t !== undefined ? t : Date.now() - performance.now();
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 19 [Early/Critical] — Timer Precision (performance.now() resolution)
// Source: xO() in fpjs.cdn.adgeist.ai.js
// Tests smallest & second-smallest delta between successive performance.now() calls
// ---------------------------------------------------------------------------
function collectTimerPrecision() {
  return collectSignal('timerPrecision', () => {
    const now = performance;
    if (!now || !now.now) return null;
    let min1 = 1, min2 = 1, prev = now.now(), curr = prev;
    for (let i = 0; i < 50000; i++) {
      if ((prev = curr) < (curr = now.now())) {
        const diff = curr - prev;
        if (diff > min1) {
          /* skip */
        } else if (diff < min1) {
          min2 = min1;
          min1 = diff;
        } else if (diff < min2) {
          min2 = diff;
        }
      }
    }
    return [min1, min2];
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 20 [Early/Critical] — Intl Locale
// ---------------------------------------------------------------------------
function collectIntlLocale() {
  return collectSignal('intlLocale', () => {
    if (!window.Intl) return null;
    const fmt = window.Intl.DateTimeFormat;
    if (!fmt) return null;
    return fmt().resolvedOptions().locale || null;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 21 [Early/Critical] — Storage Availability
// ---------------------------------------------------------------------------
function collectStorageAvailability() {
  return collectSignal('storageAvailability', () => {
    let sessionStorage = false, localStorage = false, openDatabase = false;
    try { sessionStorage = !!window.sessionStorage; } catch (_) { sessionStorage = true; }
    try { localStorage  = !!window.localStorage;    } catch (_) { localStorage  = true; }
    openDatabase = !!window.openDatabase;
    return { sessionStorage, localStorage, openDatabase };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 22 [Early/Critical] — Cookie Support
// ---------------------------------------------------------------------------
function collectCookieSupport() {
  return collectSignal('cookieSupport', () => {
    try {
      document.cookie = 'fptest=1; SameSite=Strict;';
      const supported = document.cookie.indexOf('fptest=') !== -1;
      document.cookie = 'fptest=1; SameSite=Strict; expires=Thu, 01-Jan-1970 00:00:01 GMT';
      return supported;
    } catch (_) {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 23 [Early/Critical] — Hardware Concurrency + Device Memory
// ---------------------------------------------------------------------------
function collectHardwareInfo() {
  return collectSignal('hardwareInfo', () => ({
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory:        navigator.deviceMemory
  }));
}

// ---------------------------------------------------------------------------
// SIGNAL 24 [Early/Critical] — Touch Support
// ---------------------------------------------------------------------------
function collectTouchSupport() {
  return collectSignal('touchSupport', () => {
    const nav = navigator;
    let maxTouchPoints = 0;
    if (nav.maxTouchPoints !== undefined) {
      maxTouchPoints = parseInt(nav.maxTouchPoints) || 0;
    } else if (nav.msMaxTouchPoints !== undefined) {
      maxTouchPoints = nav.msMaxTouchPoints;
    }
    let touchEvent = false;
    try { document.createEvent('TouchEvent'); touchEvent = true; } catch (_) {}
    return {
      maxTouchPoints,
      touchEvent,
      touchStart: 'ontouchstart' in window
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 25 [Early/Critical] — Connection Info
// ---------------------------------------------------------------------------
function collectConnectionInfo() {
  return collectSignal('connectionInfo', () => {
    const conn = navigator.connection;
    if (!conn) return null;
    return {
      type:             conn.type,
      effectiveType:    conn.effectiveType,
      downlink:         conn.downlink,
      rtt:              conn.rtt,
      saveData:         conn.saveData
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 26 [Early/Critical] — Network Online Status
// ---------------------------------------------------------------------------
function collectOnlineStatus() {
  return collectSignal('onlineStatus', () => Boolean(navigator.onLine));
}

// ---------------------------------------------------------------------------
// SIGNAL 27 [Standard] — CSS Media Features (merged, legacy)
// ---------------------------------------------------------------------------
// Keep old merged signal for backward-compat hashing; also expose individual signals
function collectMediaFeatures() {
  return collectSignal('mediaFeatures', () => {
    const mq = q => { try { return window.matchMedia(q).matches; } catch (_) { return undefined; } };

    let colorGamut;
    for (const g of ['rec2020', 'p3', 'srgb']) {
      if (mq(`(color-gamut: ${g})`)) { colorGamut = g; break; }
    }

    let monochrome;
    if (mq('(min-monochrome: 0)')) {
      for (let i = 0; i <= 100; i++) {
        if (mq(`(max-monochrome: ${i})`)) { monochrome = i; break; }
      }
    }

    let contrast;
    if      (mq('(prefers-contrast: no-preference)')) contrast = 0;
    else if (mq('(prefers-contrast: high)') || mq('(prefers-contrast: more)')) contrast = 1;
    else if (mq('(prefers-contrast: low)') || mq('(prefers-contrast: less)')) contrast = -1;
    else if (mq('(prefers-contrast: forced)')) contrast = 10;

    return {
      prefersColorScheme:        mq('(prefers-color-scheme: dark)') ? 'dark' : mq('(prefers-color-scheme: light)') ? 'light' : undefined,
      prefersReducedMotion:      mq('(prefers-reduced-motion: reduce)') ? true : mq('(prefers-reduced-motion: no-preference)') ? false : undefined,
      prefersReducedTransparency: mq('(prefers-reduced-transparency: reduce)') ? true : mq('(prefers-reduced-transparency: no-preference)') ? false : undefined,
      invertedColors:            mq('(inverted-colors: inverted)') ? true : mq('(inverted-colors: none)') ? false : undefined,
      forcedColors:              mq('(forced-colors: active)') ? true : mq('(forced-colors: none)') ? false : undefined,
      hdr:                       mq('(dynamic-range: high)') ? true : mq('(dynamic-range: standard)') ? false : undefined,
      colorGamut,
      monochrome,
      contrast,
      devicePixelRatio2x:        mq('(-webkit-min-device-pixel-ratio: 2), (min-device-pixel-ratio: 2), (min-resolution: 192dpi)')
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 28 [Standard] — Prefers Color Scheme
// Source: xH() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectPrefersColorScheme() {
  return collectSignal('prefersColorScheme', () => {
    const mq = q => { try { return window.matchMedia(q).matches; } catch (_) { return null; } };
    if (mq('(prefers-color-scheme: dark)'))  return 'dark';
    if (mq('(prefers-color-scheme: light)')) return 'light';
    return null;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 29 [Standard] — Color Gamut (fp4 individual)
// ---------------------------------------------------------------------------
function collectColorGamut() {
  return collectSignal('colorGamut', () => {
    const mq = q => { try { return window.matchMedia(q).matches; } catch (_) { return false; } };
    for (const g of ['rec2020', 'p3', 'srgb']) {
      if (mq(`(color-gamut: ${g})`)) return g;
    }
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 30 [Standard] — Reduced Motion preference (fp4 individual)
// ---------------------------------------------------------------------------
function collectReducedMotion() {
  return collectSignal('reducedMotion', () => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
      if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 31 [Standard] — Contrast preference (fp4 individual)
// ---------------------------------------------------------------------------
function collectContrast() {
  return collectSignal('contrast', () => {
    const mq = q => { try { return window.matchMedia(q).matches; } catch (_) { return false; } };
    if (mq('(prefers-contrast: no-preference)')) return 0;
    if (mq('(prefers-contrast: high)') || mq('(prefers-contrast: more)')) return 1;
    if (mq('(prefers-contrast: low)') || mq('(prefers-contrast: less)')) return -1;
    if (mq('(prefers-contrast: forced)')) return 10;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 32 [Standard] — HDR display capability (fp4 individual)
// ---------------------------------------------------------------------------
function collectHdr() {
  return collectSignal('hdr', () => {
    try {
      if (window.matchMedia('(dynamic-range: high)').matches) return true;
      if (window.matchMedia('(dynamic-range: standard)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 33 [Standard] — Inverted Colors (fp4 individual)
// ---------------------------------------------------------------------------
function collectInvertedColors() {
  return collectSignal('invertedColors', () => {
    try {
      if (window.matchMedia('(inverted-colors: inverted)').matches) return true;
      if (window.matchMedia('(inverted-colors: none)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 34 [Standard] — Forced Colors (fp4 individual)
// ---------------------------------------------------------------------------
function collectForcedColors() {
  return collectSignal('forcedColors', () => {
    try {
      if (window.matchMedia('(forced-colors: active)').matches) return true;
      if (window.matchMedia('(forced-colors: none)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 35 [Standard] — Monochrome depth (fp4 individual)
// ---------------------------------------------------------------------------
function collectMonochrome() {
  return collectSignal('monochrome', () => {
    try {
      if (!window.matchMedia('(min-monochrome: 0)').matches) return undefined;
      for (let i = 0; i <= 100; i++) {
        if (window.matchMedia(`(max-monochrome: ${i})`).matches) return i;
      }
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 36 [Standard] — CSS System Colors (36 system colors)
// Source: Eq() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectSystemColors() {
  return collectSignal('systemColors', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const colors = {
      accentColor:          'AccentColor',
      accentColorText:      'AccentColorText',
      activeText:           'ActiveText',
      activeBorder:         'ActiveBorder',
      activeCaption:        'ActiveCaption',
      appWorkspace:         'AppWorkspace',
      background:           'Background',
      buttonHighlight:      'ButtonHighlight',
      buttonShadow:         'ButtonShadow',
      buttonBorder:         'ButtonBorder',
      buttonFace:           'ButtonFace',
      buttonText:           'ButtonText',
      fieldText:            'FieldText',
      grayText:             'GrayText',
      highlight:            'Highlight',
      highlightText:        'HighlightText',
      inactiveBorder:       'InactiveBorder',
      inactiveCaption:      'InactiveCaption',
      inactiveCaptionText:  'InactiveCaptionText',
      infoBackground:       'InfoBackground',
      infoText:             'InfoText',
      linkText:             'LinkText',
      mark:                 'Mark',
      menu:                 'Menu',
      scrollbar:            'Scrollbar',
      threeDDarkShadow:     'ThreeDDarkShadow',
      threeDFace:           'ThreeDFace',
      threeDHighlight:      'ThreeDHighlight',
      threeDLightShadow:    'ThreeDLightShadow',
      threeDShadow:         'ThreeDShadow',
      visitedText:          'VisitedText',
      window:               'Window',
      windowFrame:          'WindowFrame',
      windowText:           'WindowText',
      selectedItem:         'Selecteditem',
      selectedItemText:     'Selecteditemtext'
    };
    const result = {};
    for (const [key, cssColor] of Object.entries(colors)) {
      div.style.color = cssColor;
      result[key] = getComputedStyle(div).color;
    }
    document.body.removeChild(div);
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 37 [Standard] — CSS Feature Detection (computed style properties)
// Source: F() in fpjs.cdn.adgeist.ai.js
// Checks ≥4 CSS properties for support
// ---------------------------------------------------------------------------
function collectCssFeatures() {
  return collectSignal('cssFeatures', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const style = div.style;
    const features = [
      ['backdropFilter',       'blur(2px)'],
      ['clipPath',             'polygon(0 0)'],
      ['containerType',        'inline-size'],
      ['cssFloat',             'left'],
      ['fontFeatureSettings',  '"liga" 1'],
      ['gap',                  '10px'],
      ['mask',                 'none'],
      ['overscrollBehavior',   'none'],
      ['scrollSnapType',       'x mandatory'],
      ['textDecorationThickness', '1px'],
      ['textUnderlineOffset',  '2px'],
      ['transformStyle',       'preserve-3d']
    ];
    const result = {};
    for (const [prop, val] of features) {
      try {
        style[prop] = val;
        result[prop] = style[prop] !== '' && style[prop] !== undefined;
        style[prop] = '';
      } catch (_) {
        result[prop] = false;
      }
    }
    document.body.removeChild(div);
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 38 [Standard] — CSS Supports: backdrop-filter
// Source: nA() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectCssBackdropFilter() {
  return collectSignal('cssBackdropFilter', () => {
    if (typeof CSS === 'undefined') return null;
    return CSS.supports('backdrop-filter', 'blur(2px)');
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 39 [Standard] — Plugins
// ---------------------------------------------------------------------------
function collectPlugins() {
  return collectSignal('plugins', () => {
    const plugins = navigator.plugins;
    if (!plugins) return null;
    const result = [];
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins[i];
      if (!p) continue;
      const mimeTypes = [];
      for (let j = 0; j < p.length; j++) {
        mimeTypes.push({ type: p[j].type, suffixes: p[j].suffixes });
      }
      result.push({ name: p.name, description: p.description, mimeTypes });
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 40 [Standard] — plugins.length
// Source: nW in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectPluginsLength() {
  return collectSignal('pluginsLength', () => {
    if (navigator.plugins === undefined) return null;
    if (navigator.plugins.length === undefined) return null;
    return navigator.plugins.length;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 41 [Standard] — MimeTypes Count
// ---------------------------------------------------------------------------
function collectMimeTypesCount() {
  return collectSignal('mimeTypesCount', () => {
    if (navigator.mimeTypes === undefined) return null;
    if (navigator.mimeTypes.length === undefined) return null;
    return navigator.mimeTypes.length;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 42 [Standard] — MimeType Prototype Check
// Source: kW / Gl in fpjs.cdn.adgeist.ai.js
// True = native browser mimeTypes; false = spoofed/headless
// ---------------------------------------------------------------------------
function collectMimeTypePrototype() {
  return collectSignal('mimeTypePrototype', () => {
    if (navigator.mimeTypes === undefined) return null;
    const mimeTypes = navigator.mimeTypes;
    let isNative = (typeof MimeTypeArray !== 'undefined') &&
                   Object.getPrototypeOf(mimeTypes) === MimeTypeArray.prototype;
    for (let i = 0; i < mimeTypes.length; i++) {
      if (isNative) {
        isNative = (typeof MimeType !== 'undefined') &&
                   Object.getPrototypeOf(mimeTypes[i]) === MimeType.prototype;
      }
    }
    return isNative;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 43 [Standard] — Plugin Prototype Check
// Source: TA() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectPluginPrototype() {
  return collectSignal('pluginPrototype', () => {
    if (navigator.plugins === undefined) return null;
    const { plugins } = navigator;
    let isNative = (typeof PluginArray !== 'undefined') &&
                   Object.getPrototypeOf(plugins) === PluginArray.prototype;
    for (let i = 0; i < plugins.length; i++) {
      if (isNative) {
        isNative = (typeof Plugin !== 'undefined') &&
                   Object.getPrototypeOf(plugins[i]) === Plugin.prototype;
      }
    }
    return isNative;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 44 [Standard] — PDF Viewer Enabled
// ---------------------------------------------------------------------------
function collectPdfViewerEnabled() {
  return collectSignal('pdfViewerEnabled', () => navigator.pdfViewerEnabled);
}

// ---------------------------------------------------------------------------
// SIGNAL 45 [Standard] — Apple Pay
// Returns: -1 not available, -2 insecure context error, -3 in cross-origin iframe, 0/1 result
// ---------------------------------------------------------------------------
function collectApplePay() {
  return collectSignal('applePay', () => {
    const APS = window.ApplePaySession;
    if (typeof APS?.canMakePayments !== 'function') return -1;
    // Cross-origin iframe check (fp4 hn())
    let inCrossOriginFrame = false;
    let w = window;
    while (true) {
      const p = w.parent;
      if (!p || p === w) break;
      try {
        if (p.location.origin !== w.location.origin) { inCrossOriginFrame = true; break; }
      } catch (e) {
        if (e instanceof Error && e.name === 'SecurityError') { inCrossOriginFrame = true; break; }
        throw e;
      }
      w = p;
    }
    if (inCrossOriginFrame) return -3;
    try {
      return APS.canMakePayments() ? 1 : 0;
    } catch (e) {
      if (e instanceof Error && e.name === 'InvalidAccessError' &&
          /\bfrom\b.*\binsecure\b/i.test(e.message)) return -2;
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 46 [Standard] — Private Click Measurement
// ---------------------------------------------------------------------------
function collectPrivateClickMeasurement() {
  return collectSignal('privateClickMeasurement', () => {
    const a = document.createElement('a');
    const val = a.attributionSourceId ?? a.attributionsourceid;
    return val === undefined ? undefined : String(val);
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 47 [Standard] — Canvas 2D Fingerprint (geometry + text — raw dataURL, matches fp4)
// ---------------------------------------------------------------------------
function collectCanvas2D() {
  return collectSignal('canvas2d', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.toDataURL)
      return { winding: null, geometry: 'unsupported', text: 'unsupported' };

    // Winding rule test (same as fp4)
    ctx.rect(0, 0, 10, 10);
    ctx.rect(2, 2, 6, 6);
    const winding = !ctx.isPointInPath(5, 5, 'evenodd');

    // --- Text canvas ---
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 240; textCanvas.height = 60;
    const tc = textCanvas.getContext('2d');
    tc.textBaseline = 'alphabetic';
    tc.fillStyle = '#f60'; tc.fillRect(100, 1, 62, 20);
    tc.fillStyle = '#069'; tc.font = '11pt "Times New Roman"';
    const emoji = `Cwm fjordbank gly ${String.fromCharCode(55357, 56835)}`;
    tc.fillText(emoji, 2, 15);
    tc.fillStyle = 'rgba(102, 204, 0, 0.2)'; tc.font = '18pt Arial';
    tc.fillText(emoji, 4, 45);
    // fp4 renders text canvas twice and checks stability
    const text1 = textCanvas.toDataURL();
    const text2 = textCanvas.toDataURL();
    if (text1 !== text2) return { winding, geometry: 'unstable', text: 'unstable' };

    // --- Geometry canvas ---
    const geoCanvas = document.createElement('canvas');
    geoCanvas.width = 122; geoCanvas.height = 110;
    const gc = geoCanvas.getContext('2d');
    gc.globalCompositeOperation = 'multiply';
    for (const [color, x, y] of [['#f2f', 40, 40], ['#2ff', 80, 40], ['#ff2', 60, 80]]) {
      gc.fillStyle = color; gc.beginPath();
      gc.arc(x, y, 40, 0, 2 * Math.PI, true); gc.closePath(); gc.fill();
    }
    gc.fillStyle = '#f9c';
    gc.arc(60, 60, 60, 0, 2 * Math.PI, true);
    gc.arc(60, 60, 20, 0, 2 * Math.PI, true);
    gc.fill('evenodd');

    // Return raw dataURLs (not pre-hashed) — hashing happens in visitorId pipeline
    return {
      winding,
      text: text1,
      geometry: geoCanvas.toDataURL(),
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 48 [Standard] — Canvas PRNG Test (seeded random pixels → pixel data hash)
// Source: p() in fpjs.cdn.adgeist.ai.js
// Uses xoshiro128** PRNG seeded from a fixed state to fill a canvas
// ---------------------------------------------------------------------------
function collectCanvasPrng() {
  return collectSignal('canvasPrng', () => {
    const SIZE = 50;
    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // xoshiro128** PRNG (same as Pro SDK's oU/ve)
    let a = 0x9e3779b9, b = 0x6c62272e, c = 0x14057b7e, d = 0xf767814f;
    function rand() {
      const t = b << 9;
      let r = 5 * a;
      r = 9 * ((r << 7) | (r >>> 25));
      d ^= a; b ^= c ^= a; a ^= d; c ^= t;
      d = (d << 11) | (d >>> 21);
      return (r >>> 0) / 4294967296;
    }

    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const r = Math.floor(rand() * 256);
        const g = Math.floor(rand() * 256);
        const bl = Math.floor(rand() * 256);
        ctx.fillStyle = `rgb(${r},${g},${bl})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
    return hashString(Array.from(imgData.data).join(','));
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 49 [Standard] — WebGL Basics (renderer strings, matches fp4 webGlBasics)
// ---------------------------------------------------------------------------

function collectWebGL() {
  return collectSignal('webGL', () => {
    const gl = _getWebGLContext();
    if (!gl) return -1;
    if (typeof gl.getParameter !== 'function') return -2;

    // fp4: Firefox (Sn()) hides debug renderer info
    const hideRenderer = _isGecko();
    const debugExt = hideRenderer ? null : gl.getExtension('WEBGL_debug_renderer_info');

    return {
      version:                (gl.getParameter(gl.VERSION) ?? '').toString(),
      vendor:                 (gl.getParameter(gl.VENDOR)  ?? '').toString(),
      vendorUnmasked:         debugExt ? (gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL)   ?? '').toString() : '',
      renderer:               (gl.getParameter(gl.RENDERER) ?? '').toString(),
      rendererUnmasked:       debugExt ? (gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) ?? '').toString() : '',
      shadingLanguageVersion: (gl.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? '').toString(),
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 50 [Standard] — WebGL Extensions (separate signal, matches fp4 webGlExtensions)
// ---------------------------------------------------------------------------


function collectWebGLExtensions() {
  return collectSignal('webGLExtensions', () => {
    const gl = _getWebGLContext();
    if (!gl) return -1;
    if (typeof gl.getParameter !== 'function') return -2;

    // Context attributes as key=value strings
    const attrs = gl.getContextAttributes() || {};
    const contextAttributes = Object.keys(attrs).map(k => `${k}=${attrs[k]}`);

    // Static GL parameters (from prototype keys that are valid enum names)
    const glKeys = Object.keys(gl.__proto__).filter(
      k => typeof k === 'string' && !/[^A-Z0-9_x]/.test(k)
    );
    const parameters = glKeys.map(k => {
      const v = gl[k];
      return `${k}=${v}${_WEBGL_PARAMS.has(v) ? '=' + gl.getParameter(v) : ''}`;
    }).sort();

    // Shader precisions
    const shaderPrecisions = [];
    for (const shaderType of ['FRAGMENT_SHADER', 'VERTEX_SHADER']) {
      for (const prec of ['LOW_FLOAT','MEDIUM_FLOAT','HIGH_FLOAT','LOW_INT','MEDIUM_INT','HIGH_INT']) {
        const r = gl.getShaderPrecisionFormat(gl[shaderType], gl[prec]);
        shaderPrecisions.push(`${shaderType}.${prec}=${r ? [r.rangeMin, r.rangeMax, r.precision].join(',') : ''}`);
      }
    }

    // Extensions
    const supportedExtensions = gl.getSupportedExtensions() || [];
    const unsupported = [];
    const extensionParameters = [];

    for (const ext of supportedExtensions) {
      // fp4 hides WEBGL_debug_renderer_info for Firefox; WEBGL_polygon_mode for Chrome/WebKit
      if (ext === 'WEBGL_debug_renderer_info' && _isGecko()) continue;
      if (ext === 'WEBGL_polygon_mode' && (_isChromium() || _isWebKit())) continue;
      const extObj = gl.getExtension(ext);
      if (!extObj) { unsupported.push(ext); continue; }
      const extKeys = Object.keys(extObj.__proto__).filter(
        k => typeof k === 'string' && !/[^A-Z0-9_x]/.test(k)
      );
      for (const k of extKeys) {
        const v = extObj[k];
        extensionParameters.push(`${k}=${v}${_WEBGL_EXT_PARAMS.has(v) ? '=' + gl.getParameter(v) : ''}`);
      }
    }
    extensionParameters.sort();

    return {
      contextAttributes,
      parameters,
      shaderPrecisions,
      extensions: supportedExtensions,
      extensionParameters,
      unsupportedExtensions: unsupported,
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 51 [Standard] — WebGL Canvas Hash (renders scene, hashes output)
// Source: mW() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWebGLCanvas() {
  return collectSignal('webGLCanvas', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;

    gl.clearColor(0, 0, 1, 1);
    const program = gl.createProgram();
    if (!program) return null;

    function addShader(type, src) {
      const shader = gl.createShader(35633 - type); // VERTEX_SHADER=35633, FRAGMENT_SHADER=35632
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    addShader(0, 'attribute vec2 p;uniform float t;void main(){float s=sin(t);float c=cos(t);gl_Position=vec4(p*mat2(c,s,-s,c),1,1);}');
    addShader(1, 'void main(){gl_FragColor=vec4(1,0,0,1);}');
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.enableVertexAttribArray(0);

    const tLoc = gl.getUniformLocation(program, 't');
    const buf  = gl.createBuffer();
    gl.bindBuffer(34962, buf);
    gl.bufferData(34962, new Float32Array([0, 1, -1, -1, 1, -1]), 35044);
    gl.vertexAttribPointer(0, 2, 5126, false, 0, 0);
    gl.clear(16384);
    gl.uniform1f(tLoc, 3.65);
    gl.drawArrays(4, 0, 3);

    return hashString(canvas.toDataURL());
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 52 [Standard] — Audio Fingerprint (OfflineAudioContext, matches fp4 J()/audio)
// ---------------------------------------------------------------------------
async function collectAudioFingerprint() {
  return collectSignal('audioFingerprint', async () => {
    // iOS 18 Safari + new Chromium-era guard (returns -4, same as fp4)
    if (_isWebKit() && _isChromiumNewEra() && _isIOS()) return -4;

    const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AudioCtx) return -2;

    // Old iOS WebKit (not desktop, not SVGGeometryElement) returns -1
    if (_isWebKit() && !_isDesktopWebKit()) {
      const n = window;
      const svgCheck = _countTrue([
        'DOMRectList' in n, 'RTCPeerConnectionIceEvent' in n,
        'SVGGeometryElement' in n, 'ontransitioncancel' in n,
      ]) >= 3;
      if (!svgCheck) return -1;
    }

    const ctx = new AudioCtx(1, 5000, 44100);

    const oscillator = ctx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value      = 40;
    compressor.ratio.value     = 12;
    compressor.attack.value    = 0;
    compressor.release.value   = 0.25;

    oscillator.connect(compressor);
    compressor.connect(ctx.destination);
    oscillator.start(0);

    // fp4 retry logic: handles 'suspended' state (mobile browsers throttle audio)
    const MAX_RETRIES   = 3;
    const RETRY_DELAY   = 500;
    const STATE_TIMEOUT = 500;
    const TOTAL_TIMEOUT = 5000;

    const result = await new Promise((resolve) => {
      let startTime = 0;
      let retries   = 0;
      let settled   = false;

      const settle = v => { if (!settled) { settled = true; resolve(v); } };
      const timedOut = () => settle(-3);

      ctx.oncomplete = event => {
        const data = event.renderedBuffer.getChannelData(0).subarray(4500);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += Math.abs(data[i]);
        settle(sum);
      };

      function tryStart() {
        try {
          const p = ctx.startRendering();
          if (p && typeof p.then === 'function') {
            p.then(undefined, () => {}); // suppress unhandled rejection
          }
          switch (ctx.state) {
            case 'running':
              startTime = Date.now();
              setTimeout(timedOut, Math.min(STATE_TIMEOUT, startTime + TOTAL_TIMEOUT - Date.now()));
              break;
            case 'suspended':
              // Don't retry if tab is hidden (matches fp4 document.hidden check)
              if (!document.hidden) retries++;
              if (retries >= MAX_RETRIES) { settle(-3); return; }
              setTimeout(tryStart, RETRY_DELAY);
              break;
          }
        } catch (e) {
          settle(e);
        }
      }
      tryStart();
    });

    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 53 [Standard] — Audio Context Latency
// ---------------------------------------------------------------------------
function collectAudioLatency() {
  return collectSignal('audioLatency', () => {
    if (!window.AudioContext) return -1;
    try {
      const latency = (new AudioContext()).baseLatency;
      if (latency == null)    return -1;
      if (!isFinite(latency)) return -3;
      return latency;
    } catch (_) {
      return -1;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 54 [Standard] — Font Detection (inside isolated iframe — matches fp4 xn.fonts)
// Running inside an iframe prevents page CSS from affecting baseline measurements.
// ---------------------------------------------------------------------------
async function collectFonts() {
  return collectSignal('fonts', () => _withIframe(async (iframe, win) => {
    const iDoc  = win.document;
    const iBody = iDoc.body;
    const TEST_CHAR  = 'mmMwWLliI0O&1';
    const BASELINES  = ['monospace', 'sans-serif', 'serif'];
    const FONT_LIST  = [
      'sans-serif-thin','ARNO PRO','Agency FB','Arabic Typesetting','Arial Unicode MS',
      'AvantGarde Bk BT','BankGothic Md BT','Batang','Bitstream Vera Sans Mono','Calibri',
      'Century','Century Gothic','Clarendon','EUROSTILE','Franklin Gothic','Futura Bk BT',
      'Futura Md BT','GOTHAM','Gill Sans','HELV','Haettenschweiler','Helvetica Neue',
      'Humanst521 BT','Leelawadee','Letter Gothic','Levenim MT','Lucida Bright','Lucida Sans',
      'Menlo','MS Mincho','MS Outlook','MS Reference Specialty','MS UI Gothic','MT Extra',
      'MYRIAD PRO','Marlett','Meiryo UI','Microsoft Uighur','Minion Pro','Monotype Corsiva',
      'PMingLiU','Pristina','SCRIPTINA','Segoe UI Light','Serifa','SimHei','Small Fonts',
      'Staccato222 BT','TRAJAN PRO','Univers CE 55 Medium','Vrinda','ZWAdobeF',
    ];

    iBody.style.fontSize = '48px';
    // fp4: on Chromium adjust zoom to counteract device pixel ratio scaling
    if (_isChromium()) iBody.style.zoom = String(1 / win.devicePixelRatio);
    else if (_isWebKit()) iBody.style.zoom = 'reset';

    const container = iDoc.createElement('div');
    container.style.setProperty('visibility', 'hidden', 'important');

    const makeSpan = (family) => {
      const s = iDoc.createElement('span');
      s.style.position = 'absolute'; s.style.top = '0'; s.style.left = '0';
      s.style.fontFamily = family;
      s.textContent = TEST_CHAR;
      container.appendChild(s);
      return s;
    };

    const baseSpans = BASELINES.map(f => makeSpan(f));
    const candidateSpans = {};
    for (const font of FONT_LIST) {
      candidateSpans[font] = BASELINES.map(base => makeSpan(`'${font}',${base}`));
    }

    iBody.appendChild(container);

    const baseW = {}, baseH = {};
    BASELINES.forEach((f, i) => {
      baseW[f] = baseSpans[i].offsetWidth;
      baseH[f] = baseSpans[i].offsetHeight;
    });

    const detected = FONT_LIST.filter(font =>
      BASELINES.some((base, i) =>
        candidateSpans[font][i].offsetWidth  !== baseW[base] ||
        candidateSpans[font][i].offsetHeight !== baseH[base]
      )
    );

    return detected;
  }, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'));
}

// ---------------------------------------------------------------------------
// SIGNAL 55 [Standard] — Font Preferences
// Measures rendered width for 7 font stacks — detects OS-level font rendering differences
// ---------------------------------------------------------------------------
async function collectFontPreferences() {
  return collectSignal('fontPreferences', () => _withIframe(async (iframe, win) => {
    const iDoc  = win.document;
    const iBody = iDoc.body;
    const FRAME_WIDTH = 4000;

    iBody.style.width                = `${FRAME_WIDTH}px`;
    iBody.style.webkitTextSizeAdjust = 'none';
    iBody.style.textSizeAdjust       = 'none';

    if (_isChromium()) iBody.style.zoom = String(1 / win.devicePixelRatio);
    else if (_isWebKit()) iBody.style.zoom = 'reset';

    // Filler div so line-wrap is consistent
    const filler = iDoc.createElement('div');
    filler.textContent = Array(Math.floor(FRAME_WIDTH / 20)).fill('word').join(' ');
    iBody.appendChild(filler);

    // Font stacks to measure (matches fp4 vn)
    const stacks = {
      default:  {},
      apple:    { font: '-apple-system-body' },
      serif:    { fontFamily: 'serif' },
      sans:     { fontFamily: 'sans-serif' },
      mono:     { fontFamily: 'monospace' },
      min:      { fontSize: '1px' },
      system:   { fontFamily: 'system-ui' },
    };
    const TEST_TEXT = 'mmMwWLliI0fiflO&1';

    const spans = {};
    for (const [name, styles] of Object.entries(stacks)) {
      const span = iDoc.createElement('span');
      span.textContent = TEST_TEXT;
      span.style.whiteSpace = 'nowrap';
      for (const [prop, val] of Object.entries(styles)) span.style[prop] = val;
      iBody.appendChild(iDoc.createElement('br'));
      iBody.appendChild(span);
      spans[name] = span;
    }

    const result = {};
    for (const [name, span] of Object.entries(spans)) {
      result[name] = span.getBoundingClientRect().width;
    }
    return result;
  }, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'));
}

// ---------------------------------------------------------------------------
// SIGNAL 56 [Standard] — Speech Synthesis Voices
// ---------------------------------------------------------------------------
async function collectSpeechVoices() {
  return collectSignal('speechVoices', () => new Promise(resolve => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== 'function') return resolve(null);

    const getVoices = () => synth.getVoices().map(v => ({
      name: v.name, lang: v.lang, local: v.localService, default: v.default
    }));

    const voices = getVoices();
    if (voices.length > 0) return resolve(voices);

    // Some browsers populate async
    let done = false;
    const onChanged = () => {
      if (done) return;
      const v = getVoices();
      if (v.length > 0) { done = true; resolve(v); }
    };
    synth.addEventListener('voiceschanged', onChanged);
    setTimeout(() => { if (!done) { done = true; resolve(getVoices()); } }, 600);
  }));
}

// ---------------------------------------------------------------------------
// SIGNAL 57 [Standard] — Math Fingerprint
// Computes 26 math operations that differ across FPU implementations (V8/SpiderMonkey/JSC)
// ---------------------------------------------------------------------------
function collectMathFingerprint() {
  return collectSignal('mathFingerprint', () => {
    const m = Math;
    const pow1e154 = 1e154;
    const asinhPf  = x => m.log(x + m.sqrt(x * x + 1));
    const atanhPf  = x => m.log((1 + x) / (1 - x)) / 2;
    const sinhPf   = x => m.exp(x) - 1 / m.exp(x) / 2;
    const coshPf   = x => (m.exp(x) + 1 / m.exp(x)) / 2;
    const tanhPf   = x => (m.exp(2 * x) - 1) / (m.exp(2 * x) + 1);
    const expm1Pf  = x => m.exp(x) - 1;
    const log1pPf  = x => m.log(1 + x);
    return {
      acos:        m.acos(0.12312423423423424),
      acosh:       m.acosh(1e308),
      acoshPf:     m.log(pow1e154 + m.sqrt(pow1e154 * pow1e154 - 1)),
      asin:        m.asin(0.12312423423423424),
      asinh:       m.asinh(1),
      asinhPf:     asinhPf(1),
      atanh:       m.atanh(0.5),
      atanhPf:     atanhPf(0.5),
      atan:        m.atan(0.5),
      sin:         m.sin(-1e300),
      sinh:        m.sinh(1),
      sinhPf:      sinhPf(1),
      cos:         m.cos(10.000000000123),
      cosh:        m.cosh(1),
      coshPf:      coshPf(1),
      tan:         m.tan(-1e300),
      tanh:        m.tanh(1),
      tanhPf:      tanhPf(1),
      exp:         m.exp(1),
      expm1:       m.expm1(1),
      expm1Pf:     expm1Pf(1),
      log1p:       m.log1p(10),
      log1pPf:     log1pPf(10),
      powPI:       m.pow(m.PI, -100)
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 58 [Standard] — Float32 NaN Byte (FPU implementation check)
// Source: hN in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectFloat32NanByte() {
  return collectSignal('float32NanByte', () => {
    const f32 = new Float32Array(1);
    const u8  = new Uint8Array(f32.buffer);
    f32[0] = Infinity;
    f32[0] = f32[0] - f32[0]; // NaN
    return u8[3];              // implementation-specific NaN byte
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 59 [Standard] — eval.toString() Length
// ---------------------------------------------------------------------------
function collectEvalLength() {
  return collectSignal('evalLength', () => eval.toString().length);
}

// ---------------------------------------------------------------------------
// SIGNAL 60 [Standard] — Error Stack Hash
// ---------------------------------------------------------------------------
function collectErrorTrace() {
  return collectSignal('errorTrace', () => {
    try {
      null[0](); // force an error
    } catch (e) {
      if (e instanceof Error && e.stack != null) return hashString(e.stack.toString());
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 61 [Standard] — Error Stack Trace Raw (unhashed)
// Source: GW in fpjs.cdn.adgeist.ai.js — same error, returns raw stack for format analysis
// ---------------------------------------------------------------------------
function collectErrorStackFormat() {
  return collectSignal('errorStackFormat', () => {
    try {
      null[0]();
    } catch (e) {
      if (e instanceof Error && e.stack != null) {
        // Detect format: V8 has "    at " lines; SpiderMonkey has "@"; JSC has "@"
        const s = e.stack;
        if (s.includes('    at '))  return 'v8';
        if (s.includes('@'))        return s.includes('\n@') ? 'spidermonkey' : 'jsc';
        return 'unknown';
      }
    }
    return null;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 62 [Standard] — Function.prototype.bind.toString()
// Source: yW / ul in fpjs.cdn.adgeist.ai.js
// "function bind() { [native code] }" = real browser; different = modified
// ---------------------------------------------------------------------------
function collectFunctionBindToString() {
  return collectSignal('functionBindToString', () => {
    if (typeof Function.prototype.bind !== 'function') return null;
    return Function.prototype.bind.toString();
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 63 [Standard] — Firefox .toSource() Support
// Source: $W() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectFirefoxToSource() {
  return collectSignal('firefoxToSource', () => {
    try {
      throw 'a';
    } catch (e) {
      try {
        e.toSource();
        return true;
      } catch (_) {
        return false;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 64 [Standard] — Math.random() PRNG Entropy Samples
// Source: LW() in fpjs.cdn.adgeist.ai.js
// Collects 6-block sample of Math.random() XOR'd pairs to distinguish V8 vs SpiderMonkey vs JSC
// ---------------------------------------------------------------------------
function collectPrngEntropy() {
  return collectSignal('prngEntropy', () => {
    const samples = [];
    let prev = Math.random();
    for (let i = 6 * 4096 - 1; i >= 0; i--) {
      if (i % 4096 === 0) {
        const curr = Math.random();
        samples.push(((prev - curr) * Math.pow(2, 31)) | 0);
        prev = curr;
      }
    }
    return samples;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 65 [Standard] — window.close.toString() (native function check)
// Source: P() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWindowCloseFn() {
  return collectSignal('windowCloseFn', () => {
    if (window.close === undefined) return null;
    return window.close.toString();
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 66 [Standard] — WebAssembly Feature Flags
// Source: gU() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWasmFeatures() {
  return collectSignal('wasmFeatures', () => {
    const validate = WebAssembly && WebAssembly.validate;
    if (!validate) return null;

    // WASM modules testing: SIMD, bulk-memory, multi-value, reference-types, exception-handling
    const baseHeader = [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10];
    const featureTests = [
      [9, 1, 7, 0, 65, 0, 253, 15, 26, 11, 0, 10, 4, 110, 97, 109, 101, 2, 3, 1, 0, 0],          // SIMD
      [240, 67, 0, 0, 0, 12, 1, 10, 0, 252, 2, 3, 1, 1, 0, 0, 110, 26, 11, 161, 10],              // Bulk memory
      [6, 1, 4, 0, 18, 0, 11, 0, 10, 4, 110, 97, 109, 101, 2, 3, 1, 0, 0],                        // Multi-value
      [8, 1, 6, 0, 65, 0, 192, 26, 11, 0, 10, 4, 110, 97, 109, 101, 2, 3, 1, 0, 0],               // Reference types
      [7, 1, 5, 0, 208, 112, 26, 11, 0, 10, 4, 110, 97, 109, 101, 2, 3, 1, 0, 0]                  // Exception handling
    ];

    const names = ['simd', 'bulkMemory', 'multiValue', 'referenceTypes', 'exceptionHandling'];
    const result = {};
    featureTests.forEach((test, i) => {
      try {
        result[names[i]] = validate(Uint8Array.of(...baseHeader, ...test));
      } catch (_) {
        result[names[i]] = false;
      }
    });
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 67 [Standard] — SourceBuffer / Media Source API Types
// Source: QW() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectSourceBufferTypes() {
  return collectSignal('sourceBufferTypes', () => [
    typeof SourceBuffer,
    typeof SourceBufferList
  ]);
}

// ---------------------------------------------------------------------------
// SIGNAL 68 [Standard] — SharedArrayBuffer Availability
// Source: AY() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectSharedArrayBuffer() {
  return collectSignal('sharedArrayBuffer', () => {
    if (typeof window.SharedArrayBuffer !== 'function') return false;
    const buf = new window.SharedArrayBuffer(1);
    return buf.byteLength !== undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 69 [Standard] — Secure Context
// ---------------------------------------------------------------------------
function collectSecureContext() {
  return collectSignal('secureContext', () => window.isSecureContext);
}

// ---------------------------------------------------------------------------
// SIGNAL 70 [Standard] — URL Protocol Detection
// Source: Bq() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectUrlProtocol() {
  return collectSignal('urlProtocol', () => new URL('C:/').protocol);
}

// ---------------------------------------------------------------------------
// SIGNAL 71 [Standard] — window.process (Electron / Node.js detection)
// Source: IW / El in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWindowProcess() {
  return collectSignal('windowProcess', () => {
    const proc = window.process;
    if (proc === undefined) return null;
    if (!proc || typeof proc !== 'object') return false;
    return {
      type:     proc.type,
      versions: proc.versions ? Object.keys(proc.versions) : null
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 72 [Standard] — window Location Origin
// Source: c() in fpjs.cdn.adgeist.ai.js
// Detects iframes via ancestorOrigins
// ---------------------------------------------------------------------------
function collectWindowOrigin() {
  return collectSignal('windowOrigin', () => {
    const loc  = window.location;
    const ancs = loc.ancestorOrigins;
    let ancestors = null;
    if (ancs) {
      ancestors = [];
      for (let i = 0; i < ancs.length; i++) ancestors.push(ancs[i]);
    }
    return {
      origin:    loc.origin    || null,
      ancestorOrigins: ancestors
    };
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 73 [Standard] — Document Root Attributes
// Source: BW / zl in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectDocumentRootAttributes() {
  return collectSignal('documentRootAttributes', () => {
    const root = document.documentElement;
    if (!root || typeof root.getAttributeNames !== 'function') return null;
    return root.getAttributeNames();
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 74 [Standard] — document.createElement property descriptor
// Source: $A() in fpjs.cdn.adgeist.ai.js
// Native browsers don't have 'writeable' in the descriptor (typo check)
// ---------------------------------------------------------------------------
function collectCreateElementDescriptor() {
  return collectSignal('createElementDescriptor', () => {
    const desc = Object.getOwnPropertyDescriptor(document, 'createElement');
    if (!desc) return null;
    return !('writeable' in desc);  // 'writeable' is intentional typo — browser quirk test
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 75 [Standard] — Notification Permission
// Source: aW / tl in fpjs.cdn.adgeist.ai.js
// Checks whether Notification.permission='denied' but permissions.query='prompt' (inconsistency)
// ---------------------------------------------------------------------------
async function collectNotificationPermission() {
  return collectSignal('notificationPermission', async () => {
    if (window.Notification === undefined) return null;
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return null;
    try {
      const status = await navigator.permissions.query({ name: 'notifications' });
      return {
        notificationPermission: window.Notification.permission,
        permissionsQueryState:  status.state,
        // Inconsistency (automation indicator)
        inconsistent: window.Notification.permission === 'denied' && status.state === 'prompt'
      };
    } catch (_) {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 76 [Standard] — DRM / Encrypted Media Extension Probe
// Source: Ve() / y() in fpjs.cdn.adgeist.ai.js
// Tests EME requestMediaKeySystemAccess for Widevine, PlayReady, FairPlay
// ---------------------------------------------------------------------------
async function collectDrmCapabilities() {
  return collectSignal('drmCapabilities', async () => {
    if (!navigator.requestMediaKeySystemAccess) return null;

    const configs = [{
      initDataTypes:    ['cenc'],
      audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }],
      videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }]
    }];

    const drms = [
      { name: 'widevine',  keySystem: 'com.widevine.alpha' },
      { name: 'playready', keySystem: 'com.microsoft.playready' },
      { name: 'fairplay',  keySystem: 'com.apple.fps' },
      { name: 'clearKey',  keySystem: 'org.w3.clearkey' }
    ];

    const result = {};
    for (const drm of drms) {
      try {
        const access = await navigator.requestMediaKeySystemAccess(drm.keySystem, configs);
        result[drm.name] = true;
        // Try to get vendor info if available
        const caps = access.getConfiguration();
        if (caps && caps.videoCapabilities) {
          result[drm.name + '_codec'] = caps.videoCapabilities[0].contentType;
        }
      } catch (_) {
        result[drm.name] = false;
      }
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 77 [Standard] — MathML Rendering
// Source: wN() in fpjs.cdn.adgeist.ai.js
// Renders a MathML expression and measures bounding rect width
// ---------------------------------------------------------------------------
function collectMathMLRendering() {
  return collectSignal('mathMLRendering', () => {
    try {
      const math = document.createElement('math');
      math.style.whiteSpace = 'nowrap';
      const mrow = document.createElement('mrow');
      const munder = document.createElement('munderover');
      const mmulti = document.createElement('mmultiscripts');
      const mo = document.createElement('mo');
      mo.textContent = '∏';
      mmulti.appendChild(mo);
      munder.appendChild(mmulti);
      mrow.appendChild(munder);
      math.appendChild(mrow);

      document.body.appendChild(math);
      const rect = math.getBoundingClientRect();
      document.body.removeChild(math);

      return { width: rect.width, height: rect.height };
    } catch (_) {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 78 [Standard] — iOS-specific Radio Input Font Family
// Source: PO() in fpjs.cdn.adgeist.ai.js
// On iOS, radio inputs have a distinct font-family that varies by iOS version
// ---------------------------------------------------------------------------
function collectIosRadioFont() {
  return collectSignal('iosRadioFont', () => {
    try {
      const input = document.createElement('input');
      input.type = 'radio';
      document.body.appendChild(input);
      const fontFamily = getComputedStyle(input).getPropertyValue('font-family');
      document.body.removeChild(input);
      return fontFamily || null;
    } catch (_) {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 79 [Standard] — navigator.webdriver
// Source: V() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectWebDriver() {
  return collectSignal('webDriver', () => {
    const wd = navigator.webdriver;
    if (wd === null)      return null;
    if (wd === undefined) return undefined;
    return wd;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 80 [Standard] — InputEvent.isTrusted check
// Source: cv() in fpjs.cdn.adgeist.ai.js
// In automation environments InputEvent constructor may return isTrusted=true incorrectly
// ---------------------------------------------------------------------------
function collectInputEventTrusted() {
  return collectSignal('inputEventTrusted', () => {
    const InputEventCtor = window.InputEvent;
    if (!InputEventCtor) return null;
    try {
      const evt = new InputEventCtor('');
      return { isTrusted: evt.isTrusted };
    } catch (_) {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 81 [Standard] — Automation Framework Detection (window globals)
// Source: _W / kl,al in fpjs.cdn.adgeist.ai.js
// Checks for known Selenium/Phantom/WebDriver/Electron/NightmareJS globals
// ---------------------------------------------------------------------------
function collectAutomationGlobals() {
  return collectSignal('automationGlobals', () => {
    const checks = {
      selenium:        ['_Selenium_IDE_Recorder', '_selenium', 'calledSelenium'],
      webdriver:       ['webdriver', '__webdriverFunc', '$cdc_asdjflasutopfhvcZLmcfl_'],
      phantomJs:       ['callPhantom', '_phantom'],
      nightmareJs:     ['__nightmare', 'nightmare'],
      cef:             ['RunPerfTest'],
      cefSharp:        ['CefSharp'],
      headlessChrome:  ['domAutomation', 'domAutomationController'],
      webdriverIo:     ['wdioElectron'],
      selenium2:       ['__lastWatirAlert', '__lastWatirConfirm']
    };
    const detected = {};
    for (const [name, keys] of Object.entries(checks)) {
      detected[name] = keys.some(k => {
        try { return k in window && window[k] !== undefined; } catch (_) { return false; }
      });
    }
    // document-level checks
    const docKeys = ['__selenium_evaluate', '__webdriver_evaluate', '__fxdriver_evaluate',
                     '__driver_evaluate', '__webdriver_script_fn', '__driver_unwrapped'];
    detected.seleniumDoc = docKeys.some(k => {
      try { return k in document; } catch (_) { return false; }
    });
    return detected;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 82 [Standard] — Automation Window Property Scan
// Source: tO() in fpjs.cdn.adgeist.ai.js
// Scans window property names for known bot/automation identifiers
// ---------------------------------------------------------------------------
function collectAutomationWindowScan() {
  return collectSignal('automationWindowScan', () => {
    const knownBotProps = new Set([
      '$chrome_asyncScriptInfo', '_WEBDRIVER_ELEM_CACHE', '__webdriver_script_func',
      '__webdriver_script_function', '__webDriver', '_phantom', 'callPhantom',
      '__nightmare', '_Selenium_IDE_Recorder', 'domAutomation', 'domAutomationController',
      'spawn', 'fmget_targets', 'geb', 'emit', 'awesomium', 'CefSharp', 'RunPerfTest'
    ]);
    const found = [];
    try {
      const allKeys = Object.getOwnPropertyNames(window);
      for (const key of allKeys) {
        if (knownBotProps.has(key)) found.push(key);
      }
    } catch (_) {}
    return found;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 83 [Standard] — objectToInspect (Browser DevTools open detection)
// Source: sO() in fpjs.cdn.adgeist.ai.js
// ---------------------------------------------------------------------------
function collectObjectToInspect() {
  return collectSignal('objectToInspect', () => {
    try {
      // If devtools has set objectToInspect, this won't throw
      // eslint-disable-next-line no-undef
      return typeof objectToInspect !== 'undefined';
    } catch (_) {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 84 [Standard] — Dom Blockers (full fp4 filter list, tested via iframe injection)
// Inserts elements into an isolated iframe so page CSS doesn't interfere.
// A filter-list "fires" when >60% of its selectors are hidden (offsetParent===null).
// ---------------------------------------------------------------------------
async function collectAdBlocker() {
  return collectSignal('adBlocker', async () => {
    // Only run on iOS/Android WebKit or non-Android (matches fp4 guard)
    if (!_isWebKit() && !_isAndroid()) return undefined;

    // Base64-decode helper (matches fp4 use of atob for obfuscated selectors)
    const d = atob;
    const filterLists = {
      abpIndo:              ['#Iklan-Melayang','#Kolom-Iklan-728','#SidebarIklan-wrapper','[title="ALIENBOLA" i]',d('I0JveC1CYW5uZXItYWRz')],
      abpvn:                ['.quangcao','#mobileCatfish',d('LmNsb3NlLWFkcw=='),'[id^="bn_bottom_fixed_"]','#pmadv'],
      adBlockFinland:       ['.mainostila',d('LnNwb25zb3JpdA=='),'.ylamainos',d('YVtocmVmKj0iL2NsaWNrdGhyZ2guYXNwPyJd'),d('YVtocmVmXj0iaHR0cHM6Ly9hcHAucmVhZHBlYWsuY29tL2FkcyJd')],
      adBlockPersian:       ['#navbar_notice_50','.kadr','TABLE[width="140px"]','#divAgahi',d('YVtocmVmXj0iaHR0cDovL2cxLnYuZndtcm0ubmV0L2FkLyJd')],
      adBlockWarningRemoval:['#adblock-honeypot','.adblocker-root','.wp_adblock_detect',d('LmhlYWRlci1ibG9ja2VkLWFk'),d('I2FkX2Jsb2NrZXI=')],
      adGuardAnnoyances:    ['.hs-sosyal','#cookieconsentdiv','div[class^="app_gdpr"]','.as-oil','[data-cypress="soft-push-notification-modal"]'],
      adGuardBase:          ['.BetterJsPopOverlay',d('I2FkXzMwMFgyNTA='),d('I2Jhbm5lcmZsb2F0MjI='),d('I2NhbXBhaWduLWJhbm5lcg=='),d('I0FkLUNvbnRlbnQ=')],
      adGuardChinese:       [d('LlppX2FkX2FfSA=='),d('YVtocmVmKj0iLmh0aGJldDM0LmNvbSJd'),'#widget-quan',d('YVtocmVmKj0iLzg0OTkyMDIwLnh5eiJd'),d('YVtocmVmKj0iLjE5NTZobC5jb20vIl0=')],
      adGuardFrench:        ['#pavePub',d('LmFkLWRlc2t0b3AtcmVjdGFuZ2xl'),'.mobile_adhesion','.widgetadv',d('LmFkc19iYW4=')],
      adGuardGerman:        ['aside[data-portal-id="leaderboard"]'],
      adGuardJapanese:      ['#kauli_yad_1',d('YVtocmVmXj0iaHR0cDovL2FkMi50cmFmZmljZ2F0ZS5uZXQvIl0='),d('Ll9wb3BJbl9pbmZpbml0ZV9hZA=='),d('LmFkZ29vZ2xl'),d('Ll9faXNib29zdFJldHVybkFk')],
      adGuardMobile:        [d('YW1wLWF1dG8tYWRz'),d('LmFtcF9hZA=='),'amp-embed[type="24smi"]','#mgid_iframe1',d('I2FkX2ludmlld19hcmVh')],
      adGuardRussian:       [d('YVtocmVmXj0iaHR0cHM6Ly9hZC5sZXRtZWFkcy5jb20vIl0='),d('LnJlY2xhbWE='),'div[id^="smi2adblock"]',d('ZGl2W2lkXj0iQWRGb3hfYmFubmVyXyJd'),'#psyduckpockeball'],
      adGuardSocial:        [d('YVtocmVmXj0iLy93d3cuc3R1bWJsZXVwb24uY29tL3N1Ym1pdD91cmw9Il0='),d('YVtocmVmXj0iLy90ZWxlZ3JhbS5tZS9zaGFyZS91cmw/Il0='),'.etsy-tweet','#inlineShare','.popup-social'],
      adGuardSpanishPortuguese:['#barraPublicidade','#Publicidade','#publiEspecial','#queTooltip','.cnt-publi'],
      adGuardTrackingProtection:['#qoo-counter',d('YVtocmVmXj0iaHR0cDovL2NsaWNrLmhvdGxvZy5ydS8iXQ=='),d('YVtocmVmXj0iaHR0cDovL2hpdGNvdW50ZXIucnUvdG9wL3N0YXQucGhwIl0='),d('YVtocmVmXj0iaHR0cDovL3RvcC5tYWlsLnJ1L2p1bXAiXQ=='),'#top100counter'],
      adGuardTurkish:       ['#backkapat',d('I3Jla2xhbWk='),d('YVtocmVmXj0iaHR0cDovL2Fkc2Vydi5vbnRlay5jb20udHIvIl0='),d('YVtocmVmXj0iaHR0cDovL2l6bGVuemkuY29tL2NhbXBhaWduLyJd'),d('YVtocmVmXj0iaHR0cDovL3d3dy5pbnN0YWxsYWRzLm5ldC8iXQ==')],
      bulgarian:            [d('dGQjZnJlZW5ldF90YWJsZV9hZHM='),'#ea_intext_div','.lapni-pop-over','#xenium_hot_offers'],
      easyList:             ['.yb-floorad',d('LndpZGdldF9wb19hZHNfd2lkZ2V0'),d('LnRyYWZmaWNqdW5reS1hZA=='),'.textad_headline',d('LnNwb25zb3JlZC10ZXh0LWxpbmtz')],
      easyListChina:        [d('LmFwcGd1aWRlLXdyYXBbb25jbGljayo9ImJjZWJvcy5jb20iXQ=='),d('LmZyb250cGFnZUFkdk0='),'#taotaole','#aafoot.top_box','.cfa_popup'],
      easyListCookie:       ['.ezmob-footer','.cc-CookieWarning','[data-cookie-number]',d('LmF3LWNvb2tpZS1iYW5uZXI='),'.sygnal24-gdpr-modal-wrap'],
      easyListCzechSlovak:  ['#onlajny-stickers',d('I3Jla2xhbW5pLWJveA=='),d('LnJla2xhbWEtbWVnYWJvYXJk'),'.sklik',d('W2lkXj0ic2tsaWtSZWtsYW1hIl0=')],
      easyListDutch:        [d('I2FkdmVydGVudGll'),d('I3ZpcEFkbWFya3RCYW5uZXJCbG9jaw=='),'.adstekst',d('YVtocmVmXj0iaHR0cHM6Ly94bHR1YmUubmwvY2xpY2svIl0='),'#semilo-lrectangle'],
      easyListGermany:      ['#SSpotIMPopSlider',d('LnNwb25zb3JsaW5rZ3J1ZW4='),d('I3dlcmJ1bmdza3k='),d('I3Jla2xhbWUtcmVjaHRzLW1pdHRl'),d('YVtocmVmXj0iaHR0cHM6Ly9iZDc0Mi5jb20vIl0=')],
      easyListItaly:        [d('LmJveF9hZHZfYW5udW5jaQ=='),'.sb-box-pubbliredazionale',d('YVtocmVmXj0iaHR0cDovL2FmZmlsaWF6aW9uaWFkcy5zbmFpLml0LyJd'),d('YVtocmVmXj0iaHR0cHM6Ly9hZHNlcnZlci5odG1sLml0LyJd'),d('YVtocmVmXj0iaHR0cHM6Ly9hZmZpbGlhemlvbmlhZHMuc25haS5pdC8iXQ==')],
      easyListLithuania:    [d('LnJla2xhbW9zX3RhcnBhcw=='),d('LnJla2xhbW9zX251b3JvZG9z'),d('aW1nW2FsdD0iUmVrbGFtaW5pcyBza3lkZWxpcyJd'),d('aW1nW2FsdD0iRGVkaWt1b3RpLmx0IHNlcnZlcmlhaSJd'),d('aW1nW2FsdD0iSG9zdGluZ2FzIFNlcnZlcmlhaS5sdCJd')],
      estonian:             [d('QVtocmVmKj0iaHR0cDovL3BheTRyZXN1bHRzMjQuZXUiXQ==')],
      fanboyAnnoyances:     ['#ac-lre-player','.navigate-to-top','#subscribe_popup','.newsletter_holder','#back-top'],
      fanboyAntiFacebook:   ['.util-bar-module-firefly-visible'],
      fanboyEnhancedTrackers:['.open.pushModal','#issuem-leaky-paywall-articles-zero-remaining-nag','#sovrn_container','div[class$="-hide"][zoompage-fontsize][style="display: block;"]','.BlockNag__Card'],
      fanboySocial:         ['#FollowUs','#meteored_share','#social_follow','.article-sharer','.community__social-desc'],
      frellwitSwedish:      [d('YVtocmVmKj0iY2FzaW5vcHJvLnNlIl1bdGFyZ2V0PSJfYmxhbmsiXQ=='),d('YVtocmVmKj0iZG9rdG9yLXNlLm9uZWxpbmsubWUiXQ=='),'article.category-samarbete',d('ZGl2LmhvbGlkQWRz'),'ul.adsmodern'],
      greekAdBlock:         [d('QVtocmVmKj0iYWRtYW4ub3RlbmV0LmdyL2NsaWNrPyJd'),d('QVtocmVmKj0iaHR0cDovL2F4aWFiYW5uZXJzLmV4b2R1cy5nci8iXQ=='),d('QVtocmVmKj0iaHR0cDovL2ludGVyYWN0aXZlLmZvcnRobmV0LmdyL2NsaWNrPyJd'),'DIV.agores300','TABLE.advright'],
      hungarian:            ['#cemp_doboz','.optimonk-iframe-container',d('LmFkX19tYWlu'),d('W2NsYXNzKj0iR29vZ2xlQWRzIl0='),'#hirdetesek_box'],
      iDontCareAboutCookies:['.alert-info[data-block-track*="CookieNotice"]','.ModuleTemplateCookieIndicator','.o--cookies--container','#cookies-policy-sticky','#stickyCookieBar'],
      icelandicAbp:         [d('QVtocmVmXj0iL2ZyYW1ld29yay9yZXNvdXJjZXMvZm9ybXMvYWRzLmFzcHgiXQ==')],
      latvian:              [d('YVtocmVmPSJodHRwOi8vd3d3LnNhbGlkemluaS5sdi8iXVtzdHlsZT0iZGlzcGxheTogYmxvY2s7IHdpZHRoOiAxMjBweDsgaGVpZ2h0OiA0MHB4OyBvdmVyZmxvdzogaGlkZGVuOyBwb3NpdGlvbjogcmVsYXRpdmU7Il0='),d('YVtocmVmPSJodHRwOi8vd3d3LnNhbGlkemluaS5sdi8iXVtzdHlsZT0iZGlzcGxheTogYmxvY2s7IHdpZHRoOiA4OHB4OyBoZWlnaHQ6IDMxcHg7IG92ZXJmbG93OiBoaWRkZW47IHBvc2l0aW9uOiByZWxhdGl2ZTsiXQ==')],
      listKr:               [d('YVtocmVmKj0iLy9hZC5wbGFuYnBsdXMuY28ua3IvIl0='),d('I2xpdmVyZUFkV3JhcHBlcg=='),d('YVtocmVmKj0iLy9hZHYuaW1hZHJlcC5jby5rci8iXQ=='),d('aW5zLmZhc3R2aWV3LWFk'),'.revenue_unit_item.dable'],
      listeAr:              [d('LmplbWluaUxCMUFk'),'.right-and-left-sponsers',d('YVtocmVmKj0iLmFmbGFtLmluZm8iXQ=='),d('YVtocmVmKj0iYm9vcmFxLm9yZyJd'),d('YVtocmVmKj0iZHViaXp6bGUuY29tL2FyLz91dG1fc291cmNlPSJd')],
      listeFr:              [d('YVtocmVmXj0iaHR0cDovL3Byb21vLnZhZG9yLmNvbS8iXQ=='),d('I2FkY29udGFpbmVyX3JlY2hlcmNoZQ=='),d('YVtocmVmKj0id2Vib3JhbWEuZnIvZmNnaS1iaW4vIl0='),'.site-pub-interstitiel','div[id^="crt-"][data-criteo-id]'],
      officialPolish:       ['#ceneo-placeholder-ceneo-12',d('W2hyZWZePSJodHRwczovL2FmZi5zZW5kaHViLnBsLyJd'),d('YVtocmVmXj0iaHR0cDovL2Fkdm1hbmFnZXIudGVjaGZ1bi5wbC9yZWRpcmVjdC8iXQ=='),d('YVtocmVmXj0iaHR0cDovL3d3dy50cml6ZXIucGwvP3V0bV9zb3VyY2UiXQ=='),d('ZGl2I3NrYXBpZWNfYWQ=')],
      ro:                   [d('YVtocmVmXj0iLy9hZmZ0cmsuYWx0ZXgucm8vQ291bnRlci9DbGljayJd'),d('YVtocmVmXj0iaHR0cHM6Ly9ibGFja2ZyaWRheXNhbGVzLnJvL3Ryay9zaG9wLyJd'),d('YVtocmVmXj0iaHR0cHM6Ly9ldmVudC4ycGVyZm9ybWFudC5jb20vZXZlbnRzL2NsaWNrIl0='),d('YVtocmVmXj0iaHR0cHM6Ly9sLnByb2ZpdHNoYXJlLnJvLyJd'),'a[href^="/url/"]'],
      ruAd:                 [d('YVtocmVmKj0iLy9mZWJyYXJlLnJ1LyJd'),d('YVtocmVmKj0iLy91dGltZy5ydS8iXQ=='),d('YVtocmVmKj0iOi8vY2hpa2lkaWtpLnJ1Il0='),'#pgeldiz','.yandex-rtb-block'],
      thaiAds:              ['a[href*=macau-uta-popup]',d('I2Fkcy1nb29nbGUtbWlkZGxlX3JlY3RhbmdsZS1ncm91cA=='),d('LmFkczMwMHM='),'.bumq','.img-kosana'],
      webAnnoyancesUltralist:['#mod-social-share-2','#social-tools',d('LmN0cGwtZnVsbGJhbm5lcg=='),'.zergnet-recommend','.yt.btn-link.btn-md.btn'],
    };

    // Collect all selectors flat, test visibility via iframe injection
    const allSelectors = [].concat(...Object.values(filterLists));

    return _withIframe(async (iframe, win) => {
      const iDoc  = win.document;
      const iBody = iDoc.body;

      // Create a wrapper + one div per selector, append to iframe
      const wrapper = iDoc.createElement('div');
      wrapper.style.setProperty('visibility', 'hidden', 'important');
      wrapper.style.setProperty('display', 'block', 'important');

      const elements = allSelectors.map(sel => {
        // Parse selector into tag + attrs/classes/ids (simplified from fp4 _())
        let el;
        try {
          const tagMatch = /^([a-z][a-z0-9]*)/i.exec(sel);
          el = iDoc.createElement(tagMatch ? tagMatch[1] : 'div');
          // Apply classes
          for (const cls of (sel.match(/\.([\\w-]+)/g) || [])) {
            el.className += ' ' + cls.slice(1);
          }
          // Apply id
          const idMatch = /#([\\w-]+)/.exec(sel);
          if (idMatch) el.id = idMatch[1];
        } catch (_) { el = iDoc.createElement('div'); }
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('display', 'block', 'important');
        const wrap = iDoc.createElement('div');
        wrap.style.setProperty('visibility', 'hidden', 'important');
        wrap.style.setProperty('display', 'block', 'important');
        wrap.appendChild(el);
        wrapper.appendChild(wrap);
        return el;
      });

      iBody.appendChild(wrapper);

      // A selector is "blocked" if the element has no offsetParent (display:none by ad blocker)
      const blocked = {};
      for (let i = 0; i < allSelectors.length; i++) {
        blocked[allSelectors[i]] = !elements[i].offsetParent;
      }

      // A filter list fires when >60% of its selectors are blocked
      const fired = [];
      for (const [name, sels] of Object.entries(filterLists)) {
        const hits = sels.filter(s => blocked[s]).length;
        if (hits > 0.6 * sels.length) fired.push(name);
      }
      fired.sort();
      return fired;
    });
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 85 [Standard] — window.external.toString() (IE/Edge fingerprint)
// ---------------------------------------------------------------------------
function collectWindowExternal() {
  return collectSignal('windowExternal', () => {
    if (window.external === undefined) return null;
    if (typeof window.external.toString !== 'function') return null;
    return window.external.toString();
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 86 [Extended/Pro] — Incognito / Private Browsing detection (StorageManager quota + FileSystem API)
// ---------------------------------------------------------------------------
async function collectIncognito() {
  return collectSignal('incognito', async () => {
    // Chrome/Edge private: StorageManager.estimate() quota is capped at ~120 MB
    try {
      const sm = navigator.storage;
      if (sm && typeof sm.estimate === 'function') {
        const est = await sm.estimate();
        if (typeof est.quota === 'number') {
          if (est.quota < 130 * 1024 * 1024) return true;  // <130 MB → private
          return false;
        }
      }
    } catch (_) {}
    // Safari private: requestFileSystem is disabled outright
    try {
      const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
      if (fs) {
        return await new Promise(resolve => {
          fs(window.TEMPORARY || 0, 1, () => resolve(false), () => resolve(true));
        });
      }
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 87 [Extended/Pro] — Reduced Transparency preference (separate from mediaFeatures)
// ---------------------------------------------------------------------------
function collectReducedTransparency() {
  return collectSignal('reducedTransparency', () => {
    try {
      if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches)       return true;
      if (window.matchMedia('(prefers-reduced-transparency: no-preference)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 88 [Extended/Pro] — Primary input hover capability (hover: hover / none)
// ---------------------------------------------------------------------------
function collectHoverNone() {
  return collectSignal('hoverNone', () => {
    try {
      if (window.matchMedia('(hover: none)').matches)  return true;   // touch-primary
      if (window.matchMedia('(hover: hover)').matches) return false;  // mouse-primary
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 89 [Extended/Pro] — Any input hover capability (any-hover: hover / none)
// ---------------------------------------------------------------------------
function collectAnyHoverNone() {
  return collectSignal('anyHoverNone', () => {
    try {
      if (window.matchMedia('(any-hover: none)').matches)  return true;
      if (window.matchMedia('(any-hover: hover)').matches) return false;
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 90 [Extended/Pro] — Primary pointer accuracy (pointer: coarse / fine / none)
// ---------------------------------------------------------------------------
function collectPointerCoarse() {
  return collectSignal('pointerCoarse', () => {
    try {
      if (window.matchMedia('(pointer: coarse)').matches) return 'coarse';
      if (window.matchMedia('(pointer: fine)').matches)   return 'fine';
      if (window.matchMedia('(pointer: none)').matches)   return 'none';
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 91 [Extended/Pro] — Any pointer accuracy (any-pointer: coarse / fine)
// ---------------------------------------------------------------------------
function collectAnyPointerCoarse() {
  return collectSignal('anyPointerCoarse', () => {
    try {
      if (window.matchMedia('(any-pointer: coarse)').matches) return 'coarse';
      if (window.matchMedia('(any-pointer: fine)').matches)   return 'fine';
    } catch (_) {}
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 92 [Extended/Pro] — StorageManager quota + usage estimate (persisted flag)
// ---------------------------------------------------------------------------
async function collectStorageEstimate() {
  return collectSignal('storageEstimate', async () => {
    try {
      const sm = navigator.storage;
      if (!sm || typeof sm.estimate !== 'function') return null;
      const est = await sm.estimate();
      let persisted;
      try { persisted = await sm.persisted(); } catch (_) {}
      return {
        quota:      est.quota,
        usage:      est.usage,
        persisted,
      };
    } catch (_) { return null; }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 93 [Extended/Pro] — Battery status (level, charging, chargingTime, dischargingTime)
// ---------------------------------------------------------------------------
async function collectBattery() {
  return collectSignal('battery', async () => {
    try {
      const getBattery = navigator.getBattery;
      if (typeof getBattery !== 'function') return null;
      const b = await getBattery.call(navigator);
      return {
        level:           b.level,
        charging:        b.charging,
        chargingTime:    b.chargingTime,
        dischargingTime: b.dischargingTime,
      };
    } catch (_) { return null; }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 94 [Extended/Pro] — Permissions API states (camera, microphone, geolocation, notifications, clipboard-read)
// ---------------------------------------------------------------------------
async function collectPermissions() {
  return collectSignal('permissions', async () => {
    const pm = navigator.permissions;
    if (!pm || typeof pm.query !== 'function') return null;
    const names = ['camera', 'microphone', 'geolocation', 'notifications', 'clipboard-read'];
    const result = {};
    await Promise.all(names.map(async name => {
      try {
        const s = await pm.query({ name });
        result[name] = s.state;
      } catch (_) {
        result[name] = 'error';
      }
    }));
    return result;
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 95 [Extended/Pro] — RTCPeerConnection local IP / subnet detection via ICE candidates
// ---------------------------------------------------------------------------
async function collectRtcPeerConnection() {
  return collectSignal('rtcPeerConnection', async () => {
    const RTC = window.RTCPeerConnection ||
                window.webkitRTCPeerConnection ||
                window.mozRTCPeerConnection;
    if (!RTC) return null;

    return new Promise(resolve => {
      const localIPs = new Set();
      let pc;
      const done = (val) => {
        try { if (pc) pc.close(); } catch (_) {}
        resolve(val);
      };
      const timeout = setTimeout(() => done(localIPs.size ? [...localIPs].sort() : null), 1000);

      try {
        pc = new RTC({ iceServers: [] });
        pc.createDataChannel('');
        pc.onicecandidate = e => {
          if (!e || !e.candidate) {
            clearTimeout(timeout);
            done(localIPs.size ? [...localIPs].sort() : null);
            return;
          }
          const ipMatch = /(?:^|\s)((?:\d{1,3}\.){3}\d{1,3})/.exec(e.candidate.candidate);
          if (ipMatch) localIPs.add(ipMatch[1]);
        };
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => { clearTimeout(timeout); done(null); });
      } catch (_) {
        clearTimeout(timeout);
        done(null);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 96 [Extended/Pro] — MediaDevices enumerate — count of audioinput / audiooutput / videoinput devices
// ---------------------------------------------------------------------------
async function collectMediaDevices() {
  return collectSignal('mediaDevices', async () => {
    try {
      const md = navigator.mediaDevices;
      if (!md || typeof md.enumerateDevices !== 'function') return null;
      const devices = await md.enumerateDevices();
      const counts = { audioinput: 0, audiooutput: 0, videoinput: 0 };
      for (const d of devices) {
        if (d.kind in counts) counts[d.kind]++;
      }
      return counts;
    } catch (_) { return null; }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 97 [Extended/Pro] — Browser scale factor / effective DPR via canvas pixel measurement
// ---------------------------------------------------------------------------
function collectBrowserScaleFactor() {
  return collectSignal('browserScaleFactor', () => {
    try {
      const nativeDpr = window.devicePixelRatio || 1;
      // Create a 1×1 canvas; if the browser applies extra scaling, the
      // back-buffer dimensions will differ from the CSS pixel dimensions.
      const canvas = document.createElement('canvas');
      canvas.style.width  = '1px';
      canvas.style.height = '1px';
      // On HiDPI screens the canvas backing store is dpr × the CSS size
      return Math.round(nativeDpr * 100) / 100;
    } catch (_) { return null; }
  });
}

// ---------------------------------------------------------------------------
// SIGNAL 98 [Extended/Pro] — API availability flags — Bluetooth, USB, Serial, XR, MIDI, Gamepad, PaymentRequest …
// ---------------------------------------------------------------------------
function collectApiAvailability() {
  return collectSignal('apiAvailability', () => {
    const n = window, nav = navigator;
    return {
      bluetooth:        'bluetooth' in nav,
      usb:              'usb' in nav,
      serial:           'serial' in nav,
      hid:              'hid' in nav,
      xr:               'xr' in nav,
      midi:             'requestMIDIAccess' in nav,
      gamepad:          'getGamepads' in nav,
      paymentRequest:   'PaymentRequest' in n,
      contactsAPI:      'contacts' in nav,
      webShare:         'share' in nav,
      fileSystemAccess: 'showOpenFilePicker' in n,
      speechRecognition:'SpeechRecognition' in n || 'webkitSpeechRecognition' in n,
      eyeDropper:       'EyeDropper' in n,
      screenWakeLock:   'wakeLock' in nav,
      virtualKeyboard:  'virtualKeyboard' in nav,
    };
  });
}

// ===========================================================================
// MAIN COLLECTOR — Runs all 98 signals, then generates client-side visitorId
// ===========================================================================
async function collectAllSignals() {
  console.group('[FingerprintSignals] Starting signal collection…');
  const start = performance.now();

  const results = await Promise.all([
    // ── Early/Critical: Navigator / Browser Identity ──────────────────────
    collectUserAgent(),                // 01 [Early/Critical]
    collectClientHints(),              // 02 [Early/Critical]
    collectPlatform(),                 // 03 [Early/Critical]
    collectNavigatorLanguage(),        // 04 [Early/Critical]
    collectLanguages(),                // 05 [Early/Critical]
    collectNavigatorExtras(),          // 06 [Early/Critical]
    collectAppVersion(),               // 07 [Early/Critical]
    collectProductSub(),               // 08 [Early/Critical]
    collectVendorInfo(),               // 09 [Early/Critical]
    collectNavigatorFunctionNames(),   // 10 [Early/Critical]
    collectNavigatorDescriptors(),     // 11 [Early/Critical]
    collectUaDataAvailable(),          // 12 [Early/Critical]

    // ── Early/Critical: Screen / Display ──────────────────────────────────
    collectScreenInfo(),               // 13 [Early/Critical]
    collectScreenFrame(),              // 14 [Early/Critical]
    collectWindowDimensions(),         // 15 [Early/Critical]
    collectHighDpi(),                  // 16 [Early/Critical]

    // ── Early/Critical: Time & Locale ─────────────────────────────────────
    collectTimezone(),                 // 17 [Early/Critical]
    collectPerformanceTimeOrigin(),    // 18 [Early/Critical]
    collectTimerPrecision(),           // 19 [Early/Critical]
    collectIntlLocale(),               // 20 [Early/Critical]

    // ── Early/Critical: Storage & Connectivity ────────────────────────────
    collectStorageAvailability(),      // 21 [Early/Critical]
    collectCookieSupport(),            // 22 [Early/Critical]
    collectHardwareInfo(),             // 23 [Early/Critical]
    collectTouchSupport(),             // 24 [Early/Critical]
    collectConnectionInfo(),           // 25 [Early/Critical]
    collectOnlineStatus(),             // 26 [Early/Critical]

    // ── Standard: CSS Media Features ──────────────────────────────────────
    collectMediaFeatures(),            // 27 [Standard] legacy merged
    collectPrefersColorScheme(),       // 28 [Standard]
    collectColorGamut(),               // 29 [Standard]
    collectReducedMotion(),            // 30 [Standard]
    collectContrast(),                 // 31 [Standard]
    collectHdr(),                      // 32 [Standard]
    collectInvertedColors(),           // 33 [Standard]
    collectForcedColors(),             // 34 [Standard]
    collectMonochrome(),               // 35 [Standard]

    // ── Standard: CSS / Rendering ─────────────────────────────────────────
    collectSystemColors(),             // 36 [Standard]
    collectCssFeatures(),              // 37 [Standard]
    collectCssBackdropFilter(),        // 38 [Standard]

    // ── Standard: Plugins / MIME ──────────────────────────────────────────
    collectPlugins(),                  // 39 [Standard]
    collectPluginsLength(),            // 40 [Standard]
    collectMimeTypesCount(),           // 41 [Standard]
    collectMimeTypePrototype(),        // 42 [Standard]
    collectPluginPrototype(),          // 43 [Standard]
    collectPdfViewerEnabled(),         // 44 [Standard]
    collectApplePay(),                 // 45 [Standard]
    collectPrivateClickMeasurement(),  // 46 [Standard]

    // ── Standard: Canvas / WebGL ──────────────────────────────────────────
    collectCanvas2D(),                 // 47 [Standard]
    collectCanvasPrng(),               // 48 [Standard]
    collectWebGL(),                    // 49 [Standard]
    collectWebGLExtensions(),          // 50 [Standard]
    collectWebGLCanvas(),              // 51 [Standard]

    // ── Standard: Audio ───────────────────────────────────────────────────
    collectAudioFingerprint(),         // 52 [Standard]
    collectAudioLatency(),             // 53 [Standard]

    // ── Standard: Fonts ───────────────────────────────────────────────────
    collectFonts(),                    // 54 [Standard]
    collectFontPreferences(),          // 55 [Standard]
    collectSpeechVoices(),             // 56 [Standard]

    // ── Standard: Math / FPU ──────────────────────────────────────────────
    collectMathFingerprint(),          // 57 [Standard]
    collectFloat32NanByte(),           // 58 [Standard]

    // ── Standard: JS Engine ───────────────────────────────────────────────
    collectEvalLength(),               // 59 [Standard]
    collectErrorTrace(),               // 60 [Standard]
    collectErrorStackFormat(),         // 61 [Standard]
    collectFunctionBindToString(),     // 62 [Standard]
    collectFirefoxToSource(),          // 63 [Standard]
    collectPrngEntropy(),              // 64 [Standard]
    collectWindowCloseFn(),            // 65 [Standard]

    // ── Standard: WebAssembly / APIs ──────────────────────────────────────
    collectWasmFeatures(),             // 66 [Standard]
    collectSourceBufferTypes(),        // 67 [Standard]
    collectSharedArrayBuffer(),        // 68 [Standard]
    collectSecureContext(),            // 69 [Standard]
    collectUrlProtocol(),              // 70 [Standard]
    collectWindowProcess(),            // 71 [Standard]
    collectWindowOrigin(),             // 72 [Standard]
    collectDocumentRootAttributes(),   // 73 [Standard]
    collectCreateElementDescriptor(),  // 74 [Standard]

    // ── Standard: Permissions / DRM / Rendering ───────────────────────────
    collectNotificationPermission(),   // 75 [Standard]
    collectDrmCapabilities(),          // 76 [Standard]
    collectMathMLRendering(),          // 77 [Standard]
    collectIosRadioFont(),             // 78 [Standard]

    // ── Standard: Bot / Automation Detection ──────────────────────────────
    collectWebDriver(),                // 79 [Standard]
    collectInputEventTrusted(),        // 80 [Standard]
    collectAutomationGlobals(),        // 81 [Standard]
    collectAutomationWindowScan(),     // 82 [Standard]
    collectObjectToInspect(),          // 83 [Standard]
    collectAdBlocker(),                // 84 [Standard]
    collectWindowExternal(),           // 85 [Standard]

    // ── Extended/Pro ──────────────────────────────────────────────────────
    collectIncognito(),                // 86 [Extended/Pro]
    collectReducedTransparency(),      // 87 [Extended/Pro]
    collectHoverNone(),                // 88 [Extended/Pro]
    collectAnyHoverNone(),             // 89 [Extended/Pro]
    collectPointerCoarse(),            // 90 [Extended/Pro]
    collectAnyPointerCoarse(),         // 91 [Extended/Pro]
    collectStorageEstimate(),          // 92 [Extended/Pro]
    collectBattery(),                  // 93 [Extended/Pro]
    collectPermissions(),              // 94 [Extended/Pro]
    collectRtcPeerConnection(),        // 95 [Extended/Pro]
    collectMediaDevices(),             // 96 [Extended/Pro]
    collectBrowserScaleFactor(),       // 97 [Extended/Pro]
    collectApiAvailability(),          // 98 [Extended/Pro]
  ]);

  const signals = {};
  for (const item of results) {
    if (item && item.label) signals[item.label] = item.value;
  }

  const duration = Math.round(performance.now() - start);
  console.log(`[FingerprintSignals] ✓ Collected ${results.length} signals in ${duration}ms`);
  console.log('[FingerprintSignals] Full signal map:', signals);
  console.groupEnd();

  // Fuzzy-match against stored profile or mint new ID
  const { visitorId, score, isNew, visits } = await matchOrCreateVisitor(signals);

  // Expose result on window for inspection / integration
  window.FingerprintSignals.lastResult = { signals, visitorId, score, isNew, visits };

  // Display in page if containers exist (added by index.html)
  const box = document.getElementById('clientVisitorBox');
  if (box) {
    const scoreLabel = score !== null ? ` <span class="score">(${(score*100).toFixed(1)}% match)</span>` : '';
    const badge      = isNew ? ' <span class="badge-new">NEW</span>' : ` <span class="badge-match">Visit #${visits}</span>`;
    box.innerHTML = `<span class="label">Client VisitorId (local)</span>${visitorId}${scoreLabel}${badge}`;
    box.className = 'status success';
    box.style.display = 'block';
  }

  return { signals, visitorId, score, isNew };
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', collectAllSignals);
} else {
  collectAllSignals();
}

// Also expose globally for manual use
window.FingerprintSignals = { collectAllSignals };
