Visitor ID System – Technical Documentation

## 1. Core Goal

> **Signals should be unique across sessions, but should NOT be unique across users.**

This is the central principle that governs every design decision in this system.

### What it means

A traditional hash-based fingerprint tries to be maximally unique — it combines every available signal into a single value and hopes it never changes. This breaks the moment _anything_ changes (browser update, incognito mode, a user resizing a window, an anti-fingerprint extension randomising canvas output).

Our goal is different. We want a **stable identifier for the same physical device across sessions**, not a perfect cryptographic fingerprint of a single browser state. Concretely:

| Scenario | Desired outcome |
|---|---|
| Same user, new browser session | Same visitor ID |
| Same user, incognito mode | Same visitor ID |
| Same user, Canvas Defender active | Same visitor ID |
| Same user, browser updated from Chrome 122 → 125 | Same visitor ID |
| Same user, changed from laptop to someone else's desktop | Different visitor ID |
| Different user on same device model | Different visitor ID (hardware signals separate them) |

The system achieves this by treating signals as _evidence_, not as a checksum. It asks: "Is this collection of signals close enough to the stored profile that they almost certainly came from the same device?" — not "Is this byte-for-byte identical?"

---

## 2. Why Not a Simple Hash?

The naive approach is:

```text
visitorId = SHA256(userAgent + screen.width + canvas + fonts + …)
```

This breaks because:

1. **Canvas fingerprints change under Canvas Defender** — the extension injects tiny noise into pixel reads. The hash changes completely even though it's the same device.
2. **User agents rotate** — Chrome auto-updates every 4–6 weeks and the UA string changes.
3. **Screen layout shifts** — external monitors connect/disconnect, browser windows resize.
4. **Browser flags change** — privacy settings, extensions, OS upgrades all flip signal values.
5. **Fonts drift** — OS font updates, new app installs add system fonts.
6. **Audio is rate-dependent on iOS/Android** — the OfflineAudioContext result shifts slightly under CPU load.

A hash-based ID would re-mint a new identity on almost every visit for users who have any privacy tooling, or even just auto-update their browser. That is the opposite of what we want.

---

## 3. Signals — What We Collect and Why

Signals are grouped by how stable and spoofable they are.

### Hardware-level signals (most stable, non-spoofable)

| Signal | What it captures | Why it's hard to fake |
|---|---|---|
| `audioFingerprint` | OfflineAudioContext DSP computation result | The audio pipeline runs on hardware DSP registers; the exact float value is determined by CPU architecture, OS audio stack, and driver version |
| `mathFingerprint` | Results of `Math.sin`, `Math.cos`, `Math.tan`, `Math.sqrt` at specific inputs | FPU trig table differences between Intel, ARM, and different microarchitectures produce reproducibly different float outputs |
| `float32NanByte` | Byte 0 of a Float32Array NaN | CPU byte-order of IEEE 754 Not-a-Number is architecture-specific |

### GPU / WebGL signals

| Signal | What it captures | Why it matters |
|---|---|---|
| `webGL` | Renderer string, vendor string (unmasked when available) | The GPU model and driver version are extremely stable per device |
| `webGLExtensions` | Full set of supported WebGL extensions, capability parameters | Extension availability is determined by GPU driver; the full parameter dump is unique per GPU/driver pair |
| `webGLCanvas` | SHA-256 hash of a rendered WebGL scene | GPU rasterization differences produce subtly different pixels per hardware |

### OS installed software

| Signal | What it captures |
|---|---|
| `fonts` | Set of installed fonts (tested via canvas measureText) — stored as sorted array, compared via Jaccard similarity |
| `fontPreferences` | Width of 7 different font stacks — captures OS text rendering engine differences |
| `speechVoices` | The list of TTS voices installed — highly OS/version specific |

### Browser engine identity

