'use strict';

/* ================= Tunable settings ================= */
const ECHO_CANCELLATION = false;
const NOISE_SUPPRESSION = false;
const AUTO_GAIN_CONTROL = false;
const RECORD_SECONDS = 30;
const TARGET_SAMPLE_RATE = 16000;
const API_URL = '/api/analyze';
const LANG_URL = '/api/language';
const LANG_CHECK_AT = [8, 16, 24]; // seconds into the recording: live "is this English?" checks
const WAVE_BARS = 29;

/* Support contacts shown in "Get support".
   Fill in REAL, verified local contacts before a public demo. Never guess phone numbers.
   phone: '' hides the call button. */
const SUPPORT_CONTACTS = [
  { icon: 'fa-hospital', name: '[Add local clinic or helpline contact here]', detail: '', phone: '' },
];

/* ================= Strings (add Amharic as STRINGS.am later) ================= */
const STRINGS = {
  en: {
    tagline: 'Your voice wellness companion. Talk for 30 seconds, see how your voice sounds today.',
    f1Title: 'Just talk for 30 seconds',
    f1Text: 'About anything, like your day.',
    f2Title: 'How you speak, not what you say',
    f2Text: 'AI reads tone, energy and rhythm.',
    f3Title: 'Private by design',
    f3Text: 'Audio is deleted right away. No account.',
    consent: 'I agree to record my voice for this check. The audio is analyzed and deleted immediately.',
    insecure: 'The microphone only works on a secure connection. Open this page over HTTPS or on localhost.',
    disclaimer: 'Research prototype, not a medical diagnosis. English, one speaker.',
    start: 'Start voice check',
    topicLabel: 'Talk about',
    newTopic: 'Another topic',
    englishOnly: 'English only',
    notEnglish: (name) => `We heard ${name}. Stop and tap the mic again, then speak in English.`,
    notEnglishGeneric: 'This did not sound like English. Tap the mic and speak in English.',
    tapToRetry: 'Tap the mic to try again · English only',
    topics: [
      'Describe your day so far.',
      'What did you do last weekend?',
      'Describe a place you really like.',
      'Tell me about your favourite food and why.',
      'What are your plans for this week?',
      'Describe the room you are in right now.',
    ],
    micStart: 'Start recording',
    micRecording: 'Recording',
    preparing: 'Preparing microphone…',
    tapToStart: 'Tap the mic to start · 30 seconds',
    listening: 'Listening… keep talking naturally',
    almost: 'Almost done…',
    cancel: 'Cancel',
    analyzingTitle: 'Analyzing your voice',
    analyzingText: 'This can take up to a minute.',
    step1: 'Uploading securely',
    step2: 'Listening to voice patterns',
    step3: 'Preparing your results',
    summary: [
      { icon: 'fa-face-smile', title: 'Your voice sounds steady today', text: 'Few possible signs of depression or anxiety. Keep looking after yourself.' },
      { icon: 'fa-cloud-sun', title: 'Your voice shows a few possible signs', text: 'This is a screening hint, not a diagnosis. Talking to someone you trust may help.' },
      { icon: 'fa-hand-holding-heart', title: 'Your voice shows possible signs worth checking', text: 'This is a screening hint, not a diagnosis. We recommend talking to a health professional.' },
    ],
    depression: 'Depression',
    anxiety: 'Anxiety',
    depScale: ['Low', 'Some signs', 'Higher signs'],
    anxScale: ['Low', 'Mild', 'Moderate', 'Higher'],
    depHeadline: ['Few signs of depression', 'Some possible signs of depression', 'Higher possible signs of depression'],
    anxHeadline: ['Few signs of anxiety', 'Possible signs of mild anxiety', 'Possible signs of moderate anxiety', 'Higher possible signs of anxiety'],
    depQuestionnaire: ['PHQ-9: 0–9', 'PHQ-9: 10–14', 'PHQ-9: 15+'],
    anxQuestionnaire: ['GAD-7: 0–4', 'GAD-7: 5–9', 'GAD-7: 10–14', 'GAD-7: 15+'],
    you: 'You',
    yourNumbers: 'Your numbers',
    screenLabel: 'Screen',
    screen: {
      positive: { icon: 'fa-circle-exclamation', text: 'Likely' },
      negative: { icon: 'fa-circle-check', text: 'Unlikely' },
      indeterminate: { icon: 'fa-circle-question', text: 'Unclear' },
    },
    accuracy: (sn, sp) => `Screen accuracy: ${sn}% sensitivity, ${sp}% specificity`,
    dRaw: 'Raw score',
    levelOf: (l, max) => `Level ${l} of ${max}`,
    howLink: 'How it works',
    supportBtn: 'Get support',
    selfCareTitle: 'Small things that help',
    care1: 'Talk with someone you trust',
    care2: 'Keep a regular sleep time',
    care3: 'Take a short walk outside',
    care4: 'Check again in a few days',
    resultDisclaimer: 'Research prototype, not a medical diagnosis. Please talk to a qualified health professional.',
    tryAgain: 'Check again',
    done: 'Done',
    footer: 'Uses the open-source DAM model by Kintsugi Health. Not endorsed by Kintsugi Health.',
    creditAnalysis: 'Voice tone analysis by',
    apiDocs: 'API Documentation',
    howTitle: 'How your results work',
    how1: 'The AI listens to HOW you speak (tone, energy, pauses), not to your words.',
    how2: 'The “You” marker shows where your voice sits, from Low to Higher signs.',
    how3: 'Levels follow two common health questionnaires: PHQ-9 (depression) and GAD-7 (anxiety). It is a signal, not a diagnosis.',
    gotIt: 'Got it',
    supportSheetTitle: 'Get support',
    emergency: 'In danger or thinking about harming yourself? Contact local emergency services or go to the nearest hospital now.',
    close: 'Close',
    call: 'Call',
    errorTitle: 'Something went wrong',
    retry: 'Try again',
    startOver: 'Start over',
    errPermission: 'Microphone access was blocked. Allow the microphone in your browser settings and try again.',
    errNoMic: 'No microphone was found. Plug in a headset or microphone, or turn on your built-in mic (on laptops: open the lid; Windows: Settings > System > Sound > Input), then try again.',
    errMicBusy: 'The microphone is being used by another app. Close it and try again.',
    errInsecure: 'The microphone needs a secure connection (HTTPS) or localhost.',
    errUnsupported: 'This browser cannot record audio. Please use a recent Chrome, Safari, Firefox or Edge.',
    errNetwork: 'Could not reach the server. Check your connection and try again.',
    errServer: 'The server could not analyze the recording. Please try again.',
    errTooQuiet: 'We could not hear you clearly. Move closer to the microphone and speak a little louder.',
  },
};
const LANG = 'en';
const T = STRINGS[LANG];

