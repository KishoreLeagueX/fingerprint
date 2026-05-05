# Server-Side Backend Implementation Plan
## Fingerprint Visitor Identification System


## 1. Overview

**Purpose:** Identify the same unique visitor across multiple client websites and browser sessions using a centralized fingerprint API.

**How It Works:**
- Client website A calls your API → receives visitor_id: `abc123...`
- Same user visits client website B → calls same API → receives **same** visitor_id: `abc123...`
- Works across browser restarts, different domains, and even after clearing local storage

**Target Metrics:**
- **Accuracy:** 95%+ identification rate across all browsers
- **Performance:** <50ms server response time
- **Coverage:** 100% browser compatibility (with fallback mechanisms)

---

## 2. System Architecture

### 2.1 Two-Method Identification Strategy

**Method 1: Third-Party Cookie (Primary)**
- 100% accurate visitor identification
- Works on ~40% of modern browsers (Chrome, Edge, older Firefox)
- Instant lookup with minimal server computation

**Method 2: Fuzzy Fingerprint Matching (Fallback)**
- 75-95% accurate visitor identification
- Works on 100% of browsers (Safari, Firefox, privacy-focused browsers)
- Requires signal comparison algorithm

### 2.2 Request Flow Decision Tree

```
Request Received (POST /api/identify)
    │
    ├─ Check for 3rd-party cookie (fp_visitor_id)
    │
    ├─ Cookie Present?
    │   │
    │   YES → Method 1: Cookie Identification
    │   │     ├─ Validate visitor_id format
    │   │     ├─ Update last_seen timestamp in database
    │   │     └─ Return { visitor_id, method: 'cookie', confidence: 1.0 }
    │   │
    │   NO  → Method 2: Fuzzy Fingerprint Matching
    │         ├─ Extract browser signals from request body
    │         ├─ Compute similarity scores vs stored profiles
    │         │
    │         ├─ Best match ≥ 75% threshold?
    │         │   │
    │         │   YES → Return existing visitor
    │         │   │     ├─ Update visitor profile with new signals
    │         │   │     ├─ Set 3rd-party cookie (for future requests)
    │         │   │     └─ Return { visitor_id, method: 'fuzzy', confidence: 0.75-1.0 }
    │         │   │
    │         │   NO  → Create new visitor
    │         │         ├─ Mint new visitor_id (32-char hash)
    │         │         ├─ Store visitor profile in database
    │         │         ├─ Set 3rd-party cookie (if browser allows)
    │         │         └─ Return { visitor_id, method: 'new', confidence: 1.0 }
```

---

## 3. Method 1: Third-Party Cookie Identification

### 3.1 How It Works

1. **First Visit:** When a new visitor is identified (via Method 2), set a persistent cookie
2. **Subsequent Visits:** Read the cookie value and instantly return the visitor_id
3. **Cross-Domain:** Cookie is set on dedicated API domain, readable across all client websites

### 3.2 Cookie Specifications

**Cookie Name:** `fp_visitor_id`  
**Cookie Value:** 32-character hexadecimal hash (e.g., `a1b2c3d4e5f6...`)  
**Duration:** 2 years (63,072,000 seconds)

**Required Cookie Attributes:**
```
Path=/
Max-Age=63072000
SameSite=None          ← CRITICAL for cross-site access
Secure                 ← Required when using SameSite=None
HttpOnly               ← Prevents JavaScript access (security)
```

### 3.3 Implementation Requirements

**Backend Tasks:**
1. On each `/api/identify` request, check for `fp_visitor_id` cookie
2. If cookie exists and valid:
   - Look up visitor in database
   - Update `last_seen` timestamp
   - Return visitor_id immediately
3. If cookie missing/invalid:
   - Proceed to Method 2 (fuzzy matching)
   - After identification, set the cookie in response

**Response Format (Cookie Match):**
```json
{
  "visitor_id": "a1b2c3d4e5f6...",
  "method": "cookie",
  "confidence": 1.0,
  "is_new": false
}
```

### 3.4 Advantages & Limitations

**Advantages:**
- ✅ 100% accuracy (no false positives/negatives)
- ✅ Instant response (<5ms)
- ✅ Minimal server resources
- ✅ Persistent across browser sessions

**Limitations:**
- ❌ Only ~40% browser coverage (Safari, Firefox block 3rd-party cookies by default)
- ❌ Users can manually delete cookies
- ❌ Incognito/Private mode bypasses cookies
- ❌ Privacy regulations (GDPR/CCPA) may require consent

---

## 4. Method 2: Fuzzy Fingerprint Matching

### 4.1 How It Works

