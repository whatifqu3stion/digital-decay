
let audioCtx: AudioContext | null = null;
let isMuted = false;

export const setGlobalMuted = (muted: boolean) => {
    isMuted = muted;
    if (audioCtx && audioCtx.state === 'running' && isMuted) {
        audioCtx.suspend();
    } else if (audioCtx && audioCtx.state === 'suspended' && !isMuted) {
        audioCtx.resume();
    }
};

const getAudioContext = () => {
    if (!audioCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
            audioCtx = new Ctx();
        }
    }
    return audioCtx;
};

export const playBootWhir = () => {
    if (isMuted) return;

    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const duration = 0.65;

        // 1. Snappy Spindle Whir (Fast spinup curve)
        const motorOsc = ctx.createOscillator();
        const motorGain = ctx.createGain();
        const motorFilter = ctx.createBiquadFilter();

        motorOsc.type = 'sawtooth';
        motorFilter.type = 'lowpass';
        motorFilter.frequency.setValueAtTime(140, now);
        motorFilter.frequency.exponentialRampToValueAtTime(650, now + 0.35);

        motorOsc.frequency.setValueAtTime(50, now);
        motorOsc.frequency.exponentialRampToValueAtTime(240, now + 0.35);

        motorGain.gain.setValueAtTime(0.0005, now);
        motorGain.gain.linearRampToValueAtTime(0.02, now + 0.1);
        motorGain.gain.setValueAtTime(0.02, now + 0.45);
        motorGain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

        motorOsc.connect(motorFilter);
        motorFilter.connect(motorGain);
        motorGain.connect(ctx.destination);

        motorOsc.start(now);
        motorOsc.stop(now + duration);

        // 2. Quick drive head chatter
        const clickTimes = [0.08, 0.16, 0.25, 0.36];
        clickTimes.forEach(t => {
            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            clickOsc.type = 'square';
            clickOsc.frequency.setValueAtTime(1100 + Math.random() * 300, now + t);
            clickGain.gain.setValueAtTime(0.008, now + t);
            clickGain.gain.exponentialRampToValueAtTime(0.0005, now + t + 0.015);
            clickOsc.connect(clickGain);
            clickGain.connect(ctx.destination);
            clickOsc.start(now + t);
            clickOsc.stop(now + t + 0.015);
        });

        // 3. Classic BIOS POST "OK" Beep
        const beepOsc = ctx.createOscillator();
        const beepGain = ctx.createGain();
        beepOsc.type = 'sine';
        beepOsc.frequency.setValueAtTime(1320, now + 0.48); // E6
        beepGain.gain.setValueAtTime(0, now + 0.48);
        beepGain.gain.linearRampToValueAtTime(0.03, now + 0.49);
        beepGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.58);
        beepOsc.connect(beepGain);
        beepGain.connect(ctx.destination);
        beepOsc.start(now + 0.48);
        beepOsc.stop(now + 0.58);

    } catch (e) {
        console.error("Boot sound failed:", e);
    }
};

export const playAudio = (type: 'click' | 'process' | 'error' | 'success' | 'halt' | 'start' | 'blip' | 'type') => {
    if (isMuted) return;

    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Try to resume if suspended (requires user interaction previously or currently)
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        switch (type) {
            case 'click':
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            case 'start':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(600, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'halt':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'process':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                gain.gain.setValueAtTime(0.02, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'blip':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1800, now);
                gain.gain.setValueAtTime(0.01, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                osc.start(now);
                osc.stop(now + 0.03);
                break;
            case 'success':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(554, now + 0.1); // C#
                osc.frequency.setValueAtTime(659, now + 0.2); // E
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.setValueAtTime(0.1, now + 0.2);
                gain.gain.linearRampToValueAtTime(0, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;
            case 'error':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.linearRampToValueAtTime(50, now + 0.3);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'type':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1200, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.03);
                gain.gain.setValueAtTime(0.005, now); // Significantly lowered from 0.02
                gain.gain.linearRampToValueAtTime(0, now + 0.03);
                osc.start(now);
                osc.stop(now + 0.03);
                break;
        }
    } catch (e) {
        // Audio context might be blocked or failed
        console.error("Audio Error:", e);
    }
};
