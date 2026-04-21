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

// 3. Custom (fingerprint.js) — ES module, same pattern as Pro/OSS
const customPromise = import('./components/identifier/v0/visitorid.js')
  .then(FP => { setStatus('custom', 'Loaded ✓', 'ok'); return FP.load(); })
  .catch(err => { setStatus('custom', 'Failed: ' + err.message, 'err'); throw err; });

// ---------------------------------------------------------------------------
// PostHog: send fingerprint results on first load
// ---------------------------------------------------------------------------
function sendToPostHog(proVal, ossVal, customVal) {
  if (typeof posthog === 'undefined') return;

  // Use custom visitorId as the stable distinct_id; fall back to Pro → OSS
  const distinctId = customVal?.visitorId || proVal?.visitorId || ossVal?.visitorId;
  if (distinctId) posthog.identify(distinctId);

  const properties = {
    user_id: 1,
    publisher_name: 'https://www.adgeist.ai', 
    pro_visitor_id: proVal?.visitorId  ?? proVal?.visitor_id  ?? null,
    oss_visitor_id: ossVal?.visitorId ?? null,
    adgeist_visitor_id: customVal?.visitorId ?? null,

    adgeist_visitor_details :{
        visitorId:    customVal.visitorId,
        isNew:        customVal.isNew,
        visits:       customVal.visits,
        signals:      customVal.signals,
        ...(customVal.similarityScore ? { similarityScore: customVal.similarityScore } : null)
    }
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

  const [proResult, ossResult, customResult] = await Promise.allSettled([
    run(proPromise, fp => fp.get()),
    run(ossPromise, fp => fp.get()),
    run(customPromise, agent => agent.get()),
  ]);

  const proVal    = proResult.status    === 'fulfilled' ? proResult.value    : null;
  const ossVal    = ossResult.status    === 'fulfilled' ? ossResult.value    : null;
  const customVal = customResult.status === 'fulfilled' ? customResult.value : null;

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

  // Display Custom
  if (customVal) {
    el('custom-visitor').textContent = customVal.visitorId || '—';
    el('custom-visitor').className = 'rval ok';
    const sigCount = customVal.signals ? Object.keys(customVal.signals).length : 0;
    el('custom-signals').textContent = `${sigCount} signals collected`;
    el('custom-signals').className = 'rval ok';
    if (customVal.debug) {
      const pct = customVal.debug.scorePercent;
      el('custom-score').textContent = pct !== null
        ? `${pct}% match (threshold ${customVal.debug.thresholdPercent}%) — ${customVal.debug.matched ? 'MATCHED ✓' : 'NEW visitor'}`
        : 'First visit — no prior profile';
      el('custom-score').className = 'rval ok';
    }
    // console.log('[Custom] Result:', customVal);
  } else {
    el('custom-visitor').textContent = 'Error';
    el('custom-visitor').className = 'rval err';
  }

  // Send to PostHog
  sendToPostHog(proVal, ossVal, customVal);

  runBtn.textContent = 'Run Again';
  runBtn.disabled = false;
  runBtn.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Auto-run on load once SDKs settle; button re-runs manually
// ---------------------------------------------------------------------------
Promise.allSettled([proPromise, ossPromise, customPromise]).then(results => {
  if (results.some(r => r.status === 'fulfilled')) {
    runBenchmark(); // auto-run → also fires PostHog
  } else {
    runBtn.textContent = 'All SDKs failed';
  }
});

runBtn.addEventListener('click', runBenchmark);