When cookies are unavailable:
1. **Receive Signals:** Client sends 50+ browser fingerprint signals
2. **Compare Profiles:** Compute weighted similarity score against all stored visitor profiles
3. **Match or Create:**
   - Score ≥ 75% → Return existing visitor_id
   - Score < 75% → Create new visitor_id

### 4.2 Similarity Scoring Algorithm

**Core Concept:**  
Each signal has a pre-assigned weight based on its entropy and reliability. The final similarity score is a weighted average of individual signal similarities.

**Formula:**
```
Final Score = Σ(signal_similarity × signal_weight) / Σ(signal_weight)

Where:
- signal_similarity: 0.0 (no match) to 1.0 (exact match)
- signal_weight: Pre-assigned weight from table below
```

**Example Calculation:**
```
audioFingerprint:   0.95 × 0.12 = 0.114
webGL:              0.88 × 0.06 = 0.053
fonts:              1.00 × 0.09 = 0.090
...
─────────────────────────────────────
Final Score:        0.82 (82% match)
```

### 4.3 Matching Logic

**Pseudocode:**
```
function fuzzyMatchOrCreate(currentSignals):
    bestMatch = null
    bestScore = 0
    
    for each storedProfile in database:
        score = computeSimilarityScore(currentSignals, storedProfile.signals)
        
        if score > bestScore:
            bestScore = score
            bestMatch = storedProfile
    
    if bestScore >= 0.75:
        // Match found - same visitor
        updateProfile(bestMatch.visitor_id, currentSignals)
        setCookie(bestMatch.visitor_id)
        return {
            visitor_id: bestMatch.visitor_id,
            method: 'fuzzy',
            confidence: bestScore,
            is_new: false
        }
    else:
        // No match - new visitor
        newVisitorId = mintNewVisitorId(currentSignals)
        createProfile(newVisitorId, currentSignals)
        setCookie(newVisitorId)
        return {
            visitor_id: newVisitorId,
            method: 'new',
            confidence: 1.0,
            is_new: true
        }
```

### 4.4 Performance Optimization Strategies

#### Strategy A: Linear Scan (Simple Implementation)
**Use Case:** <100,000 total visitors  
**Complexity:** O(n) - scan all profiles  
**Response Time:** 10-50ms for 10k profiles

**Approach:**
- Load all visitor profiles from database
- Compare current signals against each profile
- Return best match above threshold

#### Strategy B: Indexed Matching (Optimized for Scale)
**Use Case:** 100k+ visitors  
**Complexity:** O(k) - k = candidates per index bucket (typically 1-10)  
**Response Time:** 5-15ms for 1M+ profiles

**Approach:**
- Create hash index from "hardened signals" (most stable signals)
- Use hash prefix to narrow down candidate profiles (e.g., first 4 chars → ~256 buckets)
- Only compare signals within matching bucket
- Significantly reduces comparison workload

**Recommended Index Keys:** audioFingerprint, mathFingerprint, webGL renderer, fonts hash

### 4.5 Response Format (Fuzzy Match)

**Existing Visitor Found:**
```json
{
  "visitor_id": "x9y8z7w6v5u4...",
  "method": "fuzzy",
  "confidence": 0.82,
  "is_new": false
}
```

**New Visitor Created:**
```json
{
  "visitor_id": "m3n2o1p9q8r7...",
  "method": "new",
  "confidence": 1.0,
  "is_new": true
}
```

### 4.6 Advantages & Limitations

**Advantages:**
- ✅ 100% browser coverage (works everywhere)
- ✅ No cookies required (privacy-friendly)
- ✅ Survives cookie deletion
- ✅ Can identify visitors across different browsers (same device)

**Limitations:**
- ❌ 75-95% accuracy (false positives/negatives possible)
- ❌ Higher CPU cost per request
- ❌ Requires storing large signal payloads
- ❌ Anti-fingerprinting tools can reduce accuracy

---

## 5. Signal Weights Reference

### 5.1 Complete Signal Weights Table

Each of the 50+ browser signals has a pre-assigned weight based on its entropy (uniqueness) and reliability (stability over time). Higher weights indicate more discriminative signals.