/* ================= Helpers ================= */
const $ = (id) => document.getElementById(id);
const app = $('app');
const SCREENS = ['welcome', 'record', 'analyzing', 'result', 'error'];
let current = 'welcome';

function show(name) {
  current = name;
  SCREENS.forEach((s) => { $('screen-' + s).hidden = s !== name; });
  const dark = name === 'record';
  app.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#4B1F5E' : '#F2F2F2';
  $('btn-back').hidden = name !== 'record';
  const scroller = $('screen-' + name).querySelector('.scroll');
  if (scroller) scroller.scrollTop = 0;
  const h = $('screen-' + name).querySelector('h1, h2');
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}

function applyStrings() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-s]').forEach((el) => {
    const v = T[el.dataset.s];
    if (typeof v === 'string') el.textContent = v;
  });
  $('mic-label').textContent = T.micStart;
}

const fmtTime = (s) => `0:${String(Math.max(0, Math.ceil(s))).padStart(2, '0')}`;

/* Excon has proportional digits; fixed-width slots keep the countdown from wobbling. */
let lastTimerText = '';
function setTimer(seconds) {
  const text = fmtTime(seconds);
  if (text === lastTimerText) return; // tick() runs every frame; only touch the DOM on change
  lastTimerText = text;
  const el = $('timer');
  el.replaceChildren(...[...text].map((ch) => {
    const span = document.createElement('span');
    span.className = ch === ':' ? 'tc' : 'td';
    span.textContent = ch;
    return span;
  }));
  el.setAttribute('aria-label', text);
}