| Signal | What it captures |
|---|---|
| `evalLength` | `eval.toString().length` — differs between V8 (33), SpiderMonkey (37), JSC (34) |
| `errorStackFormat` | Stack trace format string — `"v8"`, `"spidermonkey"`, or `"jsc"` |
| `wasmFeatures` | Which WASM proposals are supported (SIMD, bulk-memory, reference-types, etc.) |
| `sourceBufferTypes` | What `typeof SourceBuffer` returns — differs per engine |

### Screen and display

| Signal | What it captures |
|---|---|
| `screenInfo` | Resolution (orientation-normalized), color depth, device pixel ratio |
| `screenFrame` | Window insets: taskbar height, dock width, notch size — captures display layout |
| `hardwareInfo` | `navigator.hardwareConcurrency` (CPU core count), `navigator.deviceMemory` tier |

### Canvas 2D (low weight — deliberately)

| Signal | What it captures | Why low weight |
|---|---|---|
| `canvas2d` | Raw `toDataURL()` of text + geometry renders | Canvas Defender and similar extensions randomize pixel values; given 3% weight so a poisoned canvas cannot destroy the ID |
| `canvasPrng` | Hash of pixel data from a seeded deterministic pixel pattern | Same as above |

### OS/locale

| Signal | What it captures |
|---|---|
| `timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `languages` | `navigator.languages` array |
| `intlLocale` | Full resolved locale string including calendar and collation |
| `platform` | `navigator.platform` with WebKit/iOS iPad correction |

### CSS media features

Each media feature is its own signal with low individual weight. Collectively they fingerprint the OS display preferences (dark mode, HDR, contrast, pointer type, etc.).

`colorGamut`, `contrast`, `reducedMotion`, `hdr`, `invertedColors`, `forcedColors`, `monochrome`, `reducedTransparency`

### Navigator / browser config

`vendorInfo`, `plugins`, `mimeTypesCount`, `touchSupport`, `navigatorFunctionNames`, `cssFeatures`, `mediaFeatures`

### Extended / environmental

`incognito`, `hoverNone`, `anyHoverNone`, `pointerCoarse`, `anyPointerCoarse`, `storageEstimate`, `permissions`, `rtcPeerConnection`, `mediaDevices`, `browserScaleFactor`, `apiAvailability`

---

## 4. Signal Weights — The Philosophy

Every signal is assigned a weight representing its contribution to the final similarity score. The values are **normalized at runtime** — the absolute values don't matter, only the ratios. This means adding a new low-weight signal never changes the effective weight of existing high-weight signals.

### Weight assignment rules

```
HIGH weight (0.05–0.12)  → hardware-rooted, non-spoofable, highly stable
  audioFingerprint  0.12
  mathFingerprint   0.10
  fonts             0.09
  webGL             0.06
  webGLExtensions   0.06
  timezone          0.05

MEDIUM weight (0.02–0.04) → stable but potentially affected by updates
  fontPreferences   0.04
  evalLength        0.04
  wasmFeatures      0.04
  hardwareInfo      0.04
  screenInfo        0.04
  webGLCanvas       0.05
  errorStackFormat  0.03
  speechVoices      0.03
  platform          0.03
  languages         0.03
  rtcPeerConnection 0.03
  incognito         0.04

LOW weight (0.01–0.02)   → useful signal but spoofable or volatile
  canvas2d          0.03  (deliberately low — Canvas Defender)
  canvasPrng        0.02  (deliberately low)
  all CSS media     0.01–0.02 each
  navigator fields  0.01–0.02 each
