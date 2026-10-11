// Sunete sintetizate cu Web Audio (fără fișiere). Pornesc doar după un clic, cum cer browserele.
const Sfx = (() => {
  let ac = null, on = true;
  try { on = localStorage.getItem('os-sound') !== 'off'; } catch (e) { /* fără stocare */ }

  function audio() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A(); }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, vol = 0.1, freq = 1200) {
    const t = ac.currentTime, len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination); src.start(t);
  }
  const notes = (list, type = 'triangle', vol = 0.1, gap = 0.14, dur = 0.22) => list.forEach((f, i) => tone(f, dur, type, vol, 0, i * gap));

  const SOUNDS = {
    pick: () => tone(260, 0.16, 'square', 0.06, 260),
    bed: () => notes([660, 880], 'sine', 0.1, 0.1),
    sleep: () => notes([784, 659, 523], 'sine', 0.09, 0.2, 0.4),
    scream: () => { hiss(0.45, 0.16, 1800); tone(900, 0.4, 'sawtooth', 0.04, 400); },
    cry: () => tone(520, 0.35, 'triangle', 0.03, 120),
    chaos: () => { tone(180, 0.12, 'square', 0.07, -80); tone(320, 0.1, 'square', 0.05, 120, 0.08); },
    clean: () => notes([523, 659, 784], 'triangle', 0.08, 0.06, 0.12),
    click: () => tone(700, 0.06, 'square', 0.05),
    tap: () => tone(900 + Math.random() * 200, 0.05, 'square', 0.04),
    perfect: () => notes([988, 1319], 'triangle', 0.09, 0.07, 0.14),
    good: () => tone(784, 0.12, 'triangle', 0.08),
    miss: () => tone(200, 0.16, 'square', 0.05, -60),
    escape: () => tone(380, 0.28, 'sawtooth', 0.05, 520),
    hide: () => tone(500, 0.2, 'sine', 0.07, -250),
    found: () => notes([392, 523], 'square', 0.06, 0.1),
    warn: () => notes([880, 880], 'square', 0.05, 0.12, 0.08),
    ability: () => tone(440, 0.18, 'triangle', 0.08, 440),
    win: () => notes([523, 659, 784, 1047], 'triangle', 0.1, 0.13, 0.3),
    lose: () => notes([392, 330, 262], 'triangle', 0.09, 0.2, 0.35),
  };

  return {
    play(name) { if (on && SOUNDS[name] && audio()) { try { SOUNDS[name](); } catch (e) { /* audio indisponibil */ } } },
    toggle() { on = !on; try { localStorage.setItem('os-sound', on ? 'on' : 'off'); } catch (e) { /* fără stocare */ } if (on) audio(); return on; },
    get on() { return on; },
  };
})();