/* ================= Topics ================= */
let topicIndex = Math.floor(Math.random() * T.topics.length);
function setTopic(next) {
  const el = $('topic-text');
  if (!next) { el.textContent = T.topics[topicIndex]; return; }
  topicIndex = (topicIndex + 1) % T.topics.length;
  el.classList.add('swap');
  setTimeout(() => { el.textContent = T.topics[topicIndex]; el.classList.remove('swap'); }, 180);
}

/* ================= Wave + ring ================= */
const RING_LEN = 2 * Math.PI * 94;
const bars = [];
function buildWave() {
  const wave = $('wave');
  for (let i = 0; i < WAVE_BARS; i++) { const b = document.createElement('i'); wave.appendChild(b); bars.push(b); }
}
function setRing(fractionDone) {
  const ring = $('ring');
  ring.style.strokeDasharray = RING_LEN;
  ring.style.strokeDashoffset = RING_LEN * (1 - fractionDone);
}

/* ================= Recording ================= */
let rec = null;
let retryAction = null;
let smoothLevel = 0;

function resetRecordView() {
  setRing(0);
  setTimer(RECORD_SECONDS);
  $('record-status').textContent = T.tapToStart;
  $('btn-mic').classList.remove('recording');
  $('btn-mic').disabled = false;
  $('mic-label').textContent = T.micStart;
  bars.forEach((b) => { b.style.transform = 'scaleY(.08)'; });
  $('halo1').style.transform = $('halo2').style.transform = 'scale(1)';
  smoothLevel = 0;
}

function showMicError(message) {
  $('mic-error-text').textContent = message;
  $('mic-error').hidden = false;
  $('record-status').textContent = T.tapToRetry;
  const wrap = document.querySelector('.orb-wrap');
  wrap.classList.add('error');
  wrap.classList.remove('shake');
  void wrap.offsetWidth; // restart the shake animation
  wrap.classList.add('shake');
  if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
}

function hideMicError() {
  $('mic-error').hidden = true;
  document.querySelector('.orb-wrap').classList.remove('error', 'shake');
}

/* Live language check: send the audio so far; if it is clearly not English, stop early. */
async function earlyLanguageCheck(r) {
  r.langBusy = true;
  try {
    const total = r.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of r.chunks) { pcm.set(c, off); off += c.length; }
    const mono = await resample(pcm, r.ctx.sampleRate, TARGET_SAMPLE_RATE);
    const form = new FormData();
    form.append('audio', encodeWav(mono, TARGET_SAMPLE_RATE), 'partial.wav');
    const res = await fetch(LANG_URL, { method: 'POST', body: form });
    const data = await res.json();
    if (rec === r && r.running && data && data.reject) {
      stopAudio();
      resetRecordView();
      showMicError(data.name ? T.notEnglish(data.name) : T.notEnglishGeneric);
    }
  } catch (_) {
    /* network hiccup: the final check on the server still protects the result */
  } finally {
    r.langBusy = false;
  }
}

