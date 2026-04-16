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

// 3. Custom (fingerprint.js) — regular script, exposes window.FingerprintSignals
const customPromise = new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = './components/fingerprint.js';
  s.onload = () => { setStatus('custom', 'Loaded ✓', 'ok'); resolve(window.FingerprintSignals); };
  s.onerror = () => { setStatus('custom', 'Failed to load', 'err'); reject(new Error('Failed to load fingerprint.js')); };
  document.head.appendChild(s);
});

// Enable button once any SDK is ready
Promise.allSettled([proPromise, ossPromise, customPromise]).then(results => {
  if (results.some(r => r.status === 'fulfilled')) {
    runBtn.textContent = 'Run Benchmark';
    runBtn.disabled = false;
  } else {
    runBtn.textContent = 'All SDKs failed';
  }
});

// Benchmark runner
runBtn.addEventListener('click', async () => {
  runBtn.disabled = true;
  runBtn.textContent = 'Running…';

  async function run(promise, getResult) {
    try { return await getResult(await promise); }
    catch { return null; }
  }

  const [proResult, ossResult, customResult] = await Promise.allSettled([
    run(proPromise, fp => fp.get()),
    run(ossPromise, fp => fp.get()),
    run(customPromise, fp => fp.collectAllSignals()),
  ]);

  // Display Pro
  if (proResult.status === 'fulfilled' && proResult.value) {
    const r = proResult.value;
    el('pro-visitor').textContent = r.visitorId || r.visitor_id || '—';
    el('pro-visitor').className = 'rval ok';
    el('pro-event').textContent = r.requestId || r.event_id || '—';
    el('pro-event').className = 'rval ok';
    console.log('[Pro]', r);
  } else {
    el('pro-visitor').textContent = 'Error';
    el('pro-visitor').className = 'rval err';
  }

  // Display OSS
  if (ossResult.status === 'fulfilled' && ossResult.value) {
    const r = ossResult.value;
    el('oss-visitor').textContent = r.visitorId || '—';
    el('oss-visitor').className = 'rval ok';
    const compCount = r.components ? Object.keys(r.components).length : 0;
    el('oss-components').textContent = compCount + ' signals collected';
    el('oss-components').className = 'rval ok';
    console.log('[OSS]', r);
  } else {
    el('oss-visitor').textContent = 'Error';
    el('oss-visitor').className = 'rval err';
  }

  // Display Custom
  if (customResult.status === 'fulfilled' && customResult.value) {
    const r = customResult.value;
    el('custom-visitor').textContent = r.visitorId || '—';
    el('custom-visitor').className = 'rval ok';
    console.log('[Custom]', r);
  } else {
    el('custom-visitor').textContent = 'Error';
    el('custom-visitor').className = 'rval err';
  }

  runBtn.textContent = 'Run Again';
  runBtn.disabled = false;
  runBtn.style.display = 'none';
});