| Signal Name | Weight | Category | Notes |
|-------------|--------|----------|-------|
| audioFingerprint | 0.12 | High | Most stable and unique signal |
| mathFingerprint | 0.10 | High | CPU-specific floating-point operations |
| fonts | 0.09 | High | Font list varies by OS and installation |
| webGL | 0.06 | Medium | GPU renderer string |
| webGLExtensions | 0.06 | Medium | Supported WebGL extensions |
| webGLCanvas | 0.05 | Medium | Canvas rendering fingerprint |
| timezone | 0.05 | Medium | Timezone offset |
| fontPreferences | 0.04 | Medium | Font rendering preferences |
| evalLength | 0.04 | Medium | JavaScript eval function length |
| wasmFeatures | 0.04 | Medium | WebAssembly support |
| screenInfo | 0.04 | Medium | Screen resolution and color depth |
| hardwareInfo | 0.04 | Medium | CPU cores, memory |
| incognito | 0.04 | Medium | Incognito mode detection |
| speechVoices | 0.03 | Low | Available speech synthesis voices |
| float32NanByte | 0.03 | Low | Float32 NaN byte pattern |
| errorStackFormat | 0.03 | Low | JavaScript error stack format |
| screenFrame | 0.03 | Low | Screen frame size |
| canvas2d | 0.03 | Low | 2D canvas operations |
| languages | 0.03 | Low | Browser language preferences |
| platform | 0.03 | Low | OS platform |
| rtcPeerConnection | 0.03 | Low | WebRTC peer connection |
| sourceBufferTypes | 0.02 | Minimal | Media source buffer types |
| canvasPrng | 0.02 | Minimal | Canvas PRNG fingerprint |
| intlLocale | 0.02 | Minimal | Internationalization locale |
| colorGamut | 0.02 | Minimal | Color gamut support |
| contrast | 0.02 | Minimal | Contrast preference |
| vendorInfo | 0.02 | Minimal | Browser vendor info |
| plugins | 0.02 | Minimal | Browser plugins (deprecated) |
| storageEstimate | 0.02 | Minimal | Storage quota estimate |
| permissions | 0.02 | Minimal | API permissions |
| mediaDevices | 0.02 | Minimal | Media devices count |
| apiAvailability | 0.02 | Minimal | Browser API availability |
| *...and 20+ more signals* | 0.01 each | Minimal | Various browser features |

**Total Weight:** 1.0 (normalized)

### 5.2 Scoring Calculation

**Pseudocode:**

```pseudocode
function computeSimilarityScore(currentSignals, storedSignals):
    // Initialize accumulators
    weightedSum = 0
    totalWeight = 0
    
    // 1. Get all signal weights from table in section 5.1
    signalWeights = getAllSignalWeights()
    rawTotal = sum(all weights)
    
    // 2. Normalize weights to sum to 1.0
    for each signalWeight in signalWeights:
        normalizedWeight = signalWeight / rawTotal
    
    // 3. Process each signal
    for each (signalKey, normalizedWeight) in signalWeights:
        currentValue = currentSignals[signalKey]
        storedValue = storedSignals[signalKey]
        
        // Compute similarity score (0.0 to 1.0) for this signal
        similarityScore = computeSignalSimilarity(signalKey, currentValue, storedValue)
        
        // Skip if signal unavailable (e.g., WebGL blocked)
        if similarityScore is null:
            continue
        
        // Accumulate weighted score
        weightedSum += similarityScore × normalizedWeight
        totalWeight += normalizedWeight
    
    // 4. Calculate final score (re-normalized based on available signals)
    finalScore = totalWeight > 0 ? weightedSum / totalWeight : 0
    
    return finalScore
```

**Example Calculation:**

```
Signal                Current        Stored         Similarity  Weight  Contribution
─────────────────────────────────────────────────────────────────────────────────────
audioFingerprint      -99.1234       -99.1234       1.00        ×0.12   = 0.120
mathFingerprint       0x3f800000     0x3f800000     1.00        ×0.10   = 0.100
fonts                 [Arial,...]    [Arial,...]    0.95        ×0.09   = 0.086
webGL                 GTX 1080       GTX 1080       1.00        ×0.06   = 0.060
...                   ...            ...            ...         ...     ...
─────────────────────────────────────────────────────────────────────────────────────
TOTAL:                                                                  = 0.82

Final Score: 82% (above 75% threshold → MATCH)
```

### 5.3 Individual Signal Comparison Methods

Different signal types require different comparison algorithms:

| Signal Type | Comparison Method | Example |
|-------------|-------------------|---------|
| **Numeric** | Exact match or tolerance range | `audioFingerprint: abs(a - b) < 0.01` |
| **String** | Exact string match | `platform: a === b` |
| **Array** | Jaccard similarity (intersection/union) | `fonts: intersection(a,b).length / union(a,b).length` |
| **Object** | Recursive property comparison | `webGL: compare each property separately` |
| **Boolean** | Exact match | `incognito: a === b` |

---

## 6. Visitor ID Generation

### 6.1 ID Format Specification