const WORKLET_SRC = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);`;

async function startRecording() {
  if (rec) return;
  hideMicError();
  if (!window.isSecureContext) return fail(T.errInsecure, null);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fail(T.errUnsupported, null);

  $('btn-mic').disabled = true;
  $('record-status').textContent = T.preparing;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: ECHO_CANCELLATION, noiseSuppression: NOISE_SUPPRESSION, autoGainControl: AUTO_GAIN_CONTROL },
    });
  } catch (e) {
    $('btn-mic').disabled = false;
    const msg = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? T.errPermission
      : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? T.errNoMic
      : e.name === 'NotReadableError' ? T.errMicBusy : T.errUnsupported;
    return fail(msg, restartRecording);
  }
  if (current !== 'record') { stream.getTracks().forEach((t) => t.stop()); return; } // cancelled while asking

  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  if (ctx.state === 'suspended') await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  const chunks = [];
  let node;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    node = new AudioWorkletNode(ctx, 'capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    node.port.onmessage = (ev) => { if (rec && rec.running) chunks.push(ev.data); };
  } catch (_) {
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => { if (rec && rec.running) chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0))); };
  }
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  rec = {
    ctx, stream, source, node, analyser, mute, chunks, running: true, start: performance.now(), langIdx: 0, langBusy: false,
    timeBuf: new Float32Array(analyser.fftSize), freqBuf: new Uint8Array(analyser.frequencyBinCount),
  };
  $('btn-mic').classList.add('recording');
  $('mic-label').textContent = T.micRecording;
  $('record-status').textContent = T.listening;
  if (navigator.vibrate) navigator.vibrate(20);
  tick();
}

function restartRecording() { show('record'); resetRecordView(); startRecording(); }

function tick() {
  if (!rec) return;
  const elapsed = (performance.now() - rec.start) / 1000;
  const left = RECORD_SECONDS - elapsed;
  setTimer(left);
  setRing(Math.min(1, elapsed / RECORD_SECONDS));
  if (left < 5) $('record-status').textContent = T.almost;

  // Level (RMS) for the halos
  rec.analyser.getFloatTimeDomainData(rec.timeBuf);
  let sum = 0;
  for (let i = 0; i < rec.timeBuf.length; i++) sum += rec.timeBuf[i] * rec.timeBuf[i];
  const level = Math.min(1, Math.sqrt(sum / rec.timeBuf.length) * 6);
  smoothLevel += (level - smoothLevel) * 0.25;
  $('halo1').style.transform = `scale(${1 + smoothLevel * 0.45})`;
  $('halo2').style.transform = `scale(${1 + smoothLevel * 0.25})`;

  // Mirrored spectrum for the wave bars (speech band only)
  rec.analyser.getByteFrequencyData(rec.freqBuf);
  const half = Math.ceil(WAVE_BARS / 2);
  // Log-spaced bins from ~90 Hz to ~4 kHz (the voice range), so every bar reacts to speech.
  const hzPerBin = rec.ctx.sampleRate / 2 / rec.freqBuf.length;
  for (let i = 0; i < half; i++) {
    const hz = 90 * Math.pow(4000 / 90, i / (half - 1));
    const v = rec.freqBuf[Math.min(rec.freqBuf.length - 1, Math.round(hz / hzPerBin))] / 255;
    const s = Math.max(0.08, Math.min(1, v * 1.15));
    bars[half - 1 - i].style.transform = `scaleY(${s})`;
    bars[half - 1 + i].style.transform = `scaleY(${s})`;
  }

  if (!rec.langBusy && rec.langIdx < LANG_CHECK_AT.length && elapsed >= LANG_CHECK_AT[rec.langIdx]) {
    rec.langIdx++;
    earlyLanguageCheck(rec);
  }

  if (left <= 0) { finishRecording(); return; }
  rec.raf = requestAnimationFrame(tick);
}

function stopAudio() {
  if (!rec) return null;
  const r = rec;
  rec = null;
  r.running = false;
  cancelAnimationFrame(r.raf);
  try { r.source.disconnect(); r.node.disconnect(); r.mute.disconnect(); } catch (_) {}
  r.stream.getTracks().forEach((t) => t.stop());
  r.ctx.close();
  return r;
}

function cancelRecording() { stopAudio(); resetRecordView(); hideMicError(); show('welcome'); }

async function finishRecording() {
  const r = stopAudio();
  if (!r) return;
  if (navigator.vibrate) navigator.vibrate([15, 60, 15]);
  setSteps(0);
  show('analyzing');
  const total = r.chunks.reduce((n, c) => n + c.length, 0);
  const pcm = new Float32Array(total);
  let off = 0;
  for (const c of r.chunks) { pcm.set(c, off); off += c.length; }
  const mono = await resample(pcm, r.ctx.sampleRate, TARGET_SAMPLE_RATE);
  upload(encodeWav(mono, TARGET_SAMPLE_RATE));
}

async function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const outLen = Math.round(input.length * toRate / fromRate);
  try {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offCtx = new Off(1, outLen, toRate);
    const buf = offCtx.createBuffer(1, input.length, fromRate);
    buf.getChannelData(0).set(input);
    const src = offCtx.createBufferSource();
    src.buffer = buf;
    src.connect(offCtx.destination);
    src.start();
    return (await offCtx.startRendering()).getChannelData(0).slice(0);
  } catch (_) {
    const out = new Float32Array(outLen);
    const ratio = fromRate / toRate;
    for (let i = 0; i < outLen; i++) {
      const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, input.length - 1);
      out[i] = input[i0] + (input[i1] - input[i0]) * (x - i0);
    }
    return out;
  }
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/* ================= Upload (real progress steps) ================= */
function setSteps(activeIndex) {
  document.querySelectorAll('#steps li').forEach((li, i) => {
    const icon = li.querySelector('i');
    li.classList.toggle('done', i < activeIndex);
    li.classList.toggle('active', i === activeIndex);
    icon.className = i < activeIndex ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-notch';
  });
}

function upload(wav) {
  show('analyzing');
  setSteps(0);
  const form = new FormData();
  form.append('audio', wav, 'recording.wav');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', API_URL);
  xhr.responseType = 'json';
  xhr.upload.onload = () => setSteps(1);
  xhr.onerror = () => fail(T.errNetwork, () => upload(wav));
  xhr.onload = () => {
    const data = xhr.response;
    if (xhr.status !== 200 || !data || data.error) {
      if (data && data.error === 'not_english') {
        show('record');
        resetRecordView();
        return showMicError(data.language_name ? T.notEnglish(data.language_name) : T.notEnglishGeneric);
      }
      if (data && data.error === 'silent') return fail(T.errTooQuiet, restartRecording);
      if (data && (data.error === 'bad_duration' || data.error === 'invalid_wav')) return fail(data.message, restartRecording);
      return fail((data && data.message) || T.errServer, () => upload(wav));
    }
    setSteps(2);
    setTimeout(() => { setSteps(3); renderResult(data); }, 400);
  };
  xhr.send(form);
}

/* ================= Results ================= */
const TONES = {
  depression: ['l0', 'l1', 'l3'],
  anxiety: ['l0', 'l1', 'l2', 'l3'],
};
const TONE_INK = { l0: '#1f6e4a', l1: '#8a5d0c', l2: '#9a4a1c', l3: '#9b2a20' };

/* Where the score sits on the scale: each level gets an equal-width segment, and the
   marker is placed inside its segment proportionally between the model's thresholds. */
function markerPercent(raw, level, thresholds) {
  const n = thresholds.length + 1;
  const edges = [thresholds[0] - 0.5, ...thresholds, thresholds[thresholds.length - 1] + 0.5];
  const lo = edges[level], hi = edges[level + 1];
  const frac = Math.min(0.94, Math.max(0.06, (raw - lo) / (hi - lo)));
  return Math.min(96, Math.max(4, ((level + frac) / n) * 100)); // keep the "You" label inside the bar
}

function buildCard(kind, info) {
  const isDep = kind === 'depression';
  const scale = isDep ? T.depScale : T.anxScale;
  const max = scale.length - 1;
  const level = Math.max(0, Math.min(max, info.level | 0));
  const tone = TONES[kind][level];

  const card = document.createElement('article');
  card.className = 'card';
  card.style.setProperty('--tone', `var(--${tone})`);
  card.style.setProperty('--tone-soft', `var(--${tone}-soft)`);
  card.style.setProperty('--tone-ink', TONE_INK[tone]);
  card.innerHTML = `
    <div class="card-head">
      <span class="card-icon"><i class="fa-solid ${isDep ? 'fa-cloud-rain' : 'fa-heart-pulse'}"></i></span>
      <span class="card-name"></span>
      <span class="pill"></span>
    </div>
    <p class="card-headline"></p>
    <div class="scale" role="img">
      <div class="scale-track">${scale.map((_, i) => `<span class="c${TONES[kind][i].slice(1)}${i === level ? ' on' : ''}"></span>`).join('')}</div>
      <div class="marker-rail"><span class="marker" data-you="${T.you}"><b></b></span></div>
      <div class="scale-labels">${scale.map((_, i) => `<span class="${i === level ? 'on' : ''}"></span>`).join('')}</div>
    </div>
    <div class="stats">
      <span class="s-level"></span>
      <span class="s-q"></span>
      <span class="s-raw"></span>
    </div>
    <p class="screen-line" hidden><i class="fa-solid"></i><span></span></p>`;

  card.querySelector('.card-name').textContent = isDep ? T.depression : T.anxiety;
  card.querySelector('.pill').textContent = scale[level];
  card.querySelector('.card-headline').textContent = (isDep ? T.depHeadline : T.anxHeadline)[level];
  card.querySelectorAll('.scale-labels span').forEach((el, i) => { el.textContent = scale[i]; });
  card.querySelector('.scale').setAttribute('aria-label', `${isDep ? T.depression : T.anxiety}: ${scale[level]}`);
  // The model's internal numbers, shown on the card
  card.querySelector('.s-level').textContent = T.levelOf(level, max);
  card.querySelector('.s-q').textContent = (isDep ? T.depQuestionnaire : T.anxQuestionnaire)[level];
  card.querySelector('.s-raw').innerHTML = `${T.dRaw}: <b></b>`;
  card.querySelector('.s-raw b').textContent = Number(info.raw).toFixed(3);
  // Screening result from the model card's tuning (sensitivity = specificity, 20% indeterminate budget)
  if (info.screen && T.screen[info.screen.result]) {
    const line = card.querySelector('.screen-line');
    const s = T.screen[info.screen.result];
    line.hidden = false;
    line.dataset.result = info.screen.result;
    line.querySelector('i').classList.add(s.icon);
    line.querySelector('span').textContent = `${T.screenLabel} (${info.screen.label.replace('>=', '≥')}): ${s.text}`;
  }

  const pct = Array.isArray(info.thresholds) && info.thresholds.length === max
    ? markerPercent(Number(info.raw), level, info.thresholds)
    : ((level + 0.5) / (max + 1)) * 100;
  card._animateMarker = () => { card.querySelector('.marker-rail').style.transform = `translateX(${pct}%)`; };
  return card;
}

function renderResult(data) {
  const depLevel = data.depression.level | 0;
  const anxLevel = data.anxiety.level | 0;
  const tier = Math.max(Math.min(depLevel, 2), [0, 1, 2, 2][Math.min(anxLevel, 3)]);
  const tone = ['l0', 'l1', 'l3'][tier];

  const summary = $('summary');
  summary.style.setProperty('--tone', `var(--${tone})`);
  summary.style.setProperty('--tone-soft', `var(--${tone}-soft)`);
  $('summary-icon').innerHTML = `<i class="fa-solid ${T.summary[tier].icon}"></i>`;
  $('result-title').textContent = T.summary[tier].title;
  $('summary-text').textContent = T.summary[tier].text;

  const cards = [buildCard('depression', data.depression), buildCard('anxiety', data.anxiety)];
  $('cards').replaceChildren(...cards);

  $('btn-support').classList.toggle('urgent', depLevel >= 2 || anxLevel >= 2);
  renderNumbers(data);

  show('result');
  // Let the cards land first, then glide each marker to the score (explanatory motion).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cards.forEach((c, i) => setTimeout(c._animateMarker, 250 + i * 120));
  }));
}

function renderNumbers(data) {
  const rows = [
    [T.depression, data.depression, T.depQuestionnaire, 2],
    [T.anxiety, data.anxiety, T.anxQuestionnaire, 3],
  ];
  $('numbers-grid').replaceChildren(...rows.map(([name, info, q, max]) => {
    const lvl = Math.max(0, Math.min(max, info.level | 0));
    const el = document.createElement('div');
    el.className = 'num';
    el.innerHTML = '<strong></strong><div class="n-l"></div><div class="n-q"></div><div class="n-r"></div><div class="n-s"></div>';
    if (info.screen) {
      el.querySelector('.n-s').textContent = T.accuracy(
        Math.round(info.screen.sensitivity * 100), Math.round(info.screen.specificity * 100));
    }
    el.querySelector('strong').textContent = name;
    el.querySelector('.n-l').textContent = T.levelOf(lvl, max);
    el.querySelector('.n-q').textContent = q[lvl];
    el.querySelector('.n-r').innerHTML = `${T.dRaw}: <b>${Number(info.raw).toFixed(3)}</b>`;
    return el;
  }));
  $('numbers').hidden = false;
}

function fail(message, retry) {
  stopAudio();
  retryAction = retry;
  $('error-msg').textContent = message;
  $('btn-retry').hidden = !retry;
  show('error');
}

/* ================= Bottom sheets ================= */
let openSheetEl = null;
let lastFocus = null;

function renderContacts() {
  const box = $('contacts');
  box.replaceChildren(...SUPPORT_CONTACTS.map((c) => {
    const row = document.createElement('div');
    row.className = 'contact';
    row.innerHTML = `<i class="fa-solid ${c.icon}"></i><div><strong></strong><span></span></div>`;
    row.querySelector('strong').textContent = c.name;
    row.querySelector('span').textContent = c.detail;
    row.querySelector('span').hidden = !c.detail;
    if (c.phone) {
      const a = document.createElement('a');
      a.href = 'tel:' + c.phone.replace(/[^\d+]/g, '');
      a.setAttribute('aria-label', `${T.call} ${c.name}`);
      a.innerHTML = '<i class="fa-solid fa-phone"></i>';
      row.appendChild(a);
    }
    return row;
  }));
}

function openSheet(id) {
  if (openSheetEl) closeSheet();
  lastFocus = document.activeElement;
  const sheet = $(id);
  const backdrop = $('backdrop');
  backdrop.hidden = false;
  sheet.hidden = false;
  void sheet.offsetHeight; // commit start position before transitioning
  backdrop.classList.add('open');
  sheet.classList.add('open');
  openSheetEl = sheet;
  const focusEl = sheet.querySelector('button');
  if (focusEl) focusEl.focus({ preventScroll: true });
}

function closeSheet() {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  const backdrop = $('backdrop');
  sheet.classList.remove('open');
  backdrop.classList.remove('open');
  setTimeout(() => { if (openSheetEl !== sheet) { sheet.hidden = true; if (!openSheetEl) backdrop.hidden = true; } }, 240);
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}

/* Swipe down to dismiss (velocity-aware) */
function enableSwipe(sheet) {
  let startY = 0, dy = 0, t0 = 0, dragging = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (dragging || sheet.scrollTop > 0 || e.target.closest('button, a')) return;
    dragging = true; startY = e.clientY; dy = 0; t0 = performance.now();
    sheet.setPointerCapture(e.pointerId);
    sheet.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = e.clientY - startY;
    const y = dy > 0 ? dy : dy * 0.15; // friction when pulling up
    sheet.style.transform = `translateY(${y}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    sheet.style.transform = '';
    const velocity = Math.abs(dy) / (performance.now() - t0);
    if (dy > 100 || (dy > 10 && velocity > 0.11)) closeSheet();
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
}