```

### The key design principle

A single anti-fingerprint extension that tampers with one signal category should produce at most a **3–5% score reduction**, never enough to fall below the 75% threshold alone.

Example: Canvas Defender zeros out canvas2d (0.03 normalized ≈ 3%) and canvasPrng (0.02 ≈ 2%). Total loss ≈ 5%. Score goes from 100% → 95%. Far above threshold.

---

## 5. The 11 Hardened Keys — Why These, Not Others

The `HARDENED_KEYS` list is used **only for minting a new visitor ID** (not for matching). When a first-time visitor arrives, we need to generate an ID that is:

1. **Deterministic** — two visits from the same device at different times must produce the same ID
2. **Stable** — immune to session state, incognito, browser config changes
3. **Unique** — different hardware must produce different IDs

```javascript
const HARDENED_KEYS = [
  'audioFingerprint',  // CPU/hardware DSP
  'mathFingerprint',   // CPU FPU
  'float32NanByte',    // CPU byte-order
  'evalLength',        // JS engine version
  'errorStackFormat',  // JS engine type
  'wasmFeatures',      // browser capabilities
  'platform',          // OS/device type
  'hardwareInfo',      // CPU cores + memory
  'timezone',          // OS timezone config
  'webGL',             // GPU identity
  'fonts',             // OS installed fonts
];
```

### Why each key was chosen

| Key | Reason for inclusion |
|---|---|
| `audioFingerprint` | Most hardware-specific signal available to JS; determined by CPU DSP |
| `mathFingerprint` | Second-most hardware-specific; FPU trig tables differ per CPU microarchitecture |
| `float32NanByte` | CPU byte-order; completely immutable per CPU architecture |
| `evalLength` | JS engine identity; changes only on major engine switch (V8 vs JSC vs SpiderMonkey) |
| `errorStackFormat` | JS engine family; ultra-stable once browser is chosen |
| `wasmFeatures` | Browser capability fingerprint; changes only on major browser version jumps |
| `platform` | OS/device type; `"Win32"`, `"MacIntel"`, `"iPhone"` — stable per device |
| `hardwareInfo` | CPU core count + memory tier; fixed hardware properties |
| `timezone` | OS timezone configuration; stable for most users |
| `webGL` | GPU model and driver; most stable hardware identifier after CPU signals |
| `fonts` | Installed font set; highly unique per OS install and user preferences |

### Why other signals were excluded from hardening

| Signal | Why excluded |
|---|---|
| `canvas2d` | Randomized by privacy extensions |
| `screenInfo` | Changes when resolution changes, external display connected/disconnected |
| `screenFrame` | Changes when window is resized, moved to different monitor |
| `languages` | User can change browser language settings |
| `plugins` | Change as extensions install/uninstall |
| `rtcPeerConnection` | Requires network; can be blocked by firewall or VPN |
| `incognito` | Changes between normal and private mode |
| `permissions` | User can change permissions any time |
| `storageEstimate` | Too volatile; quota can shift with OS disk pressure |
| CSS media features | User can toggle dark mode, accessibility settings |

The rule: a hardened signal must be essentially **immutable without a hardware change or OS reinstall**.

---

## 6. Why Fuzzy Matching?

Instead of requiring signals to match exactly, we compute a **weighted similarity score** from 0.0 to 1.0 and accept a match if the score is above the threshold.

### The problem fuzzy matching solves

Consider a real user across two sessions:

**Session 1 (first visit):**
- Chrome 124, canvas works normally, no extensions active
- Score vs stored: N/A (no stored profile)

**Session 2 (return visit, 3 weeks later):**
- Chrome 126 (auto-updated) — UA string different, evalLength possibly different
- Canvas Defender installed — canvas2d and canvasPrng are randomized
- User opened a new external monitor — screenFrame changed
- Dark mode toggled — reducedMotion, contrast changed

A hard hash would generate a completely new ID. Fuzzy matching sees:
- audioFingerprint: 1.00 (same CPU)
- mathFingerprint: 1.00 (same CPU)
- fonts: 0.97 (same fonts, Jaccard ≈ 0.97)
- webGL: 1.00 (same GPU)
- canvas2d: 0.33 (only winding matches, Canvas Defender randomized the rest)
- screenFrame: 0.00 (external monitor changed insets)
- reducedMotion: 0.00 (toggled)

Weighted sum: **~0.89** → above threshold → **same visitor** ✓

---

## 7. The Similarity Pipeline — Step by Step

```
                 ┌─────────────────────┐
  visit starts → │  collectAllSignals  │  ← ~50 signals collected in parallel
                 └────────┬────────────┘
                          │  { audioFingerprint: 124.83, fonts: [...], ... }
                          ▼
                 ┌─────────────────────┐
                 │  localStorage read  │  ← stored profile or null
                 └────────┬────────────┘
                          │
              ┌───────────┴───────────────┐
              │ stored profile exists?     │
              └────┬──────────────────────┘
                   │ YES                     NO
                   ▼                          ▼
     ┌─────────────────────────┐   ┌─────────────────────────┐
     │  computeSimilarityScore  │   │      mintVisitorId       │
     │  (weighted comparison)   │   │  (SHA-256 of hardened)   │
     └────────────┬─────────────┘   └────────────┬────────────┘
                  │ score ∈ [0,1]               │ new 32-char ID
                  ▼                              ▼
        score >= 0.75?        ┌─────────────────────────────┐
         YES → return        │  store new profile in        │
          stored ID          │  localStorage + return ID    │
                             └─────────────────────────────┘
         NO  → mint new ID
              + store new profile