**Format:** 32-character hexadecimal string  
**Example:** `a1b2c3d4e5f678901234567890abcdef`  
**Entropy:** 128 bits (2^128 possible values)

### 6.2 ID Generation Strategy

**Core Principle:**  
Use **only hardened signals** (hardware-based, impossible to spoof) to mint visitor IDs. This ensures IDs are stable across visits but unpredictable to attackers.

**Hardened Signals (Cannot be intercepted or randomized):**
- `audioFingerprint` - Audio DSP hardware fingerprint
- `mathFingerprint` - CPU floating-point unit operations
- `float32NanByte` - CPU byte-order of IEEE 754 NaN
- `evalLength` - JavaScript engine implementation
- `errorStackFormat` - Browser engine identifier
- `wasmFeatures` - WebAssembly support
- `platform` - Operating system
- `hardwareInfo` - CPU cores, device memory
- `timezone` - Geographic timezone
- `webGL` - GPU renderer string
- `fonts` - Installed system fonts

**Minting Algorithm (Pseudocode):**

```pseudocode
function mintVisitorId(allSignals, schemaVersion):
    // 1. Extract only hardened signals
    hardenedSignals = {}
    HARDENED_KEYS = ['audioFingerprint', 'mathFingerprint', 'float32NanByte',
                     'evalLength', 'errorStackFormat', 'wasmFeatures',
                     'platform', 'hardwareInfo', 'timezone', 'webGL', 'fonts']
    
    for key in HARDENED_KEYS:
        if allSignals[key] exists and is not null:
            hardenedSignals[key] = allSignals[key]
    
    // 2. Deterministic serialization (order-independent)
    serialized = stableSerialize(hardenedSignals)
    
    // 3. Include schema version to prevent cross-version collisions
    input = schemaVersion + ":" + serialized
    
    // 4. Hash using SHA-256
    hash = SHA256(input)
    
    // 5. Return first 32 characters (128 bits)
    visitorId = hash.substring(0, 32)
    
    return visitorId


// Deterministic serialization function
function stableSerialize(value):
    // Handle primitives
    if value is null:
        return '\x00null'
    if value is undefined:
        return '\x00undef'
    if value is boolean:
        return value ? '\x00T' : '\x00F'
    
    if value is number:
        if value is NaN:
            return '\x00NaN'
        if value is Infinity:
            return value > 0 ? '\x00+Inf' : '\x00-Inf'
        // Round to 10 significant digits to absorb float drift
        return 'n:' + roundToSignificantDigits(value, 10)
    
    if value is string:
        return 's:' + value
    
    if value is array:
        serializedItems = []
        for item in value:
            serializedItems.append(stableSerialize(item))
        return '[' + join(serializedItems, ',') + ']'
    
    if value is object:
        // CRITICAL: Sort keys to ensure deterministic order
        sortedKeys = sort(Object.keys(value))
        pairs = []
        for key in sortedKeys:
            pairs.append('"' + key + '":' + stableSerialize(value[key]))
        return '{' + join(pairs, ',') + '}'
    
    return toString(value)
```

**Schema Versioning (Critical for Avoiding Collisions):**

When hardened signals change (e.g., adding new signals or removing old ones), you **must** increment the schema version:

```
Version 1: Uses signals A, B, C → visitor_id minted from SHA256("v1:ABC")
Version 2: Uses signals A, B, D → visitor_id minted from SHA256("v2:ABD")
```

**Why versioning matters:**
- Without versioning, the same signal values in v1 and v2 would produce the same visitor_id
- With versioning, v1 and v2 IDs are guaranteed to be different (no collisions)
- Allows gradual migration: v1 users keep their IDs, new users get v2 IDs

**Example:**
```
Signals:
  audioFingerprint: -99.1234
  mathFingerprint: { sin: 0.841, cos: 0.540 }
  fonts: ["Arial", "Times", "Helvetica"]
  platform: "MacIntel"
  ...

Serialized (stable, deterministic):
  {
    "audioFingerprint": "n:-99.1234",
    "fonts": "['s:Arial','s:Helvetica','s:Times']",
    "mathFingerprint": "{'cos':'n:0.54','sin':'n:0.841'}",
    "platform": "s:MacIntel",
    ...
  }

Input to hash: "v1:{...serialized...}"
SHA-256 output: "a1b2c3d4e5f678901234567890abcdef3f4a5b6c..."
Visitor ID: "a1b2c3d4e5f678901234567890abcdef" (first 32 chars)
```

**Important Notes:**