/* ================= Wire up ================= */
function init() {
  applyStrings();
  buildWave();
  setTopic(false);
  resetRecordView();
  renderContacts();
  if (!window.isSecureContext) $('secure-warning').hidden = false;

  $('consent').addEventListener('change', (e) => { $('btn-start').disabled = !e.target.checked; });
  $('btn-start').addEventListener('click', () => { resetRecordView(); hideMicError(); show('record'); });
  $('btn-mic').addEventListener('click', startRecording);
  $('btn-topic').addEventListener('click', () => setTopic(true));
  $('btn-cancel').addEventListener('click', cancelRecording);
  $('btn-back').addEventListener('click', cancelRecording);
  $('btn-retry').addEventListener('click', () => { if (retryAction) retryAction(); });
  $('btn-error-home').addEventListener('click', () => { resetRecordView(); show('welcome'); });
  $('btn-again').addEventListener('click', () => { resetRecordView(); hideMicError(); show('record'); });
  $('btn-done').addEventListener('click', () => { resetRecordView(); show('welcome'); });

  $('btn-info').addEventListener('click', () => openSheet('sheet-how'));
  $('btn-how').addEventListener('click', () => openSheet('sheet-how'));
  $('btn-support').addEventListener('click', () => openSheet('sheet-support'));
  $('backdrop').addEventListener('click', closeSheet);
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  document.querySelectorAll('.sheet').forEach(enableSwipe);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openSheetEl) closeSheet(); });

  // Pause safety: if the tab is hidden mid-recording, cancel cleanly (mobile browsers suspend audio).
  document.addEventListener('visibilitychange', () => { if (document.hidden && rec) cancelRecording(); });
}
init();