```

### Weight normalization

Raw weights in `SIGNAL_WEIGHTS` don't need to sum to 1.0. At runtime:

```javascript
const rawTotal = sum of all configured weights;  // e.g. 1.47
normalizedWeight(key) = rawWeight(key) / rawTotal;
```

If a signal returns `null` (unavailable on this browser), it is **dropped from both numerator and denominator**. The remaining weights re-normalize automatically. This means a browser without WebGL doesn't get a 5% score penalty — those weights are distributed to the signals that did collect.

---

## 8. Per-Signal Similarity Functions

Rather than a single generic comparator, each signal has a purpose-built function:

| Signal | Method | Rationale |
|---|---|---|
| `audioFingerprint` | `< 0.01% relative difference → 1.0` | DSP results are deterministic per hardware; tiny differences absorb float precision variance |
| `mathFingerprint` | Per-key relative difference `< 1e-10 → match` | FPU trig is exactly deterministic; no tolerance needed beyond floating point epsilon |
| `fonts` | Jaccard similarity | Font sets grow over time (new installs), but the intersection remains large |
| `fontPreferences` | Per-stack width within ±1px | OS text rendering engine differences produce consistent widths |
| `speechVoices` | Jaccard over voice names | Voice lists expand with OS updates; intersection stays stable |
| `webGL` | Per-field exact match, averaged | GPU renderer/vendor strings are exact identifiers |
| `webGLExtensions` | Jaccard (extensions) + objectSimilarity (params) | Extensions and params are per-(GPU, driver) pair |
| `canvas2d` | Per-component exact match (winding + text + geometry) | Supports both raw dataURL and legacy hash formats |
| `plugins` | Jaccard over plugin names | Plugin sets can change; intersection remains |
| `languages` | Jaccard (flattened) | Language ordering can change; set membership is stable |
| `hardwareInfo` | Exact per-field | CPU cores and memory tier don't change |
| `screenInfo` | Exact per-field (res, colorDepth, DPR) | Screen properties are stable per device |
| `storageEstimate` | quota + persisted exact match → 1.0, else 0.5 | Quota differs private vs normal mode → partial credit |
| `rtcPeerConnection` | Jaccard over discovered IPs | Local subnet IPs rarely change |
| Everything else | Exact equality / JSON comparison | |

---

## 9. The 0.75 Threshold — How It Was Chosen

`MATCH_THRESHOLD = 0.75` means: if 75% or more of the weighted evidence matches, we consider it the same visitor.

### Why 0.75 and not something else?

**Too high (e.g. 0.95):**  
A single browser version update that shifts `evalLength` (weight ~4%), `wasmFeatures` (4%), and a CSS media feature (1%) would collectively lose ~9% → score 0.91 → below threshold → false new visitor created. Too strict.

**Too low (e.g. 0.50):**  
A user switching from Chrome to Firefox would retain most hardware signals (audio, math, GPU, fonts = ~40%) but lose all engine signals. Score ≈ 0.40 → below 0.50 → correctly identified as different profile. But if threshold were 0.40, they'd be merged. Too loose.

**0.75 is calibrated to:**
- Survive a full browser + extension flip (Canvas Defender + new UA + privacy mode adds up to ~20% loss max on non-hardware signals)
- Correctly reject a different user on a similar machine (different fonts, different GPU, different audio = ~40%+ different)
- Correctly reject the same user on a different device (hardware signals completely different = ~60%+ different)

### Signal loss budget at threshold 0.75

The maximum tolerable signal loss before a new ID is minted is **25%**. The highest-weight non-hardware signals (canvas, screen, languages, CSS media) combined weigh about 20–22%. So a user who has _all_ spoofable signals poisoned still survives the threshold.

---

## 10. Visitor ID Minting — Determinism vs Stability

Two IDs are returned:

### `visitorId` — the stable, fuzzy-matched ID
- The first time a visitor arrives: minted from hardened signals via SHA-256
- On return visits: the _stored_ ID is returned (not recomputed) if score ≥ 0.75
- Changes only when a profile is too different to match
- **This is the primary identity signal**

### `deterministicVisitorId` — always recomputed
- Every call to `get()` recomputes `SHA-256(stableSerialize(hardenedSignals)).slice(0, 32)`
- Useful for debugging: if this changes across visits, a hardened signal changed
- Useful for cross-device detection: two devices with the same hardware config will have the same deterministic ID (rare, but possible on corporate fleets)
- **Not recommended as the primary ID** — changes if any hardened signal drifts

### ID minting process

```javascript
const hardened = pick(signals, HARDENED_KEYS);
const serialized = stableSerialize(hardened);
//   stableSerialize:
//   - sorts all object keys alphabetically
//   - rounds numbers to 10 significant digits
//   - encodes null/undefined/NaN/Infinity as unique sentinels
//   → production of a canonical, insertion-order-independent string

