const el = id => document.getElementById(id);
const runBtn = el('runBtn');

function setStatus(prefix, text, state) {
  const s = el(prefix + '-status');
  s.textContent = text;
  s.className = 'rval ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'pending');
}

// 1. Fingerprint Pro
const proPromise = import('https://fpjscdn.net/v4/mTpKvCdu3TJkeq8LZgkV')
  .then(FP => { setStatus('pro', 'Loaded ✓', 'ok'); return FP.start({ region: 'ap' }); })
  .catch(err => { setStatus('pro', 'Failed: ' + err.message, 'err'); throw err; });

// 2. FingerprintJS Open Source v4
const ossPromise = import('https://openfpcdn.io/fingerprintjs/v4')
  .then(FP => { setStatus('oss', 'Loaded ✓', 'ok'); return FP.load(); })
  .catch(err => { setStatus('oss', 'Failed: ' + err.message, 'err'); throw err; });

// 3. Custom v0 (Fuzzy Match) — ES module with weighted similarity
const customV0Promise = import('./components/identifier/v0/visitorid.js')
  .then(FP => { setStatus('custom-v0', 'Loaded ✓', 'ok'); return FP.load(); })
  .catch(err => { setStatus('custom-v0', 'Failed: ' + err.message, 'err'); throw err; });

// 4. Custom v1 (Simple Hash) — ES module, deterministic only
const customV1Promise = import('./components/identifier/v1/visitorid.js')
  .then(FP => { setStatus('custom-v1', 'Loaded ✓', 'ok'); return FP.load(); })
  .catch(err => { setStatus('custom-v1', 'Failed: ' + err.message, 'err'); throw err; });

// ---------------------------------------------------------------------------
// PostHog: send fingerprint results on first load
// ---------------------------------------------------------------------------
function sendToPostHog(proVal, ossVal, customV0Val, customV1Val) {
  if (typeof posthog === 'undefined') return;

  // Use custom v0 visitorId as the stable distinct_id; fall back to v1 → Pro → OSS
  const distinctId = customV0Val?.visitorId || customV1Val?.visitorId || proVal?.visitorId || ossVal?.visitorId;
  if (distinctId) posthog.identify(distinctId);

  const properties = {
    user_id: 1,
    publisher_name: 'https://www.adgeist.ai', 
    pro_visitor_id: proVal?.visitorId  ?? proVal?.visitor_id  ?? null,
    oss_visitor_id: ossVal?.visitorId ?? null,
    custom_v0_visitor_id: customV0Val?.visitorId ?? null,
    custom_v1_visitor_id: customV1Val?.visitorId ?? null,

    custom_v0_details: customV0Val ? {
        visitorId:    customV0Val.visitorId,
        isNew:        customV0Val.isNew,
        visits:       customV0Val.visits,
        signals:      customV0Val.signals,
        ...(customV0Val.similarityScore ? { similarityScore: customV0Val.similarityScore } : null)
    } : null,

    custom_v1_details: customV1Val ? {
        visitorId:    customV1Val.visitorId,
        version:      customV1Val.version,
        signals:      customV1Val.signals
    } : null
  };

  posthog.capture('fingerprinting', properties);
}

// ---------------------------------------------------------------------------
// Shared benchmark runner — used by auto-run on load AND by the button
// ---------------------------------------------------------------------------
async function runBenchmark() {
  runBtn.disabled = true;
  runBtn.textContent = 'Running…';

  async function run(promise, getResult) {
    try { return await getResult(await promise); }
    catch { return null; }
  }

  const [proResult, ossResult, customV0Result, customV1Result] = await Promise.allSettled([
    run(proPromise, fp => fp.get()),
    run(ossPromise, fp => fp.get()),
    run(customV0Promise, agent => agent.get()),
    run(customV1Promise, agent => agent.get()),
  ]);

  const proVal      = proResult.status      === 'fulfilled' ? proResult.value      : null;
  const ossVal      = ossResult.status      === 'fulfilled' ? ossResult.value      : null;
  const customV0Val = customV0Result.status === 'fulfilled' ? customV0Result.value : null;
  const customV1Val = customV1Result.status === 'fulfilled' ? customV1Result.value : null;

  // Display Pro
  if (proVal) {
    el('pro-visitor').textContent = proVal.visitorId || proVal.visitor_id || '—';
    el('pro-visitor').className = 'rval ok';
    el('pro-event').textContent = proVal.requestId || proVal.event_id || '—';
    el('pro-event').className = 'rval ok';
    // console.log('[Pro]', proVal);
  } else {
    el('pro-visitor').textContent = 'Error';
    el('pro-visitor').className = 'rval err';
  }

  // Display OSS
  if (ossVal) {
    el('oss-visitor').textContent = ossVal.visitorId || '—';
    el('oss-visitor').className = 'rval ok';
    const compCount = ossVal.components ? Object.keys(ossVal.components).length : 0;
    el('oss-components').textContent = compCount + ' signals collected';
    el('oss-components').className = 'rval ok';
    // console.log('[OSS]', ossVal);
  } else {
    el('oss-visitor').textContent = 'Error';
    el('oss-visitor').className = 'rval err';
  }

  // Display Custom v0
  if (customV0Val) {
    el('custom-v0-visitor').textContent = customV0Val.visitorId || '—';
    el('custom-v0-visitor').className = 'rval ok';
    const sigCount = customV0Val.signals ? Object.keys(customV0Val.signals).length : 0;
    el('custom-v0-signals').textContent = `${sigCount} signals collected`;
    el('custom-v0-signals').className = 'rval ok';
    console.log('[Custom v0] Result:', customV0Val);
  } else {
    el('custom-v0-visitor').textContent = 'Error';
    el('custom-v0-visitor').className = 'rval err';
  }

  // Display Custom v1
  if (customV1Val) {
    el('custom-v1-visitor').textContent = customV1Val.visitorId || '—';
    el('custom-v1-visitor').className = 'rval ok';
    const sigCount = customV1Val.signals ? Object.keys(customV1Val.signals).length : 0;
    el('custom-v1-signals').textContent = `${sigCount} signals collected`;
    el('custom-v1-signals').className = 'rval ok';
    console.log('[Custom v1] Result:', customV1Val);
  } else {
    el('custom-v1-visitor').textContent = 'Error';
    el('custom-v1-visitor').className = 'rval err';
  }

  // Send to PostHog
  // sendToPostHog(proVal, ossVal, customV0Val, customV1Val);

  runBtn.textContent = 'Run Again';
  runBtn.disabled = false;
  runBtn.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Auto-run on load once SDKs settle; button re-runs manually
// ---------------------------------------------------------------------------
Promise.allSettled([proPromise, ossPromise, customV0Promise, customV1Promise]).then(results => {
  if (results.some(r => r.status === 'fulfilled')) {
    runBenchmark(); // auto-run → also fires PostHog
  } else {
    runBtn.textContent = 'All SDKs failed';
  }
});

runBtn.addEventListener('click', runBenchmark);