1. **Never use timestamp or random values** - ID must be deterministic from hardened signals only
2. **Stable serialization is critical** - Object key order must be consistent (alphabetically sorted)
3. **Schema version prevents collisions** - Include version prefix when hashing
4. **Hardened signals can evolve** - When adding/removing signals, increment schema version
5. **IDs are updatable** - When schema changes, new visits generate new IDs (old IDs still valid for backward compatibility)

---

## 7. API Endpoint Specification

### 7.1 Endpoint: POST /api/identify

**Purpose:** Identify a visitor and return unique visitor_id

**Request Headers:**
```
Content-Type: application/json
Cookie: fp_visitor_id=<32-char-hash> (if previously set)
```

**Request Body:**
```json
{
  "signals": {
    "audioFingerprint": -99.1234,
    "mathFingerprint": "0x3f800000",
    "fonts": ["Arial", "Times New Roman", ...],
    "webGL": {
      "renderer": "ANGLE (NVIDIA GeForce GTX 1080)",
      "vendor": "Google Inc."
    },
    ...50+ more signals
  },
}
```

**Response (Success - 200 OK):**
```json
{
  "visitor_id": "a1b2c3d4e5f678901234567890abcdef",
  "method": "cookie" | "fuzzy" | "new",
  "confidence": 0.75-1.0,
  "is_new": false,
  "request_id": "req_xyz123"
}
```

**Response (Error - 400 Bad Request):**
```json
{
  "error": "invalid_signals",
  "message": "Missing required signal: audioFingerprint",
  "request_id": "req_xyz123"
}
```

**Response (Error - 429 Too Many Requests):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests from this IP",
  "retry_after": 60
}
```

### 7.2 Response Headers

**Set Cookie (when creating/updating visitor):**
```
Set-Cookie: fp_visitor_id=<32-char-hash>; Path=/; Max-Age=63072000; SameSite=None; Secure; HttpOnly
```

**Performance Headers:**
```
X-Response-Time: 23ms
X-Match-Method: fuzzy
X-Candidates-Checked: 47
```

---

## 8. Security & Performance Recommendations

### 8.1 Rate Limiting

**Purpose:** Prevent abuse and DoS attacks

**Strategy:**
- Limit by IP address: 100 requests per minute
- Limit by hardened hash: 10 requests per minute (prevents fingerprint brute-forcing)

**Implementation:**
- Use Redis or in-memory cache for counters
- Return 429 status code when limit exceeded
- Include `Retry-After` header

### 8.2 Bot & Fraud Detection

**Recommended Checks:**
1. **Headless Browser Detection:**
   - Check for missing signals (e.g., audio, fonts typically blocked)
   - Detect automation signals (webdriver flag, chrome automation)

2. **Virtual Machine Detection:**
   - Check GPU renderer strings (e.g., "VMware", "VirtualBox")
   - Detect unusual hardware configurations

3. **Suspicious Patterns:**
   - Same IP creating >100 new visitors in short time
   - Identical signals from different IPs (signal spoofing)
   - Abnormally fast request sequences

**Action:** Flag suspicious visitors but don't block (false positives hurt real users)

### 8.3 Data Privacy & Compliance

**GDPR/CCPA Considerations:**

1. **User Consent:**
   - If using third-party cookies → Requires explicit consent in EU
   - If using fingerprinting only → May not require consent (check local laws)

2. **Data Retention:**
   - Implement visitor profile deletion on request
   - Auto-delete inactive visitors after 2 years
   - Allow users to opt-out via Do Not Track (DNT)

3. **Data Anonymization:**
   - Don't store raw IP addresses (hash them)
   - Don't link visitor_id to PII without consent
   - Allow users to reset their visitor_id

**Endpoint for Deletion:**
```
DELETE /api/visitor/:visitor_id
```

---

## 9. Implementation Checklist

### Phase 1: Core Functionality
- Set up /api/identify endpoint
- Implement cookie-based identification (Method 1)
- Implement visitor_id generation
- Set up database schema for visitor profiles
- Implement basic signal storage

### Phase 2: Fuzzy Matching
- Implement signal similarity computation
- Implement weighted scoring algorithm
- Create fuzzy matching logic (linear scan for MVP)
- Test with sample fingerprint data

### Phase 3: Optimization
- Add hardened hash indexing
- Implement indexed matching strategy
- Set up Redis caching layer
- Optimize database queries

### Phase 4: Security & Monitoring
- Implement rate limiting (IP + hash-based)
- Add bot/fraud detection checks
- Set up performance monitoring
- Configure alerting thresholds

### Phase 5: Compliance & Maintenance
- Add visitor deletion endpoint
- Implement auto-archival for inactive visitors
- Document privacy policy implications
- Set up backup and disaster recovery

---