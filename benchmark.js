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

// 3. Custom v1 — ES module with both fuzzy match and deterministic IDs
const customV1Promise = import('./components/identifier/v1/visitorid.js')
  .then(FP => { 
    setStatus('custom-fuzzy', 'Loaded ✓', 'ok');
    setStatus('custom-deterministic', 'Loaded ✓', 'ok');
    return FP.load();
  })
  .catch(err => { 
    setStatus('custom-fuzzy', 'Failed: ' + err.message, 'err');
    setStatus('custom-deterministic', 'Failed: ' + err.message, 'err');
    throw err;
  });

// ---------------------------------------------------------------------------
// PostHog: send fingerprint results on first load
// ---------------------------------------------------------------------------
function sendToPostHog(proVal, ossVal, customV1Val) {
  if (typeof posthog === 'undefined') return;

  // Use custom v1 visitorId as the stable distinct_id; fall back to Pro → OSS
  const distinctId = customV1Val?.visitorId || proVal?.visitorId || ossVal?.visitorId;
  if (distinctId) posthog.identify(distinctId);

  const properties = {
    user_id: 1,
    publisher_name: 'https://www.adgeist.ai', 
    pro_visitor_id: proVal?.visitorId  ?? proVal?.visitor_id  ?? null,
    oss_visitor_id: ossVal?.visitorId ?? null,
    custom_fuzzy_visitor_id: customV1Val?.visitorId ?? null,
    custom_deterministic_visitor_id: customV1Val?.deterministicVisitorId ?? null,

    custom_v1_details: customV1Val ? {
        visitorId:             customV1Val.visitorId,
        deterministicVisitorId: customV1Val.deterministicVisitorId,
        isNew:                 customV1Val.isNew,
        visits:                customV1Val.visits,
        version:               customV1Val.version,
        signals:               customV1Val.signals,
        ...(customV1Val.similarityScore ? { similarityScore: customV1Val.similarityScore } : null)
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

  const [proResult, ossResult, customV1Result] = await Promise.allSettled([
    run(proPromise, fp => fp.get()),
    run(ossPromise, fp => fp.get()),
    run(customV1Promise, agent => agent.get()),
  ]);

  const proVal      = proResult.status      === 'fulfilled' ? proResult.value      : null;
  const ossVal      = ossResult.status      === 'fulfilled' ? ossResult.value      : null;
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

  // Display Custom Fuzzy Match (visitorId from v1)
  if (customV1Val) {
    el('custom-fuzzy-visitor').textContent = customV1Val.visitorId || '—';
    el('custom-fuzzy-visitor').className = 'rval ok';
    const sigCount = customV1Val.signals ? Object.keys(customV1Val.signals).length : 0;
    el('custom-fuzzy-signals').textContent = `${sigCount} signals collected`;
    el('custom-fuzzy-signals').className = 'rval ok';
    console.log('[Custom Fuzzy Match] visitorId:', customV1Val.visitorId);
  } else {
    el('custom-fuzzy-visitor').textContent = 'Error';
    el('custom-fuzzy-visitor').className = 'rval err';
  }

  // Display Custom Deterministic (deterministicVisitorId from v1)
  if (customV1Val) {
    el('custom-deterministic-visitor').textContent = customV1Val.deterministicVisitorId || '—';
    el('custom-deterministic-visitor').className = 'rval ok';
    const sigCount = customV1Val.signals ? Object.keys(customV1Val.signals).length : 0;
    el('custom-deterministic-signals').textContent = `${sigCount} signals collected`;
    el('custom-deterministic-signals').className = 'rval ok';
    console.log('[Custom Deterministic] deterministicVisitorId:', customV1Val.deterministicVisitorId);
  } else {
    el('custom-deterministic-visitor').textContent = 'Error';
    el('custom-deterministic-visitor').className = 'rval err';
  }

  // Send to PostHog
  // sendToPostHog(proVal, ossVal, customV1Val);

  runBtn.textContent = 'Run Again';
  runBtn.disabled = false;
  runBtn.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Auto-run on load once SDKs settle; button re-runs manually
// ---------------------------------------------------------------------------
Promise.allSettled([proPromise, ossPromise, customV1Promise]).then(results => {
  if (results.some(r => r.status === 'fulfilled')) {
    runBenchmark(); // auto-run → also fires PostHog
  } else {
    runBtn.textContent = 'All SDKs failed';
  }
});

runBtn.addEventListener('click', runBenchmark);
