// SoundBlast INJECTED ENGINE v2.2 — soft, clear boost (page context)

(function () {
  if (window.__SB_INJECTED) return;
  window.__SB_INJECTED = true;

  const WIN = window;
  const NAT_CTX = WIN.AudioContext || WIN.webkitAudioContext;
  if (!NAT_CTX) return;

  let masterGain = null;
  let waveshaper = null;
  let bassFilter = null;
  let clarityFilter = null;
  let presenceFilter = null;
  let hiShelf = null;
  let compressor = null;
  let convolver = null;
  let wetGain = null;
  let dryGain = null;
  let outGain = null;
  let widenGainL = null;
  let widenGainR = null;
  let splitter = null;
  let merger = null;
  let panner = null;
  let sharedCtx = null;
  let powered = true;
  let lastVolume = 1;

  const hooked = new WeakSet();
  const srcMap = new WeakMap();

  // Very gentle soft-clip — clear boost without crunch
  function softClipCurve(amount) {
    const N = 2048;
    const c = new Float32Array(N);
    const k = Math.max(8, amount);
    for (let i = 0; i < N; i++) {
      const x = (i * 2) / N - 1;
      // tanh-like softer knee
      c[i] = Math.tanh(x * (1.2 + k * 0.02)) / Math.tanh(1.2 + k * 0.02);
    }
    return c;
  }

  function ensureGraph(ctx) {
    if (sharedCtx === ctx && masterGain) return;
    sharedCtx = ctx;

    masterGain = ctx.createGain();
    masterGain.gain.value = 1;

    waveshaper = ctx.createWaveShaper();
    waveshaper.curve = softClipCurve(18);
    waveshaper.oversample = '4x';

    bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 160;
    bassFilter.gain.value = 2;

    clarityFilter = ctx.createBiquadFilter();
    clarityFilter.type = 'peaking';
    clarityFilter.frequency.value = 2800;
    clarityFilter.Q.value = 0.7;
    clarityFilter.gain.value = 2.5;

    presenceFilter = ctx.createBiquadFilter();
    presenceFilter.type = 'peaking';
    presenceFilter.frequency.value = 4500;
    presenceFilter.Q.value = 0.85;
    presenceFilter.gain.value = 1;

    hiShelf = ctx.createBiquadFilter();
    hiShelf.type = 'highshelf';
    hiShelf.frequency.value = 8500;
    hiShelf.gain.value = -1.5;

    // Soft compressor — smooth dynamics, less pumping
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.4;
    compressor.attack.value = 0.02;
    compressor.release.value = 0.35;

    outGain = ctx.createGain();
    outGain.gain.value = 1;

    convolver = ctx.createConvolver();
    makeImpulse(ctx, 1.6, 0.55);
    wetGain = ctx.createGain();
    wetGain.gain.value = 0;
    dryGain = ctx.createGain();
    dryGain.gain.value = 1;

    // Subtle stereo widen (mid/side-ish via channel gains)
    splitter = ctx.createChannelSplitter(2);
    merger = ctx.createChannelMerger(2);
    widenGainL = ctx.createGain();
    widenGainR = ctx.createGain();
    widenGainL.gain.value = 1;
    widenGainR.gain.value = 1;

    panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = 0;

    // Chain: gain → soft clip → tone → compressor → dry/wet → widen → pan → out
    masterGain.connect(waveshaper);
    waveshaper.connect(bassFilter);
    bassFilter.connect(clarityFilter);
    clarityFilter.connect(presenceFilter);
    presenceFilter.connect(hiShelf);
    hiShelf.connect(compressor);
    compressor.connect(outGain);

    outGain.connect(dryGain);
    outGain.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(splitter);
    wetGain.connect(splitter);
    splitter.connect(widenGainL, 0);
    splitter.connect(widenGainR, 1);
    widenGainL.connect(merger, 0, 0);
    widenGainR.connect(merger, 0, 1);

    if (panner) {
      merger.connect(panner);
      panner.connect(ctx.destination);
    } else {
      merger.connect(ctx.destination);
    }
  }

  function makeImpulse(ctx, dur, softness) {
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      const soft = softness == null ? 0.7 : softness;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          const env = Math.pow(1 - i / len, 2.2 + soft);
          d[i] = (Math.random() * 2 - 1) * env * (0.35 + soft * 0.25);
        }
      }
      if (convolver) convolver.buffer = buf;
    } catch (_) {}
  }

  function hookEl(el) {
    if (hooked.has(el)) return;
    if (!el.src && !el.srcObject) return;
    const ctx = sharedCtx;
    if (!ctx) return;
    try {
      let src = srcMap.get(el);
      if (!src) {
        src = ctx.createMediaElementSource(el);
        srcMap.set(el, src);
      }
      src.connect(masterGain);
      hooked.add(el);
      el.preservesPitch = true;
    } catch (_) {}
  }

  function scanAll() {
    if (!sharedCtx || !masterGain) return;
    document.querySelectorAll('audio,video').forEach(hookEl);
  }

  const OrigCtx = NAT_CTX;
  function PatchedCtx(...args) {
    const instance = new OrigCtx(...args);
    if (!sharedCtx) {
      try {
        ensureGraph(instance);
        setTimeout(scanAll, 100);
        setTimeout(scanAll, 800);
        setTimeout(scanAll, 2500);
      } catch (_) {}
    }
    return instance;
  }
  PatchedCtx.prototype = OrigCtx.prototype;
  Object.defineProperties(PatchedCtx, Object.getOwnPropertyDescriptors(OrigCtx));
  WIN.AudioContext = PatchedCtx;
  WIN.webkitAudioContext = PatchedCtx;

  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (!sharedCtx) {
      try {
        const ctx = new OrigCtx();
        ensureGraph(ctx);
      } catch (_) {}
    }
    if (sharedCtx) {
      sharedCtx.resume().catch(() => {});
      setTimeout(() => hookEl(this), 0);
    }
    return origPlay.apply(this, arguments);
  };

  new MutationObserver(scanAll).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  function applyVolume(g) {
    if (!sharedCtx || !masterGain) return;
    const ctx = sharedCtx;
    const t = ctx.currentTime;
    lastVolume = g;
    const ui = Math.max(0, g);
    // Soft loudness curve: UI still shows 600%, actual gain stays comfortable
    const soft = ui <= 1 ? ui : 1 + Math.pow(ui - 1, 0.82) * 0.92;
    const target = powered ? soft : 1;

    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setTargetAtTime(target, t, 0.16);

    waveshaper.curve = softClipCurve(Math.min(14 + target * 6, 48));

    // Tame highs as boost rises — prevents harshness
    const hiCut = target <= 1 ? -1.5 : -1.5 - Math.min((target - 1) * 1.1, 5);
    hiShelf.gain.setTargetAtTime(hiCut, t, 0.16);

    const mk = target > 1 ? 1 + (target - 1) * 0.028 : 1;
    outGain.gain.setTargetAtTime(Math.min(mk, 1.18), t, 0.16);

    if (target >= 2.5) {
      compressor.threshold.setTargetAtTime(-24, t, 0.18);
      compressor.ratio.setTargetAtTime(3.6, t, 0.18);
    } else {
      compressor.threshold.setTargetAtTime(-20, t, 0.18);
      compressor.ratio.setTargetAtTime(2.4, t, 0.18);
    }
  }

  window.addEventListener('__sb_cmd', (e) => {
    const { action, value } = e.detail;
    if (action === 'resume' && sharedCtx) {
      sharedCtx.resume().catch(() => {});
      return;
    }
    if (!sharedCtx || !masterGain) return;
    const ctx = sharedCtx;
    const t = ctx.currentTime;

    switch (action) {
      case 'setPower':
        powered = !!value;
        applyVolume(lastVolume);
        break;
      case 'setVolume':
        applyVolume(parseFloat(value));
        break;
      case 'setMode':
        applyMode(ctx, value);
        break;
      case 'setClarity': {
        const c = parseFloat(value);
        // Mild presence — clear speech without sharp edges
        clarityFilter.gain.setTargetAtTime(c * 5.5, t, 0.12);
        presenceFilter.gain.setTargetAtTime(c * 2.2, t, 0.12);
        break;
      }
      case 'setBassBoost': {
        const b = parseFloat(value);
        bassFilter.gain.setTargetAtTime(b * 8, t, 0.12);
        break;
      }
      case 'setSpace': {
        const w = parseFloat(value);
        wetGain.gain.setTargetAtTime(w * 0.32, t, 0.14);
        dryGain.gain.setTargetAtTime(1 - w * 0.18, t, 0.14);
        if (w > 0.05) makeImpulse(ctx, 1.3 + w * 1.4, 0.75);
        break;
      }
      case 'setWiden': {
        const w = parseFloat(value);
        // Subtle stereo space without loudness jump
        widenGainL.gain.setTargetAtTime(1 + w * 0.1, t, 0.12);
        widenGainR.gain.setTargetAtTime(1 + w * 0.12, t, 0.12);
        break;
      }
      case 'setFreq':
        bassFilter.frequency.setTargetAtTime(parseFloat(value), t, 0.1);
        break;
      case 'setReverb': {
        const w = parseFloat(value);
        wetGain.gain.setTargetAtTime(w, t, 0.1);
        dryGain.gain.setTargetAtTime(1 - w * 0.35, t, 0.1);
        break;
      }
      case 'setPitch':
        document.querySelectorAll('audio,video').forEach((el) => {
          el.playbackRate = parseFloat(value);
          try { el.preservesPitch = true; } catch (_) {}
        });
        break;
      case 'setPan':
        if (panner) panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, parseFloat(value))), t, 0.08);
        break;
      case 'ping':
        window.dispatchEvent(new CustomEvent('__sb_pong', {
          detail: {
            ok: true,
            hooked: [...document.querySelectorAll('audio,video')].filter((el) => hooked.has(el)).length
          }
        }));
        break;
    }
  });

  function applyMode(ctx, mode) {
    const t = ctx.currentTime;
    const r = 0.14;

    // Soft defaults
    bassFilter.gain.setTargetAtTime(2, t, r);
    clarityFilter.gain.setTargetAtTime(3.5, t, r);
    presenceFilter.gain.setTargetAtTime(1.5, t, r);
    hiShelf.gain.setTargetAtTime(0.5, t, r);
    wetGain.gain.setTargetAtTime(0, t, r);
    dryGain.gain.setTargetAtTime(1, t, r);
    compressor.ratio.setTargetAtTime(3.2, t, r);
    compressor.threshold.setTargetAtTime(-18, t, r);
    waveshaper.curve = softClipCurve(28);

    switch (mode) {
      case 'softclear':
        clarityFilter.frequency.setTargetAtTime(2800, t, r);
        clarityFilter.gain.setTargetAtTime(3.5, t, r);
        presenceFilter.gain.setTargetAtTime(1.5, t, r);
        bassFilter.gain.setTargetAtTime(1.5, t, r);
        hiShelf.gain.setTargetAtTime(-1.5, t, r);
        compressor.ratio.setTargetAtTime(2.4, t, r);
        waveshaper.curve = softClipCurve(16);
        document.querySelectorAll('audio,video').forEach((el) => { el.playbackRate = 1.0; });
        break;
      case 'bass':
        bassFilter.gain.setTargetAtTime(7, t, r);
        clarityFilter.gain.setTargetAtTime(1, t, r);
        presenceFilter.gain.setTargetAtTime(0, t, r);
        hiShelf.gain.setTargetAtTime(-2.5, t, r);
        waveshaper.curve = softClipCurve(22);
        break;
      case 'lofi':
        bassFilter.gain.setTargetAtTime(3, t, r);
        clarityFilter.gain.setTargetAtTime(-2, t, r);
        presenceFilter.gain.setTargetAtTime(-2, t, r);
        hiShelf.gain.setTargetAtTime(-8, t, r);
        wetGain.gain.setTargetAtTime(0.15, t, r);
        dryGain.gain.setTargetAtTime(0.94, t, r);
        makeImpulse(ctx, 1.1, 0.8);
        break;
      case 'vocal':
        clarityFilter.frequency.setTargetAtTime(2400, t, r);
        clarityFilter.gain.setTargetAtTime(5, t, r);
        presenceFilter.gain.setTargetAtTime(2.5, t, r);
        bassFilter.gain.setTargetAtTime(-1.5, t, r);
        hiShelf.gain.setTargetAtTime(-0.5, t, r);
        break;
      case 'cinema':
        bassFilter.gain.setTargetAtTime(5, t, r);
        clarityFilter.gain.setTargetAtTime(2, t, r);
        presenceFilter.gain.setTargetAtTime(2, t, r);
        hiShelf.gain.setTargetAtTime(-1, t, r);
        wetGain.gain.setTargetAtTime(0.08, t, r);
        dryGain.gain.setTargetAtTime(0.97, t, r);
        makeImpulse(ctx, 1.4, 0.7);
        break;
      case 'normal':
        bassFilter.gain.setTargetAtTime(0, t, r);
        clarityFilter.gain.setTargetAtTime(0, t, r);
        presenceFilter.gain.setTargetAtTime(0, t, r);
        hiShelf.gain.setTargetAtTime(0, t, r);
        document.querySelectorAll('audio,video').forEach((el) => { el.playbackRate = 1.0; });
        break;
    }
  }

  setTimeout(() => {
    if (!sharedCtx) {
      try {
        const ctx = new OrigCtx();
        ensureGraph(ctx);
        scanAll();
      } catch (_) {}
    }
  }, 0);
})();
