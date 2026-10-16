/**
 * Merlin SIP Web - Web Audio API Tone & Ringtone Synthesizer
 * Provides standard DTMF keypad tones, UK/US ringback cadences, and multi-profile ringtone synthesizers.
 */
window.MerlinTones = (() => {
  let audioCtx = null;
  let activeRingback = null;
  let activeRingtone = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // DTMF frequencies (ITU-T standard)
  const dtmfFreqs = {
    '1': [697, 1209],
    '2': [697, 1336],
    '3': [697, 1477],
    '4': [770, 1209],
    '5': [770, 1336],
    '6': [770, 1477],
    '7': [852, 1209],
    '8': [852, 1336],
    '9': [852, 1477],
    '*': [941, 1209],
    '0': [941, 1336],
    '#': [941, 1477]
  };

  /**
   * Plays a standard dual-frequency DTMF dialpad tone.
   */
  function playDtmf(key, durationMs = 120) {
    const ctx = getAudioContext();
    if (!ctx || !dtmfFreqs[key]) return;

    try {
      const freqs = dtmfFreqs[key];
      const now = ctx.currentTime;
      const duration = durationMs / 1000;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(freqs[0], now);
      osc2.frequency.setValueAtTime(freqs[1], now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.02);
      osc2.stop(now + duration + 0.02);
    } catch (e) {
      console.warn('DTMF synthesis failed', e);
    }
  }

  /**
   * Starts UK cadence ringback (400Hz + 450Hz: 0.4s ON, 0.2s OFF, 0.4s ON, 2.0s OFF).
   */
  function startRingback(cadence = 'uk') {
    stopRingback();
    const ctx = getAudioContext();
    if (!ctx) return;

    let isRunning = true;
    let timerId = null;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const playBursts = () => {
      if (!isRunning) return;
      try {
        const now = ctx.currentTime;
        const freqs = cadence === 'us' ? [440, 480] : [400, 450];

        if (cadence === 'us') {
          // US: 2.0s on, 4.0s off
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.frequency.value = freqs[0];
          osc2.frequency.value = freqs[1];

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
          gain.gain.setValueAtTime(0.15, now + 1.95);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(masterGain);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 2.05);
          osc2.stop(now + 2.05);

          timerId = setTimeout(playBursts, 6000);
        } else {
          // UK standard: 0.4s on, 0.2s off, 0.4s on, 2.0s off (total cycle: 3.0s)
          const playPulse = (offset) => {
            const t = now + offset;
            const o1 = ctx.createOscillator();
            const o2 = ctx.createOscillator();
            const g = ctx.createGain();

            o1.frequency.value = freqs[0];
            o2.frequency.value = freqs[1];

            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.14, t + 0.03);
            g.gain.setValueAtTime(0.14, t + 0.37);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

            o1.connect(g);
            o2.connect(g);
            g.connect(masterGain);

            o1.start(t);
            o2.start(t);
            o1.stop(t + 0.42);
            o2.stop(t + 0.42);
          };

          playPulse(0);
          playPulse(0.6);

          timerId = setTimeout(playBursts, 3000);
        }
      } catch (e) {
        console.warn('Ringback playback error', e);
      }
    };

    playBursts();

    activeRingback = {
      stop: () => {
        isRunning = false;
        if (timerId) clearTimeout(timerId);
        try {
          masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
          masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
          setTimeout(() => { try { masterGain.disconnect(); } catch {} }, 60);
        } catch {}
      }
    };
  }

  function stopRingback() {
    if (activeRingback) {
      activeRingback.stop();
      activeRingback = null;
    }
  }

  /**
   * Starts synthesized incoming call ringtone.
   */
  function startRingtone(type = 'classic') {
    stopRingtone();
    const ctx = getAudioContext();
    if (!ctx) return;

    let isRunning = true;
    let timerId = null;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const playRingtonePattern = () => {
      if (!isRunning) return;
      try {
        const now = ctx.currentTime;

        if (type === 'pulse') {
          // Soft Pulse Marimba: 6-note melodic sequence
          const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];
          notes.forEach((freq, i) => {
            const t = now + (i * 0.12);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.28);
          });
          timerId = setTimeout(playRingtonePattern, 2400);
        } else if (type === 'bright') {
          // Bright desk phone: Dual warble 1050Hz + 1280Hz
          for (let i = 0; i < 6; i++) {
            const t = now + (i * 0.08);
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(i % 2 === 0 ? 1050 : 1280, t);

            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.075);
          }
          timerId = setTimeout(playRingtonePattern, 2000);
        } else {
          // Classic corporate chime: 853Hz + 960Hz dual pulse
          const playClassicPulse = (offset) => {
            const t = now + offset;
            const o1 = ctx.createOscillator();
            const o2 = ctx.createOscillator();
            const g = ctx.createGain();

            o1.type = 'sine';
            o2.type = 'sine';
            o1.frequency.value = 853;
            o2.frequency.value = 960;

            g.gain.setValueAtTime(0.18, t);
            g.gain.linearRampToValueAtTime(0.16, t + 0.35);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

            o1.connect(g);
            o2.connect(g);
            g.connect(masterGain);

            o1.start(t);
            o2.start(t);
            o1.stop(t + 0.45);
            o2.stop(t + 0.45);
          };

          playClassicPulse(0);
          playClassicPulse(0.5);
          timerId = setTimeout(playRingtonePattern, 2800);
        }
      } catch (e) {
        console.warn('Ringtone pattern error', e);
      }
    };

    playRingtonePattern();

    activeRingtone = {
      stop: () => {
        isRunning = false;
        if (timerId) clearTimeout(timerId);
        try {
          masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
          masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
          setTimeout(() => { try { masterGain.disconnect(); } catch {} }, 60);
        } catch {}
      }
    };
  }

  function stopRingtone() {
    if (activeRingtone) {
      activeRingtone.stop();
      activeRingtone = null;
    }
  }

  /**
   * Plays a short test chime to verify audio output.
   */
  function playTestSound(type = 'classic') {
    const ctx = getAudioContext();
    if (!ctx) return;

    startRingtone(type);
    setTimeout(() => {
      stopRingtone();
    }, 1800);
  }

  return {
    getAudioContext,
    playDtmf,
    startRingback,
    stopRingback,
    startRingtone,
    stopRingtone,
    startRinging: startRingtone,
    stopRinging: stopRingtone,
    playTestSound,
    previewRingtone: playTestSound
  };
})();