const hex = SHA-256(serialized);  // via window.crypto.subtle
return hex.slice(0, 32);          // 32 hex chars = 128-bit ID
```

The `stableSerialize` function absorbs:
- **Key insertion order differences** — `{a:1,b:2}` and `{b:2,a:1}` produce identical strings
- **Float precision drift** — `1.0000000001` rounds to same value as `1.0` when under 10 sig figs
- **Type edge cases** — `NaN`, `Infinity`, `undefined` all have distinct deterministic representations

---

## 11. Storage — What Lives in localStorage

**Key:** `visitor_profile_v0_by_adgeist`

**Schema:**
```json
{
  "version": 1,
  "visitorId": "a3f8e2c1b7d4f9e0a1b2c3d4e5f60000",
  "signals": {
    "audioFingerprint": 124.8359375,
    "mathFingerprint": { "sin": -0.8011526357338304, "cos": 0.5984601690… },
    "fonts": ["Arial", "Georgia", "Helvetica Neue", …],
    "…": "…"
  },
  "firstSeen": 1713340800000,
  "lastSeen":  1713427200000,
  "visits": 3
}
```

**Only `SIGNAL_WEIGHTS` keys are stored** — raw signal values like `userAgent`, `clientHints`, `navigatorExtras` are collected for analysis but not persisted. This keeps the stored profile under ~50KB for typical font lists.

**Profile updates on match:** On each successful match (score ≥ 0.75), the stored signals are refreshed with the current readings and `lastSeen` + `visits` are updated. This allows the stored profile to drift naturally with the device (new fonts, GPU driver update) without triggering false new-visitor events.