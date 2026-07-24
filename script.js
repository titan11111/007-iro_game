(() => {
    'use strict';

    const STORAGE_KEY = 'iro_game_v5';
    const LEGACY_STORAGE_KEYS = ['iro_game_v5', 'iro_game_v4', 'iro_game_v3', 'iro_game_v2', 'iro_game_v1'];
    const MUTE_KEY = 'iro_game_muted';
    const PALETTE_MAX = 16;
    const KOBITO_W = 36;
    const KOBITO_H = 48;

    /** パレット用：基本12原色（開発色は図鑑側） */
    const starterPalette = [
        { name: 'カドミウムレッド', rgb: [227, 38, 54], id: 'cadmium_red' },
        { name: 'ウルトラマリンブルー', rgb: [18, 10, 143], id: 'ultramarine_blue' },
        { name: 'カドミウムイエロー', rgb: [255, 237, 0], id: 'cadmium_yellow' },
        { name: 'バーントシエナ', rgb: [138, 54, 15], id: 'burnt_sienna' },
        { name: 'アイボリーブラック', rgb: [41, 36, 33], id: 'ivory_black' },
        { name: 'チタニウムホワイト', rgb: [255, 255, 255], id: 'titanium_white' },
        { name: 'ビリジャン', rgb: [64, 130, 109], id: 'viridian' },
        { name: 'バーントアンバー', rgb: [130, 102, 68], id: 'burnt_umber' },
        { name: 'コバルトブルー', rgb: [0, 71, 171], id: 'cobalt_blue' },
        { name: 'セルリアンブルー', rgb: [0, 150, 220], id: 'cerulean_blue' },
        { name: 'レモンイエロー', rgb: [255, 248, 0], id: 'lemon_yellow' },
        { name: 'イエローオーカー', rgb: [227, 171, 59], id: 'yellow_ochre' }
    ];

    /** 基本12色ごとの小人タイプ（見た目を固定で差別化） */
    const ARCHETYPE_BY_ID = {
        cadmium_red: 'fierce',
        ultramarine_blue: 'sage',
        cadmium_yellow: 'sunny',
        burnt_sienna: 'earth',
        ivory_black: 'shadow',
        titanium_white: 'pure',
        viridian: 'gentle',
        burnt_umber: 'warm',
        cobalt_blue: 'knight',
        cerulean_blue: 'breeze',
        lemon_yellow: 'spark',
        yellow_ochre: 'earth'
    };

    function isMixedSpirit(spirit) {
        return !!(spirit && spirit.parents && spirit.parents.length === 2);
    }

    /** 図鑑用: RGBを8段階に量子化して同一色判定 */
    function rgbKey(rgb) {
        if (!rgb || rgb.length !== 3) return '';
        return rgb.map((v) => Math.round(v / 8) * 8).join(',');
    }

    function isStarterRgb(rgb) {
        return starterPalette.some((s) => rgbKey(s.rgb) === rgbKey(rgb));
    }

    /** 混色で生まれた「新色」のみ（基本12色と同色は除外） */
    function isDevelopedColor(spirit) {
        return isMixedSpirit(spirit) && !isStarterRgb(spirit.rgb);
    }

    function dedupeCollectionByColor(list) {
        const seen = new Set();
        const out = [];
        list.forEach((spirit) => {
            if (!isDevelopedColor(spirit)) return;
            const key = rgbKey(spirit.rgb);
            if (seen.has(key)) return;
            seen.add(key);
            out.push(spirit);
        });
        return out;
    }

    function isStarterId(id) {
        return starterPalette.some((s) => s.id === id);
    }

    const el = {
        startOverlay: document.getElementById('startOverlay'),
        startButton: document.getElementById('startButton'),
        muteButton: document.getElementById('muteButton'),
        basicColors: document.getElementById('basicColors'),
        collectionGrid: document.getElementById('collectionGrid'),
        collectionCount: document.getElementById('collectionCount'),
        slot1: document.getElementById('slot1'),
        slot2: document.getElementById('slot2'),
        resultSlot: document.getElementById('resultSlot'),
        mixButton: document.getElementById('mixButton'),
        clearSlots: document.getElementById('clearSlots'),
        statusText: document.getElementById('statusText'),
        tabPalette: document.getElementById('tabPalette'),
        tabBook: document.getElementById('tabBook'),
        panelPalette: document.getElementById('panelPalette'),
        panelBook: document.getElementById('panelBook'),
        nameRitual: document.getElementById('nameRitual'),
        ritualColor: document.getElementById('ritualColor'),
        ritualParents: document.getElementById('ritualParents'),
        spiritName: document.getElementById('spiritName'),
        nameButton: document.getElementById('nameButton'),
        nameCancel: document.getElementById('nameCancel'),
        detailSheet: document.getElementById('detailSheet'),
        detailName: document.getElementById('detailName'),
        detailColor: document.getElementById('detailColor'),
        detailRgb: document.getElementById('detailRgb'),
        detailParents: document.getElementById('detailParents'),
        detailUse: document.getElementById('detailUse'),
        detailClose: document.getElementById('detailClose'),
        toast: document.getElementById('toast'),
        bgm: document.getElementById('bgm'),
        app: document.querySelector('.app')
    };

    const gameState = {
        selectedColors: [null, null],
        palette: [],
        collection: [],
        currentMixResult: null,
        detailSpirit: null,
        muted: false,
        started: false
    };

    let toastTimer = 0;
    let lastTouchEnd = 0;
    let audioCtx = null;
    const kobitoWalkers = [];
    let kobitoRaf = 0;
    const pointerSense = { x: 0, y: 0, on: false };

    /* ---------- WebAudio color SFX ---------- */
    function getAudioCtx() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!audioCtx) audioCtx = new AC();
        return audioCtx;
    }

    function unlockSfx() {
        const ctx = getAudioCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        // iOS unlock: silent buffer
        try {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
        } catch (_) { /* ignore */ }
    }

    function sfxAllowed() {
        return gameState.started && !gameState.muted && !!getAudioCtx();
    }

    function voiceFromRgb(rgb) {
        const o = rgbToOklch(rgb[0], rgb[1], rgb[2]);
        const L = o.L;
        const C = o.C;
        const H = o.H;

        // 色相 → 音高（赤め低め / 青め高め）
        let freq = 260 * Math.pow(2, (H / 360) * 1.75);
        // 明度で微調整（明るいほど少し高く）
        freq *= 0.85 + L * 0.35;

        let type = 'sine';
        if (C > 0.1) type = 'triangle';
        if (C > 0.16 && (H < 35 || H > 330)) type = 'sawtooth'; // 鮮やかな赤系
        if (H >= 70 && H < 160 && C > 0.08) type = 'triangle'; // 緑系
        if (H >= 200 && H < 280) type = 'sine'; // 青系は澄んだサイン

        // 黒・茶・白の特別扱い
        if (L < 0.22) {
            freq = 90 + L * 80;
            type = 'triangle';
        } else if (L > 0.92 && C < 0.06) {
            freq = 980 + L * 200;
            type = 'sine';
        } else if (C < 0.07 && L < 0.55) {
            freq = 140 + L * 120;
            type = 'triangle';
        }

        const gain = L < 0.22 ? 0.12 : L > 0.92 ? 0.07 : 0.09 + Math.min(C, 0.2) * 0.25;
        const dur = L < 0.22 ? 0.16 : 0.09 + Math.min(C, 0.2) * 0.12;
        return { freq, type, gain, dur, L, C, H };
    }

    function playTone(freq, type, gain, dur, when, detune) {
        const ctx = getAudioCtx();
        if (!ctx || !sfxAllowed()) return;
        const t0 = when != null ? when : ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (detune) osc.detune.setValueAtTime(detune, t0);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(4200, freq * 4.5), t0);
        const peak = Math.max(0.01, gain);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(filter);
        filter.connect(g);
        g.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    function playNoiseThud(when, gain) {
        const ctx = getAudioCtx();
        if (!ctx || !sfxAllowed()) return;
        const t0 = when != null ? when : ctx.currentTime;
        const len = Math.floor(ctx.sampleRate * 0.08);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 380;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain || 0.08, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
        src.connect(filter);
        filter.connect(g);
        g.connect(ctx.destination);
        src.start(t0);
        src.stop(t0 + 0.1);
    }

    /** 色タップのピコッ */
    function playColorPick(rgb) {
        const ctx = getAudioCtx();
        if (!ctx || !sfxAllowed()) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const v = voiceFromRgb(rgb);
        if (v.L < 0.22) {
            playNoiseThud(ctx.currentTime, 0.07);
            playTone(v.freq, v.type, v.gain, v.dur, ctx.currentTime, 0);
            return;
        }
        playTone(v.freq, v.type, v.gain, v.dur, ctx.currentTime, 0);
        // 少し高い倍音で「ピコ」感
        playTone(v.freq * 2.02, 'sine', v.gain * 0.35, v.dur * 0.85, ctx.currentTime + 0.01, 8);
    }

    /** 混色：両親の音→結果色の和音 */
    function playColorMix(rgb1, rgb2, rgbOut) {
        const ctx = getAudioCtx();
        if (!ctx || !sfxAllowed()) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const a = voiceFromRgb(rgb1);
        const b = voiceFromRgb(rgb2);
        const m = voiceFromRgb(rgbOut);
        const t0 = ctx.currentTime;

        playTone(a.freq, a.type, a.gain * 0.85, 0.1, t0, 0);
        playTone(b.freq, b.type, b.gain * 0.85, 0.1, t0 + 0.08, 0);

        // 混ざるスイープ感
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime((a.freq + b.freq) / 2, t0 + 0.16);
        osc.frequency.exponentialRampToValueAtTime(Math.max(80, m.freq), t0 + 0.42);
        g.gain.setValueAtTime(0.0001, t0 + 0.16);
        g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.22);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t0 + 0.16);
        osc.stop(t0 + 0.52);

        // 結果の和音（5度）
        playTone(m.freq, m.type, m.gain * 1.1, 0.22, t0 + 0.38, 0);
        playTone(m.freq * 1.5, 'sine', m.gain * 0.55, 0.2, t0 + 0.4, 0);
        if (m.L < 0.25) playNoiseThud(t0 + 0.38, 0.05);
    }

    function playNameSuccess(rgb) {
        const ctx = getAudioCtx();
        if (!ctx || !sfxAllowed()) return;
        const v = voiceFromRgb(rgb);
        const t0 = ctx.currentTime;
        playTone(v.freq, 'sine', 0.08, 0.12, t0, 0);
        playTone(v.freq * 1.25, 'sine', 0.07, 0.14, t0 + 0.08, 0);
        playTone(v.freq * 1.5, 'triangle', 0.06, 0.18, t0 + 0.16, 0);
    }

    /* ---------- OKLCH color math ---------- */
    function srgbToLinear(c) {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }

    function linearToSrgb(c) {
        const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
        return Math.round(Math.min(255, Math.max(0, x * 255)));
    }

    function rgbToOklch(r, g, b) {
        const lr = srgbToLinear(r);
        const lg = srgbToLinear(g);
        const lb = srgbToLinear(b);
        const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
        const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
        const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
        const l_ = Math.cbrt(l);
        const m_ = Math.cbrt(m);
        const s_ = Math.cbrt(s);
        const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
        const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
        const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
        const C = Math.sqrt(a * a + b2 * b2);
        let H = Math.atan2(b2, a) * 180 / Math.PI;
        if (H < 0) H += 360;
        return { L, C, H };
    }

    function oklchToRgb(L, C, H) {
        const hRad = (H * Math.PI) / 180;
        const a = C * Math.cos(hRad);
        const b2 = C * Math.sin(hRad);
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b2;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b2;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b2;
        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;
        const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
    }

    /** 油絵具っぽくOKLCH補間＋わずかな濁り */
    function mixInOklch(rgb1, rgb2, t = 0.5) {
        const a = rgbToOklch(rgb1[0], rgb1[1], rgb1[2]);
        const b = rgbToOklch(rgb2[0], rgb2[1], rgb2[2]);
        let dh = b.H - a.H;
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;
        const wA = a.C;
        const wB = b.C;
        const wSum = wA + wB;
        const H = wSum < 1e-6 ? a.H : (a.H * wA + (a.H + dh) * wB) / wSum;
        const L = a.L * (1 - t) + b.L * t;
        const C = (a.C * (1 - t) + b.C * t) * 0.9;
        return oklchToRgb(L, C, H);
    }

    function textColorForRgb(rgb) {
        const brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
        return brightness > 140 ? '#111' : '#fff';
    }

    function rgbCss(rgb) {
        return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    }

    /* ---------- View Transitions / Popover helpers ---------- */
    function withViewTransition(update) {
        if (typeof document.startViewTransition === 'function') {
            try {
                return document.startViewTransition(update);
            } catch (_) {
                /* fall through */
            }
        }
        update();
        return null;
    }

    function showModal(node) {
        if (!node) return;
        node.removeAttribute('hidden');
        node.hidden = false;
        node.classList.add('is-open');
        node.setAttribute('aria-hidden', 'false');
    }

    function hideModal(node) {
        if (!node) return;
        node.classList.remove('is-open');
        node.hidden = true;
        node.setAttribute('hidden', '');
        node.setAttribute('aria-hidden', 'true');
    }

    /* 互換エイリアス */
    function showPopover(node) { showModal(node); }
    function hidePopover(node) { hideModal(node); }

    function vibrate(ms) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    function showToast(message) {
        el.toast.textContent = message;
        el.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.toast.hidden = true;
        }, 2200);
    }

    function setStatus(message) {
        el.statusText.textContent = message || '精霊を選んで混ぜよう';
    }

    function syncBookPanelHeight() {
        if (!el.app || el.panelBook.hidden) return;
        const appH = el.app.clientHeight;
        const chromeH =
            (el.app.querySelector('.topbar')?.offsetHeight || 0) +
            (el.app.querySelector('.mix')?.offsetHeight || 0) +
            (el.app.querySelector('.tabs')?.offsetHeight || 0) +
            24;
        const bookH = Math.max(120, Math.floor((appH - chromeH) * (2 / 3)));
        el.panelBook.style.height = `${bookH}px`;
        el.panelBook.style.flex = '0 0 auto';
        requestAnimationFrame(() => {
            kobitoWalkers.forEach((w) => clampKobito(w, true));
        });
    }

    function switchTab(name) {
        const isPalette = name === 'palette';
        el.tabPalette.classList.toggle('is-on', isPalette);
        el.tabBook.classList.toggle('is-on', !isPalette);
        el.panelPalette.hidden = !isPalette;
        el.panelBook.hidden = isPalette;
        el.panelPalette.classList.toggle('is-on', isPalette);
        el.panelBook.classList.toggle('is-on', !isPalette);
        if (el.app) el.app.classList.toggle('app--book', !isPalette);
        if (isPalette) {
            el.panelBook.style.height = '';
            el.panelBook.style.flex = '';
        } else {
            syncBookPanelHeight();
            ensureKobitoLoop();
            requestAnimationFrame(() => {
                kobitoWalkers.forEach((w) => clampKobito(w, true));
            });
        }
    }

    /* ---------- Persistence / Audio ---------- */
    function loadMuted() {
        try {
            return localStorage.getItem(MUTE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function saveMuted() {
        try {
            localStorage.setItem(MUTE_KEY, gameState.muted ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    function purgeLegacyStorage() {
        LEGACY_STORAGE_KEYS.forEach((key) => {
            try {
                localStorage.removeItem(key);
            } catch (_) { /* ignore */ }
        });
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (_) { /* ignore */ }
    }

    /** 図鑑は毎回スタート0。保存・復元しない */
    function saveGame() {
        purgeLegacyStorage();
    }

    /** パレットは混色用の基本12色固定（開発色は図鑑から選ぶ） */
    function resetPaletteToStarters() {
        gameState.palette = starterPalette.map((spirit) => ({ ...spirit }));
    }

    function updateMuteUi() {
        el.muteButton.textContent = gameState.muted ? '🔇' : '🔊';
        el.muteButton.setAttribute('aria-pressed', gameState.muted ? 'true' : 'false');
        if (el.bgm) el.bgm.muted = gameState.muted;
    }

    function unlockAndPlayBgm() {
        if (!el.bgm) return;
        el.bgm.volume = 0.45;
        el.bgm.muted = gameState.muted;
        const play = el.bgm.play();
        if (play && typeof play.catch === 'function') play.catch(() => {});
    }

    function resumeBgmIfNeeded() {
        if (!gameState.started || gameState.muted || !el.bgm) return;
        if (el.bgm.paused) unlockAndPlayBgm();
    }

    /* ---------- Game core ---------- */
    function findSpiritById(id) {
        return (
            gameState.palette.find((s) => s.id === id) ||
            gameState.collection.find((s) => s.id === id) ||
            starterPalette.find((s) => s.id === id) ||
            null
        );
    }

    function hashString(str) {
        let h = 2166136261;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return Math.abs(h >>> 0);
    }

    function parentArchetype(spirit) {
        if (!spirit) return null;
        if (spirit.id && ARCHETYPE_BY_ID[spirit.id]) {
            return ARCHETYPE_BY_ID[spirit.id];
        }
        return personalityFromRgb(spirit.rgb);
    }

    const ARCHETYPE_MORPH = {
        warm: ['earth', 'sunny', 'fierce', 'knight'],
        earth: ['warm', 'shadow', 'sage', 'knight'],
        sunny: ['spark', 'pure', 'fierce', 'breeze'],
        fierce: ['knight', 'shadow', 'sunny', 'warm'],
        gentle: ['breeze', 'pure', 'sage', 'mystic'],
        calm: ['sky', 'sage', 'breeze', 'knight'],
        sky: ['breeze', 'calm', 'gentle', 'pure'],
        sage: ['knight', 'mystic', 'shadow', 'calm'],
        knight: ['fierce', 'sage', 'earth', 'shadow'],
        breeze: ['gentle', 'sky', 'spark', 'pure'],
        spark: ['sunny', 'breeze', 'fierce', 'mystic'],
        shadow: ['mystic', 'fierce', 'sage', 'earth'],
        pure: ['sunny', 'gentle', 'breeze', 'spark'],
        mystic: ['sage', 'shadow', 'gentle', 'spark']
    };

    const ALL_ARCHETYPES = [
        'fierce', 'sage', 'sunny', 'earth', 'shadow', 'pure', 'gentle', 'warm',
        'knight', 'breeze', 'spark', 'calm', 'sky', 'mystic'
    ];

    const ARCHETYPE_PROP = {
        fierce: 'horn', sunny: 'star', spark: 'star', earth: 'band', shadow: 'cape',
        pure: 'bow', gentle: 'leaf', warm: 'band', calm: 'cape', sky: 'bow',
        sage: 'leaf', knight: 'horn', breeze: 'leaf', mystic: 'star'
    };

    const ARCHETYPE_MOTION = {
        fierce: { mood: 'bounce', motion: 'ember', speed: 1.45 },
        sunny: { mood: 'dash', motion: 'sunburst', speed: 1.7 },
        spark: { mood: 'zip', motion: 'sunburst', speed: 1.85 },
        earth: { mood: 'heavy', motion: 'gloom', speed: 0.68 },
        shadow: { mood: 'creep', motion: 'gloom', speed: 0.58 },
        pure: { mood: 'flutter', motion: 'drift', speed: 0.88 },
        gentle: { mood: 'sway', motion: 'leaf', speed: 0.92 },
        warm: { mood: 'pulse', motion: 'pulse', speed: 1.05 },
        calm: { mood: 'orbit', motion: 'wave', speed: 0.76 },
        sky: { mood: 'float', motion: 'wave', speed: 0.82 },
        sage: { mood: 'drift-up', motion: 'leaf', speed: 0.7 },
        knight: { mood: 'hop', motion: 'ember', speed: 1.15 },
        breeze: { mood: 'flutter', motion: 'wave', speed: 0.95 },
        mystic: { mood: 'orbit', motion: 'mystic', speed: 1.02 }
    };

    const MOOD_VARIANTS = ['float', 'hop', 'flutter', 'zip', 'sway', 'orbit', 'bounce', 'drift-up', 'dash', 'pulse'];

    function motionFromSpirit(spirit) {
        const archetype = resolveArchetype(spirit);
        const h = hashString(`${spirit.id}|${spirit.name}`);
        const base = ARCHETYPE_MOTION[archetype] || { mood: 'float', motion: 'drift', speed: 1 };
        const o = rgbToOklch(spirit.rgb[0], spirit.rgb[1], spirit.rgb[2]);
        const phase = ((h % 628) / 100);
        let { mood, motion, speed } = base;

        if (o.L < 0.28) {
            mood = 'creep';
            motion = 'gloom';
            speed *= 0.85;
        } else if (o.C < 0.05) {
            mood = 'flutter';
            motion = 'drift';
        } else if (o.H >= 265 && o.H < 320 && motion === 'wave') {
            motion = 'mystic';
        }

        /* 精霊ごとに上下・斜め・跳ねなどをばらす */
        if (h % 5 === 0) {
            mood = MOOD_VARIANTS[h % MOOD_VARIANTS.length];
        } else if (h % 3 === 1 && mood === 'heavy') {
            mood = 'creep';
        }

        speed = Math.max(0.35, Math.min(1.4, speed * (0.85 + (h % 40) / 100) * (2 / 3)));
        return { mood, motion, speed, phase, archetype };
    }

    const POSES = ['cheer', 'neutral', 'shy', 'strong', 'wave', 'think'];
    const FACES = ['smile', 'grin', 'shy', 'fierce', 'sleepy', 'dot'];

    function resolveMixedArchetype(spirit) {
        const p1 = findSpiritById(spirit.parents[0]);
        const p2 = findSpiritById(spirit.parents[1]);
        const a1 = parentArchetype(p1) || personalityFromRgb(spirit.rgb);
        const a2 = parentArchetype(p2) || personalityFromRgb(spirit.rgb);
        const h = hashString(`${spirit.id}|${spirit.parents[0]}|${spirit.parents[1]}`);

        if (a1 !== a2) {
            const options = [a1, a2];
            const morphs = ARCHETYPE_MORPH[a1] || ARCHETYPE_MORPH[a2] || [];
            if (morphs.length) options.push(morphs[h % morphs.length]);
            return options[h % options.length];
        }

        const pool = (ARCHETYPE_MORPH[a1] || ALL_ARCHETYPES).filter((t) => t !== a1);
        return pool[h % pool.length] || ALL_ARCHETYPES[h % ALL_ARCHETYPES.length];
    }

    function buildSpiritVisual(spirit) {
        const archetype = resolveArchetype(spirit);
        const h = hashString(`${spirit.id}|${spirit.name}|${rgbKey(spirit.rgb)}`);
        let accentRgb = shadeRgb(spirit.rgb, -0.32);
        let trimRgb = shadeRgb(spirit.rgb, 0.28);

        if (isMixedSpirit(spirit)) {
            const p1 = findSpiritById(spirit.parents[0]);
            const p2 = findSpiritById(spirit.parents[1]);
            if (p1 && p2) {
                accentRgb = h % 2 === 0 ? p1.rgb : p2.rgb;
                trimRgb = h % 2 === 0 ? p2.rgb : p1.rgb;
            } else if (p1) {
                accentRgb = p1.rgb;
            } else if (p2) {
                accentRgb = p2.rgb;
            }
        }

        const prop = ARCHETYPE_PROP[archetype] || ['bow', 'horn', 'cape', 'star', 'leaf', 'band'][h % 6];
        const variant = h % 3;
        return {
            archetype,
            accentRgb,
            trimRgb,
            prop,
            pose: POSES[(h + archetype.length) % POSES.length],
            face: FACES[(h >> 3) % FACES.length],
            variant,
            scale: 0.88 + (h % 7) * 0.035,
            tilt: ((h % 17) - 8) * 0.8,
            h
        };
    }

    function resolveArchetype(spirit) {
        if (spirit && spirit.id && ARCHETYPE_BY_ID[spirit.id]) {
            return ARCHETYPE_BY_ID[spirit.id];
        }
        if (isMixedSpirit(spirit)) {
            return resolveMixedArchetype(spirit);
        }
        return personalityFromRgb(spirit.rgb);
    }

    function personalityFromRgb(rgb) {
        const o = rgbToOklch(rgb[0], rgb[1], rgb[2]);
        if (o.L < 0.22) return 'shadow';
        if (o.L > 0.9 && o.C < 0.08) return 'pure';
        if (o.C < 0.07 && o.L < 0.55) return 'earth';
        if (o.H < 28 || o.H > 345) return o.C > 0.14 ? 'fierce' : 'warm';
        if (o.H >= 28 && o.H < 70) return o.C > 0.12 ? 'sunny' : 'warm';
        if (o.H >= 70 && o.H < 160) return 'gentle';
        if (o.H >= 160 && o.H < 210) return 'sky';
        if (o.H >= 210 && o.H < 265) return 'calm';
        if (o.H >= 265 && o.H < 320) return 'mystic';
        return 'warm';
    }

    function shadeRgb(rgb, amount) {
        const target = amount >= 0 ? [255, 255, 255] : [20, 16, 18];
        const t = Math.min(1, Math.abs(amount));
        return [
            Math.round(rgb[0] + (target[0] - rgb[0]) * t),
            Math.round(rgb[1] + (target[1] - rgb[1]) * t),
            Math.round(rgb[2] + (target[2] - rgb[2]) * t)
        ];
    }

    /** 図鑑カード＝混色スロットと同じ実色（案2） */
    function cardBackdropRgb(rgb) {
        return [rgb[0], rgb[1], rgb[2]];
    }

    /** 妖精本体：実色カードの上で光る淡色シルエット */
    function figureBodyRgb(rgb) {
        const o = rgbToOklch(rgb[0], rgb[1], rgb[2]);
        const L = Math.min(0.93, Math.max(0.62, o.L * 0.35 + 0.62));
        const C = Math.max(0.045, Math.min(0.14, o.C * 0.65 + 0.03));
        return oklchToRgb(L, C, o.H);
    }

    /** 飾り・アクセント：本体より少し濃く色味を残す */
    function figureAccentRgb(rgb) {
        const o = rgbToOklch(rgb[0], rgb[1], rgb[2]);
        const L = Math.min(0.78, Math.max(0.42, o.L * 0.55 + 0.38));
        const C = Math.max(0.07, Math.min(0.2, o.C * 1.05 + 0.04));
        return oklchToRgb(L, C, o.H);
    }

    function drawKobitoFace(add, ink, blush, person, pose, face) {
        const useFace = face || 'smile';
        if (useFace === 'fierce' || person === 'fierce' || pose === 'strong') {
            add('path', { d: 'M19 14 L21.5 16 L19 18', stroke: ink, 'stroke-width': '1.3', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M29 14 L26.5 16 L29 18', stroke: ink, 'stroke-width': '1.3', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M20 20 Q24 23 28 20', stroke: ink, 'stroke-width': '1.4', fill: 'none', 'stroke-linecap': 'round' });
        } else if (useFace === 'shy' || person === 'shadow' || pose === 'shy') {
            add('path', { d: 'M19 15.5 Q20.5 14.5 22 15.5', stroke: ink, 'stroke-width': '1.2', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M26 15.5 Q27.5 14.5 29 15.5', stroke: ink, 'stroke-width': '1.2', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M22 20 Q24 19.5 26 20', stroke: ink, 'stroke-width': '1.1', fill: 'none', 'stroke-linecap': 'round' });
        } else if (useFace === 'sleepy' || person === 'calm') {
            add('path', { d: 'M18.5 15.5 Q20.5 14.2 22.5 15.5', stroke: ink, 'stroke-width': '1.3', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M25.5 15.5 Q27.5 14.2 29.5 15.5', stroke: ink, 'stroke-width': '1.3', fill: 'none', 'stroke-linecap': 'round' });
            add('path', { d: 'M21 19.5 Q24 21 27 19.5', stroke: ink, 'stroke-width': '1.2', fill: 'none', 'stroke-linecap': 'round' });
        } else if (useFace === 'dot' || person === 'earth') {
            add('rect', { x: '19', y: '14.5', width: '2.4', height: '2.4', rx: '0.5', fill: ink });
            add('rect', { x: '26.6', y: '14.5', width: '2.4', height: '2.4', rx: '0.5', fill: ink });
            add('path', { d: 'M21 20 Q24 21.2 27 20', stroke: ink, 'stroke-width': '1.3', fill: 'none', 'stroke-linecap': 'round' });
        } else if (useFace === 'grin' || person === 'sunny' || pose === 'cheer') {
            add('circle', { cx: '20.5', cy: '15.5', r: '1.5', fill: ink });
            add('circle', { cx: '27.5', cy: '15.5', r: '1.5', fill: ink });
            add('path', { d: 'M19.5 19.5 Q24 24 28.5 19.5', stroke: ink, 'stroke-width': '1.5', fill: 'none', 'stroke-linecap': 'round' });
        } else {
            add('circle', { cx: '20.5', cy: '15.8', r: '1.35', fill: ink });
            add('circle', { cx: '27.5', cy: '15.8', r: '1.35', fill: ink });
            if (person === 'gentle' || person === 'pure') {
                add('circle', { cx: '18.2', cy: '18.2', r: '1.6', fill: blush });
                add('circle', { cx: '29.8', cy: '18.2', r: '1.6', fill: blush });
            }
            add('path', { d: 'M21 20 Q24 22.2 27 20', stroke: ink, 'stroke-width': '1.2', fill: 'none', 'stroke-linecap': 'round' });
        }
    }

    function drawKobitoProp(add, prop, accent, trim, ink, person) {
        if (prop === 'horn') {
            add('path', { d: 'M17 10 L19 2 L22 11 Z', fill: accent });
            add('path', { d: 'M31 10 L29 2 L26 11 Z', fill: accent });
        } else if (prop === 'star') {
            add('path', {
                d: 'M24 2 L26 8 L32 8 L27 12 L29 18 L24 14 L19 18 L21 12 L16 8 L22 8 Z',
                fill: trim,
                class: 'kobito-prop-star'
            });
        } else if (prop === 'cape') {
            add('path', {
                d: 'M12 18 Q24 10 36 18 L38 50 Q24 58 10 50 Z',
                fill: accent,
                opacity: '0.88',
                class: 'kobito-prop-cape'
            });
        } else if (prop === 'leaf') {
            add('path', { d: 'M14 12 Q24 4 34 12 L30 16 Q24 12 18 16 Z', fill: accent });
            add('ellipse', { cx: '24', cy: '6', rx: '3', ry: '5', fill: trim, transform: 'rotate(0 24 6)' });
        } else if (prop === 'band') {
            add('rect', { x: '13', y: '12', width: '22', height: '5', rx: '2', fill: accent });
            add('rect', { x: '22', y: '8', width: '4', height: '6', rx: '1', fill: trim });
        } else if (prop === 'bow') {
            add('circle', { cx: '24', cy: '9', r: '2.6', fill: trim });
            add('path', { d: 'M16 9 Q24 14 32 9', stroke: accent, 'stroke-width': '2.4', fill: 'none', 'stroke-linecap': 'round' });
        }
        if (person === 'breeze') {
            add('path', {
                d: 'M4 28 Q0 34 4 40',
                stroke: accent,
                'stroke-width': '2.8',
                fill: 'none',
                'stroke-linecap': 'round',
                class: 'kobito-wing'
            });
            add('path', {
                d: 'M44 28 Q48 34 44 40',
                stroke: trim,
                'stroke-width': '2.8',
                fill: 'none',
                'stroke-linecap': 'round',
                class: 'kobito-wing'
            });
        }
    }

    function drawKobitoArms(add, fill, person, pose) {
        if (pose === 'cheer' || person === 'sunny') {
            add('path', { d: 'M15 30 Q8 22 5 16', stroke: fill, 'stroke-width': '3.8', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M33 30 Q40 22 43 16', stroke: fill, 'stroke-width': '3.8', 'stroke-linecap': 'round', fill: 'none' });
        } else if (pose === 'wave') {
            add('path', { d: 'M16 28 Q10 34 9 41', stroke: fill, 'stroke-width': '3.6', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M33 28 Q42 20 44 14', stroke: fill, 'stroke-width': '3.8', 'stroke-linecap': 'round', fill: 'none' });
        } else if (pose === 'think') {
            add('path', { d: 'M16 28 Q12 32 14 38', stroke: fill, 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M33 28 Q38 24 36 18', stroke: fill, 'stroke-width': '3.6', 'stroke-linecap': 'round', fill: 'none' });
        } else if (pose === 'strong' || person === 'fierce') {
            add('path', { d: 'M15 28 Q8 32 7 40', stroke: fill, 'stroke-width': '4', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M33 28 Q40 30 42 24', stroke: fill, 'stroke-width': '4', 'stroke-linecap': 'round', fill: 'none' });
        } else if (pose === 'shy') {
            add('path', { d: 'M16 30 Q12 34 11 38', stroke: fill, 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M32 30 Q36 34 37 38', stroke: fill, 'stroke-width': '3.4', 'stroke-linecap': 'round', fill: 'none' });
        } else if (person === 'gentle' || person === 'pure') {
            add('path', { d: 'M16 30 Q10 36 9 42', stroke: fill, 'stroke-width': '3.6', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M32 30 Q38 36 39 42', stroke: fill, 'stroke-width': '3.6', 'stroke-linecap': 'round', fill: 'none' });
        } else {
            add('path', { d: 'M16 28 Q10 34 9 41', stroke: fill, 'stroke-width': '3.8', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M32 28 Q38 34 39 41', stroke: fill, 'stroke-width': '3.8', 'stroke-linecap': 'round', fill: 'none' });
        }
    }

    function createKobitoSvg(spirit) {
        const ns = 'http://www.w3.org/2000/svg';
        const rgb = spirit.rgb;
        const bodyRgb = figureBodyRgb(rgb);
        const visual = buildSpiritVisual(spirit);
        const person = visual.archetype;
        const pose = visual.pose;
        const motionInfo = motionFromSpirit(spirit);
        const fill = rgbCss(bodyRgb);
        const deep = rgbCss(figureAccentRgb(rgb));
        const soft = rgbCss(shadeRgb(bodyRgb, 0.35));
        const accent = rgbCss(figureAccentRgb(visual.accentRgb));
        const trim = rgbCss(shadeRgb(bodyRgb, 0.45));
        const ink = '#1e161c';
        const blush = person === 'pure' || person === 'sunny' || person === 'gentle'
            ? 'rgba(255,140,160,0.55)'
            : 'rgba(0,0,0,0)';

        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 48 64');
        svg.setAttribute('class', 'kobito-svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.dataset.archetype = person;
        svg.dataset.pose = pose;
        svg.dataset.motion = motionInfo.motion;
        svg.dataset.face = visual.face;

        const add = (tag, attrs) => {
            const n = document.createElementNS(ns, tag);
            Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
            svg.appendChild(n);
            return n;
        };

        // 影（動いてる感のため少し濃く）
        add('ellipse', { cx: '24', cy: '60', rx: '12', ry: '2.8', fill: 'rgba(0,0,0,0.28)' });

        // 個性ごとの後ろ飾り
        if (person === 'fierce') {
            add('path', { d: 'M10 28 Q6 20 12 16 L16 24 Z', fill: accent });
            add('path', { d: 'M38 28 Q42 20 36 16 L32 24 Z', fill: accent });
        } else if (person === 'calm' || person === 'sky') {
            add('path', {
                d: 'M18 22 Q8 30 10 44 Q18 40 24 36 Q30 40 38 44 Q40 30 30 22 Z',
                fill: accent,
                opacity: '0.85'
            });
        } else if (person === 'shadow') {
            add('path', { d: 'M12 18 Q24 8 36 18 L34 46 Q24 52 14 46 Z', fill: deep });
        } else if (person === 'mystic') {
            add('path', { d: 'M24 6 L26 12 L32 12 L27 16 L29 22 L24 18 L19 22 L21 16 L16 12 L22 12 Z', fill: accent });
        } else if (person === 'gentle') {
            add('ellipse', { cx: '15', cy: '12', rx: '5', ry: '3.2', fill: accent, transform: 'rotate(-28 15 12)' });
            add('ellipse', { cx: '33', cy: '12', rx: '5', ry: '3.2', fill: accent, transform: 'rotate(28 33 12)' });
        } else if (visual.prop === 'cape') {
            add('path', { d: 'M14 20 Q24 14 34 20 L36 48 Q24 54 12 48 Z', fill: accent, opacity: '0.82' });
        }

        // 脚
        if (person === 'earth' || person === 'fierce' || pose === 'strong') {
            add('rect', { x: '16', y: '44', width: '5.5', height: '12', rx: '2', fill: deep });
            add('rect', { x: '26.5', y: '44', width: '5.5', height: '12', rx: '2', fill: deep });
            add('rect', { x: '14.5', y: '54', width: '8', height: '3.5', rx: '1.5', fill: trim });
            add('rect', { x: '25.5', y: '54', width: '8', height: '3.5', rx: '1.5', fill: trim });
        } else if (person === 'pure' || person === 'sunny' || pose === 'cheer') {
            add('path', { d: 'M18 44 Q16 54 14 56', stroke: fill, 'stroke-width': '4', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M30 44 Q32 54 34 56', stroke: fill, 'stroke-width': '4', 'stroke-linecap': 'round', fill: 'none' });
        } else {
            add('path', { d: 'M19 43 Q17 52 15 56', stroke: fill, 'stroke-width': '4.2', 'stroke-linecap': 'round', fill: 'none' });
            add('path', { d: 'M29 43 Q31 52 33 56', stroke: fill, 'stroke-width': '4.2', 'stroke-linecap': 'round', fill: 'none' });
        }

        // 胴体
        if (person === 'fierce') {
            add('path', { d: 'M15 24 L33 24 L36 44 L12 44 Z', fill });
            add('path', { d: 'M24 24 L34 18 L36 34 L28 30 Z', fill: accent, opacity: '0.9' });
        } else if (person === 'sunny' || person === 'pure') {
            add('ellipse', { cx: '24', cy: '34', rx: '11', ry: '12', fill });
            add('ellipse', { cx: '24', cy: '38', rx: '7', ry: '2.2', fill: trim, opacity: '0.55' });
        } else if (person === 'earth') {
            add('rect', { x: '14', y: '24', width: '20', height: '22', rx: '7', fill });
            add('rect', { x: '14', y: '36', width: '20', height: '5', fill: accent, opacity: '0.55' });
        } else if (person === 'gentle') {
            add('path', { d: 'M16 24 Q24 22 32 24 L34 42 Q24 48 14 42 Z', fill });
            add('path', { d: 'M18 30 Q24 28 30 30', stroke: accent, 'stroke-width': '2.2', fill: 'none', 'stroke-linecap': 'round' });
        } else if (person === 'shadow') {
            add('path', { d: 'M16 22 L32 22 L34 46 L14 46 Z', fill });
        } else if (person === 'calm' || person === 'sky') {
            add('path', { d: 'M17 23 Q24 21 31 23 L33 44 Q24 48 15 44 Z', fill });
            add('path', { d: 'M17 31 L31 31', stroke: accent, 'stroke-width': '2', 'stroke-linecap': 'round' });
        } else if (person === 'mystic') {
            add('path', { d: 'M24 20 L34 32 L24 48 L14 32 Z', fill });
            add('circle', { cx: '24', cy: '32', r: '3.5', fill: trim, opacity: '0.85' });
        } else if (person === 'sage') {
            add('path', { d: 'M14 20 L34 20 L36 52 L12 52 Z', fill });
            add('rect', { x: '17', y: '10', width: '14', height: '12', rx: '2', fill: accent });
        } else if (person === 'knight') {
            add('rect', { x: '13', y: '22', width: '22', height: '26', rx: '4', fill });
            add('rect', { x: '16', y: '28', width: '16', height: '7', rx: '1', fill: accent, opacity: '0.75' });
            add('line', { x1: '24', y1: '22', x2: '24', y2: '48', stroke: trim, 'stroke-width': '1.2' });
        } else if (person === 'breeze') {
            add('ellipse', { cx: '24', cy: '36', rx: '9', ry: '13', fill });
            add('path', { d: 'M7 30 Q2 36 7 42 M41 30 Q46 36 41 42', stroke: accent, 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round' });
        } else if (person === 'spark') {
            add('circle', { cx: '24', cy: '35', r: '8', fill });
            add('path', { d: 'M24 27 L26 33 L32 33 L27 37 L29 43 L24 39 L19 43 L21 37 L16 33 L22 33 Z', fill: accent, opacity: '0.9' });
        } else if (person === 'warm') {
            add('path', { d: 'M24 22 C14 22 12 38 24 46 C36 38 34 22 24 22 Z', fill });
            add('ellipse', { cx: '24', cy: '40', rx: '9', ry: '3', fill: accent, opacity: '0.5' });
        } else {
            add('path', { d: 'M18 24 Q24 20 30 24 L32 44 Q24 50 16 44 Z', fill });
            add('path', { d: 'M18 32 L30 32', stroke: accent, 'stroke-width': '2.5', 'stroke-linecap': 'round' });
        }

        drawKobitoArms(add, fill, person, pose);

        // 頭
        const headR = person === 'sunny' || person === 'pure' ? 9.5
            : person === 'fierce' ? 8.2
            : person === 'spark' ? 7.5
            : person === 'earth' ? 8.4
            : person === 'shadow' ? 8
            : 8.8;
        if (person === 'earth' || person === 'knight') {
            add('rect', { x: String(24 - headR), y: '7', width: String(headR * 2), height: String(headR * 2), rx: '3.5', fill });
        } else if (person === 'spark') {
            add('polygon', { points: '24,6 30,14 28,22 20,22 18,14', fill });
        } else if (person === 'mystic') {
            add('ellipse', { cx: '24', cy: '16', rx: '8.5', ry: '9.5', fill });
        } else {
            add('circle', { cx: '24', cy: '16', r: String(headR), fill });
        }

        // 髪型・帽子（アーキタイプ固有。小物は drawKobitoProp）
        if (person === 'fierce') {
            add('path', { d: 'M16 12 L18 4 L21 11 L24 3 L27 11 L30 4 L32 12 Q24 8 16 12 Z', fill: deep });
        } else if (person === 'sunny') {
            add('circle', { cx: '15', cy: '12', r: '3.2', fill: trim });
            add('circle', { cx: '33', cy: '12', r: '3.2', fill: trim });
            add('circle', { cx: '24', cy: '7', r: '3.5', fill: accent });
        } else if (person === 'calm') {
            add('path', { d: 'M14 16 Q24 8 34 16 L32 18 Q24 12 16 18 Z', fill: accent });
        } else if (person === 'sky') {
            add('path', { d: 'M15 14 Q24 9 33 14', stroke: accent, 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round' });
        } else if (person === 'gentle') {
            add('circle', { cx: '24', cy: '8', r: '2', fill: trim });
        } else if (person === 'earth') {
            add('path', { d: 'M14 15 Q24 10 34 15 L33 18 Q24 14 15 18 Z', fill: accent });
        } else if (person === 'shadow') {
            add('path', { d: 'M13 16 Q24 6 35 16 L33 20 Q24 12 15 20 Z', fill: deep });
        } else if (person === 'pure') {
            add('circle', { cx: '17', cy: '11', r: '2.6', fill: trim });
            add('circle', { cx: '31', cy: '11', r: '2.6', fill: trim });
        } else if (person === 'warm') {
            add('path', { d: 'M14 14 Q24 10 34 14 L34 17 Q24 13 14 17 Z', fill: deep });
        } else if (person === 'sage') {
            add('rect', { x: '16', y: '4', width: '16', height: '8', rx: '2', fill: accent });
        } else if (person === 'knight') {
            add('rect', { x: '17', y: '8', width: '14', height: '12', rx: '2', fill: accent });
            add('rect', { x: '20', y: '13', width: '8', height: '2', fill: ink });
        } else if (person === 'breeze') {
            add('ellipse', { cx: '12', cy: '10', rx: '4', ry: '2.5', fill: accent });
            add('ellipse', { cx: '36', cy: '10', rx: '4', ry: '2.5', fill: trim });
        } else if (person === 'spark') {
            add('path', { d: 'M18 8 L21 14 L15 14 Z M30 8 L33 14 L27 14 Z', fill: accent });
        }

        drawKobitoProp(add, visual.prop, accent, trim, ink, person);

        drawKobitoFace(add, ink, blush, person, pose, visual.face);

        return svg;
    }

    function stopKobitoWalkers() {
        kobitoWalkers.length = 0;
    }

    function ensureKobitoLoop() {
        if (kobitoRaf) return;
        let last = performance.now();
        const tick = (now) => {
            kobitoRaf = requestAnimationFrame(tick);
            const dt = Math.min(0.04, (now - last) / 1000);
            last = now;
            if (el.panelBook.hidden || document.hidden) return;
            kobitoWalkers.forEach((w) => stepKobito(w, dt));
        };
        kobitoRaf = requestAnimationFrame(tick);
    }

    function actorSize(actor) {
        const w = actor.offsetWidth || KOBITO_W;
        const h = actor.offsetHeight || KOBITO_H;
        return { w, h };
    }

    function stageBounds(stage, actor) {
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        const { w, h } = actor ? actorSize(actor) : { w: KOBITO_W, h: KOBITO_H };
        return {
            W,
            H,
            maxX: Math.max(0, W - w),
            maxY: Math.max(0, H - h),
            kw: w,
            kh: h
        };
    }

    function clampKobito(w, recenter) {
        const { maxX, maxY, W, H } = stageBounds(w.cell, w.el);
        if (W < 8 || H < 8) return false;
        if (recenter) {
            w.x = Math.min(maxX, Math.max(0, w.x));
            w.y = Math.min(maxY, Math.max(0, w.y));
        } else {
            if (w.x < 0) { w.x = 0; w.vx = Math.abs(w.vx); }
            if (w.x > maxX) { w.x = maxX; w.vx = -Math.abs(w.vx); }
            if (w.y < 0) { w.y = 0; w.vy = Math.abs(w.vy); }
            if (w.y > maxY) { w.y = maxY; w.vy = -Math.abs(w.vy); }
        }
        const flip = w.vx < -1 ? -1 : 1;
        w.el.style.left = `${w.x}px`;
        w.el.style.top = `${w.y}px`;
        w.el.style.transform = `scaleX(${flip})`;
        const moved = Math.hypot(w.x - (w._px ?? w.x), w.y - (w._py ?? w.y)) > 0.35;
        w._px = w.x;
        w._py = w.y;
        w.el.classList.toggle('is-moving', moved || w.mood === 'edge-flee' || (w.fleeT || 0) > 0);
        return true;
    }

    function scareKobitosFromPoint(clientX, clientY) {
        pointerSense.x = clientX;
        pointerSense.y = clientY;
        pointerSense.on = true;
        if (el.panelBook.hidden || !kobitoWalkers.length) return;
        kobitoWalkers.forEach((w) => {
            const rect = w.cell.getBoundingClientRect();
            const { maxX, maxY, kw, kh } = stageBounds(w.cell, w.el);
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            const target = farthestCorner(localX, localY, maxX, maxY, kw, kh);
            w.vx = (target[0] - w.x) * (2 / 3);
            w.vy = (target[1] - w.y) * (2 / 3);
            w.fleeT = 0.7;
            if (w.mood !== 'edge-flee') {
                w.moodHold = w.mood;
                w.mood = 'edge-flee';
            }
        });
    }

    function farthestCorner(localX, localY, maxX, maxY, kw, kh) {
        const hx = kw * 0.5;
        const hy = kh * 0.5;
        const corners = [
            [0, 0],
            [maxX, 0],
            [0, maxY],
            [maxX, maxY]
        ];
        let best = corners[0];
        let bestD = -1;
        for (let i = 0; i < corners.length; i++) {
            const cx = corners[i][0] + hx;
            const cy = corners[i][1] + hy;
            const d = (cx - localX) * (cx - localX) + (cy - localY) * (cy - localY);
            if (d > bestD) {
                bestD = d;
                best = corners[i];
            }
        }
        return best;
    }

    /** 指／カーソルが近いとき、箱の一番遠い端へ逃げる */
    function applyProximityFlee(w, dt) {
        if (!pointerSense.on || el.panelBook.hidden) return false;
        const rect = w.cell.getBoundingClientRect();
        const pad = 72;
        if (
            pointerSense.x < rect.left - pad ||
            pointerSense.x > rect.right + pad ||
            pointerSense.y < rect.top - pad ||
            pointerSense.y > rect.bottom + pad
        ) {
            if (w.mood === 'edge-flee') {
                w.mood = w.moodHold || 'float';
                w.fleeT = 0;
            }
            return false;
        }

        const { maxX, maxY, kw, kh } = stageBounds(w.cell, w.el);
        if (maxX < 1 && maxY < 1) return false;

        const localX = pointerSense.x - rect.left;
        const localY = pointerSense.y - rect.top;
        const fx = w.x + kw * 0.5;
        const fy = w.y + kh * 0.5;
        const dist = Math.hypot(fx - localX, fy - localY);
        const senseR = Math.max(rect.width, rect.height) * 0.95 + 48;
        if (dist > senseR) {
            if (w.mood === 'edge-flee') {
                w.mood = w.moodHold || 'float';
                w.fleeT = 0;
            }
            return false;
        }

        const target = farthestCorner(localX, localY, maxX, maxY, kw, kh);
        const toX = target[0] - w.x;
        const toY = target[1] - w.y;
        const edgeLen = Math.hypot(toX, toY) || 1;
        const awayX = fx - localX;
        const awayY = fy - localY;
        const awayLen = Math.hypot(awayX, awayY) || 1;
        const urgency = Math.max(0.35, 1 - dist / senseR);
        /* 逃げる速度は現行のさらに1/2（落ち着いたテンポ） */
        const spd = ((160 + 220 * urgency) * (w.speed || 1)) / 6;

        if (w.mood !== 'edge-flee') {
            w.moodHold = w.mood;
            w.mood = 'edge-flee';
        }

        w.vx = (toX / edgeLen) * spd * 0.78 + (awayX / awayLen) * spd * 0.45;
        w.vy = (toY / edgeLen) * spd * 0.78 + (awayY / awayLen) * spd * 0.45;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.fleeT = 0.2;
        clampKobito(w, false);
        /* 端に着いたら張り付く */
        if (edgeLen < 3) {
            w.x = target[0];
            w.y = target[1];
            w.vx *= 0.2;
            w.vy *= 0.2;
            clampKobito(w, true);
        }
        return true;
    }

    function stepKobito(w, dt) {
        const { maxX, maxY, W, H } = stageBounds(w.cell, w.el);
        if (W < 8 || H < 8) return;
        w.t += dt * (w.speed || 1);
        const spd = w.speed || 1;

        if (applyProximityFlee(w, dt)) return;

        if (w.fleeT > 0) {
            w.fleeT -= dt;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
            w.vx *= 0.9;
            w.vy *= 0.9;
            if (w.fleeT <= 0) {
                w.mood = w.moodHold || w.mood || 'float';
                w.fleeT = 0;
            }
            clampKobito(w, false);
            return;
        }

        if (w.mood === 'edge-flee') {
            w.mood = w.moodHold || 'float';
        }

        if (w.mood === 'bounce') {
            w.vy += 140 * dt * spd;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
            if (w.y >= maxY) {
                w.y = maxY;
                w.vy = -(50 + Math.random() * 40) * spd;
            }
            if (w.x <= 0 || w.x >= maxX) w.vx *= -1;
        } else if (w.mood === 'hop') {
            w.vy += 160 * dt * spd;
            w.x += w.vx * dt * 0.7;
            w.y += w.vy * dt;
            if (w.y >= maxY) {
                w.y = maxY;
                w.vy = -(70 + Math.random() * 35) * spd;
                w.vx = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 22) * spd;
            }
        } else if (w.mood === 'float') {
            w.x = maxX * 0.5 + Math.sin(w.t * 1.25 + w.seed) * maxX * 0.44;
            w.y = maxY * 0.42 + Math.cos(w.t * 1.05 + w.seed * 1.1) * maxY * 0.4;
        } else if (w.mood === 'flutter') {
            w.x = maxX * 0.5 + Math.sin(w.t * 2.4 + w.seed) * maxX * 0.46;
            w.y = maxY * 0.4 + Math.sin(w.t * 3.1 + w.seed * 1.7) * maxY * 0.42;
        } else if (w.mood === 'drift-up') {
            w.x = maxX * 0.5 + Math.sin(w.t * 0.95 + w.seed) * maxX * 0.38;
            w.y = ((w.t * 22 * spd) % (maxY + 12)) - 6;
        } else if (w.mood === 'zip') {
            if (Math.random() < 0.07 * spd) {
                const a = Math.random() * Math.PI * 2;
                w.vx = Math.cos(a) * (70 + Math.random() * 55) * spd;
                w.vy = Math.sin(a) * (70 + Math.random() * 55) * spd;
            }
            w.vx *= 0.88;
            w.vy *= 0.88;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
        } else if (w.mood === 'spark') {
            if (Math.random() < 0.055 * spd) {
                w.vx = (Math.random() - 0.5) * 100 * spd;
                w.vy = (Math.random() - 0.5) * 100 * spd;
            }
            w.vx *= 0.9;
            w.vy *= 0.9;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
        } else if (w.mood === 'sway') {
            w.x = maxX * 0.5 + Math.sin(w.t * 1.55 + w.seed) * maxX * 0.45;
            w.y = maxY * 0.5 + Math.sin(w.t * 2.2 + w.seed) * maxY * 0.32;
        } else if (w.mood === 'heavy') {
            w.y = maxY * 0.88 + Math.sin(w.t * 0.9 + w.seed) * Math.min(6, maxY * 0.08);
            w.x += w.vx * dt * 0.9;
            if (Math.random() < 0.03) w.vx = (Math.random() - 0.5) * 40;
            if (w.x <= 0 || w.x >= maxX) w.vx *= -1;
        } else if (w.mood === 'creep') {
            w.y = maxY * 0.72 + Math.sin(w.t * 0.6 + w.seed) * Math.min(14, maxY * 0.22);
            w.x = maxX * 0.5 + Math.sin(w.t * 0.75 + w.seed) * maxX * 0.4;
        } else if (w.mood === 'light') {
            w.x = maxX * 0.5 + Math.sin(w.t * 1.7 + w.seed) * maxX * 0.46;
            w.y = maxY * 0.4 + Math.sin(w.t * 1.25 + w.seed * 1.4) * maxY * 0.4;
        } else if (w.mood === 'orbit') {
            const cx = maxX * 0.5;
            const cy = maxY * 0.42;
            const rx = Math.max(10, maxX * 0.44);
            const ry = Math.max(10, maxY * 0.4);
            w.x = cx + Math.cos(w.t * 1.35 + w.seed) * rx;
            w.y = cy + Math.sin(w.t * 1.15 + w.seed) * ry;
        } else if (w.mood === 'dash') {
            if (Math.random() < 0.06 * spd) {
                const a = Math.random() * Math.PI * 2;
                w.vx = Math.cos(a) * (55 + Math.random() * 60) * spd;
                w.vy = Math.sin(a) * (55 + Math.random() * 60) * spd;
            }
            w.vx *= 0.9;
            w.vy *= 0.9;
            w.x += w.vx * dt;
            w.y += w.vy * dt;
        } else if (w.mood === 'pulse') {
            w.x = maxX * 0.5 + Math.sin(w.t * 2.0 + w.seed) * maxX * 0.36;
            w.y = maxY * 0.48 + Math.sin(w.t * 3.2 + w.seed) * Math.min(maxY * 0.38, 22);
        } else {
            w.x += w.vx * dt;
            w.y += w.vy * dt;
            if (Math.random() < 0.03) {
                const a = Math.random() * Math.PI * 2;
                w.vx = Math.cos(a) * 30 * spd;
                w.vy = Math.sin(a) * 30 * spd;
            }
        }

        clampKobito(w, false);
    }

    function createColorElement(spirit) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'spirit-item';
        btn.style.backgroundColor = rgbCss(spirit.rgb);
        btn.dataset.spiritId = spirit.id;
        btn.setAttribute('aria-label', spirit.name);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'spirit-name';
        nameSpan.textContent = spirit.name;
        nameSpan.style.color = textColorForRgb(spirit.rgb);
        btn.appendChild(nameSpan);

        /* 押した瞬間に反映（pointerup待ちだと遅く感じる） */
        let lastPickAt = 0;
        const pick = (e) => {
            if (e && e.button != null && e.button !== 0) return;
            const now = Date.now();
            if (now - lastPickAt < 80) return;
            lastPickAt = now;
            addSelectedColor(spirit);
        };
        btn.addEventListener('pointerdown', pick);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            pick(e);
        });

        return btn;
    }

    function updatePalette() {
        el.basicColors.replaceChildren();
        el.basicColors.dataset.slots = String(PALETTE_MAX);
        gameState.palette.forEach((spirit) => {
            el.basicColors.appendChild(createColorElement(spirit));
        });
        for (let i = gameState.palette.length; i < PALETTE_MAX; i++) {
            const empty = document.createElement('div');
            empty.className = 'spirit-item is-empty';
            empty.setAttribute('aria-hidden', 'true');
            el.basicColors.appendChild(empty);
        }
    }

    function addToCollection(spirit) {
        if (!isDevelopedColor(spirit)) return false;
        const key = rgbKey(spirit.rgb);
        if (gameState.collection.some((s) => rgbKey(s.rgb) === key)) return false;
        gameState.collection.unshift({ ...spirit });
        return true;
    }

    function collectionColorExists(rgb) {
        const key = rgbKey(rgb);
        return gameState.collection.some((s) => rgbKey(s.rgb) === key);
    }

    function updateCollection() {
        stopKobitoWalkers();
        el.collectionGrid.replaceChildren();
        el.collectionCount.textContent = String(gameState.collection.length);

        const count = gameState.collection.length;
        const rows = Math.max(1, Math.ceil(count / 2));
        el.collectionGrid.dataset.rows = String(rows);
        el.collectionGrid.style.setProperty('--book-rows', String(rows));

        if (!count) {
            const empty = document.createElement('p');
            empty.className = 'book-empty';
            empty.textContent = '混色して名前を付けた精霊が、ここに1体ずつ増えていきます';
            el.collectionGrid.appendChild(empty);
            return;
        }

        gameState.collection.forEach((spirit) => {
            const visual = buildSpiritVisual(spirit);
            const cell = document.createElement('div');
            cell.className = 'kobito-cell';
            cell.dataset.spiritId = spirit.id;
            cell.dataset.archetype = visual.archetype;
            cell.dataset.pose = visual.pose;
            cell.dataset.prop = visual.prop;
            cell.setAttribute('role', 'button');
            cell.tabIndex = 0;
            cell.setAttribute('aria-label', spirit.name);
            cell.style.backgroundColor = rgbCss(cardBackdropRgb(spirit.rgb));

            const stage = document.createElement('div');
            stage.className = 'kobito-stage';
            stage.setAttribute('aria-hidden', 'true');

            const actor = document.createElement('div');
            actor.className = 'kobito-actor';
            const idle = document.createElement('div');
            idle.className = 'kobito-idle';
            const motionInfo = motionFromSpirit(spirit);
            idle.dataset.motion = motionInfo.motion;
            idle.dataset.archetype = visual.archetype;
            idle.style.setProperty('--idle-phase', `${motionInfo.phase}rad`);
            idle.style.setProperty('--idle-delay', `${-((motionInfo.phase / (Math.PI * 2)) % 1).toFixed(3)}s`);
            idle.style.setProperty('--figure-scale', String(visual.scale));
            idle.style.setProperty('--figure-tilt', `${visual.tilt}deg`);
            idle.appendChild(createKobitoSvg(spirit));
            actor.appendChild(idle);
            stage.appendChild(actor);

            const name = document.createElement('div');
            name.className = 'kobito-name';
            name.textContent = spirit.name;

            cell.appendChild(stage);
            cell.appendChild(name);

            let holdTimer = 0;
            let held = false;
            const clearHold = () => {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = 0;
                }
            };
            cell.addEventListener('pointerdown', (e) => {
                held = false;
                clearHold();
                holdTimer = window.setTimeout(() => {
                    held = true;
                    openDetail(spirit);
                    vibrate(12);
                }, 480);
                scareKobitosFromPoint(e.clientX, e.clientY);
            });
            cell.addEventListener('pointerup', clearHold);
            cell.addEventListener('pointercancel', clearHold);
            cell.addEventListener('pointerleave', clearHold);
            cell.addEventListener('click', () => {
                if (held) return;
                addSelectedColor(spirit);
            });
            cell.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    addSelectedColor(spirit);
                } else if (e.key === 'i' || e.key === 'I') {
                    e.preventDefault();
                    openDetail(spirit);
                }
            });
            el.collectionGrid.appendChild(cell);

            const seed = Math.random() * 10;
            const ang = Math.random() * Math.PI * 2;
            const baseSpd = (12 + Math.random() * 11) * motionInfo.speed;
            const walker = {
                cell: stage,
                el: actor,
                mood: motionInfo.mood,
                motion: motionInfo.motion,
                speed: motionInfo.speed,
                phase: motionInfo.phase,
                seed,
                t: Math.random() * 10,
                x: 4 + Math.random() * Math.max(4, stage.clientWidth * 0.35 || 8),
                y: 4 + Math.random() * Math.max(4, stage.clientHeight * 0.35 || 6),
                vx: Math.cos(ang) * baseSpd,
                vy: Math.sin(ang) * baseSpd,
                fleeT: 0
            };
            kobitoWalkers.push(walker);
            clampKobito(walker, true);
        });

        ensureKobitoLoop();
        syncBookPanelHeight();
        requestAnimationFrame(() => {
            kobitoWalkers.forEach((w) => clampKobito(w, true));
        });
    }

    function updateMixingSlots() {
        const slots = [el.slot1, el.slot2];
        slots.forEach((slot, index) => {
            const spirit = gameState.selectedColors[index];
            const swatch = slot.querySelector('.slot-swatch');
            const label = slot.querySelector('.slot-label');
            slot.classList.toggle('active', !!spirit);
            if (swatch) swatch.style.backgroundColor = spirit ? rgbCss(spirit.rgb) : '';
            if (label) label.textContent = spirit ? spirit.name : `精霊${index + 1}`;
        });
        el.mixButton.disabled = !(gameState.selectedColors[0] && gameState.selectedColors[1]);
    }

    function addSelectedColor(spirit) {
        if (!spirit) return;
        if (gameState.selectedColors.some((s) => s && s.id === spirit.id)) {
            showToast('同じ精霊は選べません');
            vibrate(20);
            return;
        }
        if (gameState.selectedColors[0] && gameState.selectedColors[1]) {
            showToast('スロットがいっぱいです。空にしてから選んでね');
            return;
        }

        if (!gameState.selectedColors[0]) gameState.selectedColors[0] = spirit;
        else gameState.selectedColors[1] = spirit;

        /* UIを先に反映してから音（音で体感が遅くなるのを防ぐ） */
        updateMixingSlots();
        setStatus(`${spirit.name}をスロットへ`);
        queueMicrotask(() => {
            vibrate(12);
            try {
                playColorPick(spirit.rgb);
            } catch (_) { /* ignore */ }
        });
    }

    function clearSlot(index) {
        gameState.selectedColors[index] = null;
        updateMixingSlots();
        vibrate(10);
    }

    function getResultSwatch() {
        return el.resultSlot.querySelector('.result-slot') || el.resultSlot;
    }

    function clearSelectedSlots() {
        gameState.selectedColors = [null, null];
        gameState.currentMixResult = null;
        const swatch = getResultSwatch();
        swatch.classList.remove('has-color');
        swatch.style.backgroundColor = '';
        swatch.replaceChildren();
        const mark = document.createElement('span');
        mark.textContent = '？';
        swatch.appendChild(mark);
        const label = el.resultSlot.querySelector('.slot-label');
        if (label) label.textContent = '結果';
        updateMixingSlots();
        setStatus('');
    }

    function openDetail(spirit) {
        gameState.detailSpirit = spirit;
        el.detailName.textContent = spirit.name;
        el.detailColor.style.backgroundColor = rgbCss(spirit.rgb);
        el.detailRgb.textContent = `RGB(${spirit.rgb.join(', ')})`;
        if (spirit.parents && spirit.parents.length === 2) {
            const p1 = findSpiritById(spirit.parents[0]);
            const p2 = findSpiritById(spirit.parents[1]);
            el.detailParents.textContent = `両親: ${(p1 && p1.name) || '？'} × ${(p2 && p2.name) || '？'}`;
        } else {
            el.detailParents.textContent = '混色で生まれた精霊';
        }
        showPopover(el.detailSheet);
    }

    function openNameRitual(spirit) {
        if (!el.nameRitual || !el.spiritName) return;
        if (el.ritualColor) {
            el.ritualColor.style.backgroundColor = rgbCss(spirit.rgb);
        }
        if (el.ritualParents) {
            if (spirit.parents && spirit.parents.length === 2) {
                const p1 = findSpiritById(spirit.parents[0]);
                const p2 = findSpiritById(spirit.parents[1]);
                el.ritualParents.textContent = `${(p1 && p1.name) || '？'} × ${(p2 && p2.name) || '？'}`;
            } else {
                el.ritualParents.textContent = '';
            }
        }
        el.spiritName.value = '';
        showModal(el.nameRitual);
        /* iOSはユーザーが入力枠を直接タップしないとキーボードが出ない */
        setStatus('下の枠をタップして名前を入力');
    }

    function setupKeyboardAvoidance() {
        const root = document.documentElement;
        const sync = () => {
            if (!window.visualViewport) {
                root.style.setProperty('--kb-offset', '0px');
                return;
            }
            const vv = window.visualViewport;
            const occluded = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            root.style.setProperty('--kb-offset', `${Math.round(occluded)}px`);
        };
        sync();
        if (!window.visualViewport) return;
        window.visualViewport.addEventListener('resize', sync);
        window.visualViewport.addEventListener('scroll', sync);
        el.spiritName.addEventListener('focus', () => {
            setTimeout(sync, 50);
            setTimeout(sync, 300);
        });
        el.spiritName.addEventListener('blur', () => {
            root.style.setProperty('--kb-offset', '0px');
        });
    }

    function performMixing() {
        if (performMixing._busy) return;
        const c1 = gameState.selectedColors[0];
        const c2 = gameState.selectedColors[1];
        if (!c1 || !c2) return;
        performMixing._busy = true;
        setTimeout(() => { performMixing._busy = false; }, 500);

        const mixedRgb = mixInOklch(c1.rgb, c2.rgb, 0.5);
        const newSpirit = {
            name: `${c1.name} × ${c2.name}`,
            rgb: mixedRgb,
            id: `mixed_${Date.now()}`,
            parents: [c1.id, c2.id]
        };
        gameState.currentMixResult = newSpirit;
        vibrate(18);
        playColorMix(c1.rgb, c2.rgb, mixedRgb);

        const swatch = getResultSwatch();
        if (swatch) {
            swatch.classList.add('has-color');
            swatch.style.backgroundColor = rgbCss(mixedRgb);
            swatch.replaceChildren();
        }
        const label = el.resultSlot.querySelector('.slot-label');
        if (label) label.textContent = '新精霊';
        setStatus('新しい精霊が生まれた！命名の儀へ');

        /* View Transition中にモーダルを出すとiOSで消えることがあるので直後に開く */
        requestAnimationFrame(() => {
            openNameRitual(newSpirit);
        });
    }

    function nameNewSpirit() {
        if (nameNewSpirit._busy) return;
        const newName = el.spiritName.value.trim();
        if (!newName) {
            showToast('名前を入力してね');
            vibrate(20);
            try { el.spiritName.focus(); } catch (_) { /* ignore */ }
            return;
        }
        if (!gameState.currentMixResult) return;
        nameNewSpirit._busy = true;
        setTimeout(() => { nameNewSpirit._busy = false; }, 600);

        gameState.currentMixResult.name = newName;
        const named = { ...gameState.currentMixResult };
        const addedToBook = addToCollection(named);
        saveGame();
        hidePopover(el.nameRitual);

        withViewTransition(() => {
            updatePalette();
            updateCollection();
            clearSelectedSlots();
            switchTab('book');
            if (addedToBook) {
                setStatus(`「${named.name}」を図鑑に登録した`);
            } else if (isStarterRgb(named.rgb)) {
                setStatus(`「${named.name}」は基本色と同じなので図鑑には載りません`);
            } else if (collectionColorExists(named.rgb)) {
                setStatus(`「${named.name}」はこの色が図鑑にあります`);
            } else {
                setStatus(`「${named.name}」を命名しました`);
            }
        });

        if (addedToBook) {
            showToast(`「${named.name}」を図鑑に登録`);
        } else if (isStarterRgb(named.rgb)) {
            showToast('基本色と同じなので図鑑には載りません');
        } else if (collectionColorExists(named.rgb)) {
            showToast('この色は図鑑に登録済みです');
        }
        vibrate(25);
        playNameSuccess(named.rgb);
    }

    function cancelNaming() {
        hidePopover(el.nameRitual);
        gameState.currentMixResult = null;
        setStatus('命名をやめた。もう一度混色してみよう');
    }

    function setupIosGuards() {
        document.addEventListener('dblclick', (e) => e.preventDefault());
        document.addEventListener('contextmenu', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
        });
        document.addEventListener('gesturestart', (e) => e.preventDefault());
        document.addEventListener('gesturechange', (e) => e.preventDefault());
        document.addEventListener('gestureend', (e) => e.preventDefault());

        const blockDoubleTapZoom = (e) => {
            /* ボタン・入力・パレット上では何もしない（反応遅延の元凶） */
            const t = e.target;
            if (t && t.closest && t.closest('button, input, textarea, a, .spirit-item, .slot-unit, .name-card, .modal-overlay, .tab, .icon-btn')) {
                return;
            }
            const now = Date.now();
            if (now - lastTouchEnd <= 300) e.preventDefault();
            lastTouchEnd = now;
        };
        document.addEventListener('touchend', blockDoubleTapZoom, { passive: false });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            resumeBgmIfNeeded();
            if (gameState.started) unlockSfx();
        });
        window.addEventListener('pageshow', () => {
            resumeBgmIfNeeded();
            if (gameState.started) unlockSfx();
        });
        window.addEventListener('focus', () => {
            resumeBgmIfNeeded();
            if (gameState.started) unlockSfx();
        });
    }

    function beginGameSession() {
        if (gameState.started) return;
        gameState.started = true;
        el.startOverlay.classList.add('is-hidden');
        unlockSfx();
        unlockAndPlayBgm();
        vibrate(15);
        const ctx = getAudioCtx();
        if (ctx) {
            playTone(520, 'sine', 0.06, 0.1, ctx.currentTime, 0);
            playTone(780, 'sine', 0.05, 0.12, ctx.currentTime + 0.07, 0);
        }
    }

    function setupEventListeners() {
        const senseFromEvent = (e) => {
            const t = e.touches && e.touches[0] ? e.touches[0] : e;
            if (typeof t.clientX !== 'number') return;
            pointerSense.x = t.clientX;
            pointerSense.y = t.clientY;
            pointerSense.on = !el.panelBook.hidden && gameState.started;
        };
        const clearSense = (e) => {
            if (e && e.pointerType === 'mouse') return;
            pointerSense.on = false;
        };
        document.addEventListener('pointermove', (e) => {
            if (!gameState.started || el.panelBook.hidden) {
                pointerSense.on = false;
                return;
            }
            senseFromEvent(e);
        }, { passive: true });
        document.addEventListener('pointerdown', (e) => {
            if (!gameState.started || el.panelBook.hidden) return;
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            senseFromEvent(e);
            scareKobitosFromPoint(e.clientX, e.clientY);
        }, { passive: true });
        document.addEventListener('pointerup', clearSense, { passive: true });
        document.addEventListener('pointercancel', () => { pointerSense.on = false; }, { passive: true });
        document.documentElement.addEventListener('mouseleave', () => { pointerSense.on = false; });

        el.mixButton.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button !== 0) return;
            if (el.mixButton.disabled) return;
            performMixing();
        });
        el.mixButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (el.mixButton.disabled) return;
            performMixing();
        });
        el.clearSlots.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button !== 0) return;
            clearSelectedSlots();
            showToast('スロットを空にした');
        });
        el.clearSlots.addEventListener('click', (e) => {
            e.preventDefault();
            clearSelectedSlots();
            showToast('スロットを空にした');
        });
        el.nameButton.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button !== 0) return;
            nameNewSpirit();
        });
        el.nameButton.addEventListener('click', (e) => {
            e.preventDefault();
            nameNewSpirit();
        });
        el.nameCancel.addEventListener('pointerdown', (e) => {
            if (e.button != null && e.button !== 0) return;
            cancelNaming();
        });
        el.nameCancel.addEventListener('click', (e) => {
            e.preventDefault();
            cancelNaming();
        });
        /* 名前入力：タップした瞬間にフォーカス（iOSキーボード用） */
        const focusNameInput = (e) => {
            if (e) e.stopPropagation();
            try {
                el.spiritName.focus({ preventScroll: true });
            } catch (_) {
                try { el.spiritName.focus(); } catch (__) { /* ignore */ }
            }
        };
        el.spiritName.addEventListener('pointerdown', focusNameInput);
        el.spiritName.addEventListener('touchstart', focusNameInput, { passive: true });
        el.spiritName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameNewSpirit();
            }
        });

        el.slot1.addEventListener('pointerdown', () => {
            if (gameState.selectedColors[0]) clearSlot(0);
        });
        el.slot2.addEventListener('pointerdown', () => {
            if (gameState.selectedColors[1]) clearSlot(1);
        });
        el.slot1.addEventListener('click', (e) => {
            e.preventDefault();
            if (gameState.selectedColors[0]) clearSlot(0);
        });
        el.slot2.addEventListener('click', (e) => {
            e.preventDefault();
            if (gameState.selectedColors[1]) clearSlot(1);
        });

        el.detailUse.addEventListener('click', () => {
            const spirit = gameState.detailSpirit;
            hidePopover(el.detailSheet);
            if (spirit) addSelectedColor(spirit);
        });
        el.detailClose.addEventListener('click', () => hidePopover(el.detailSheet));

        el.tabPalette.addEventListener('click', () => switchTab('palette'));
        el.tabBook.addEventListener('click', () => switchTab('book'));

        el.muteButton.addEventListener('click', () => {
            gameState.muted = !gameState.muted;
            saveMuted();
            updateMuteUi();
            if (!gameState.muted) unlockAndPlayBgm();
            else if (el.bgm) el.bgm.pause();
        });

        el.startButton.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            beginGameSession();
        }, { passive: false });
        el.startButton.addEventListener('click', (e) => {
            e.preventDefault();
            beginGameSession();
        });
    }

    function initializeGame() {
        gameState.muted = loadMuted();
        updateMuteUi();

        resetPaletteToStarters();
        gameState.collection = [];
        gameState.selectedColors = [null, null];
        gameState.currentMixResult = null;
        gameState.detailSpirit = null;

        purgeLegacyStorage();

        updatePalette();
        updateCollection();
        updateMixingSlots();
        switchTab('palette');
        setStatus('精霊を選んで混ぜよう');
        setupIosGuards();
        setupKeyboardAvoidance();
        setupEventListeners();
        window.addEventListener('resize', syncBookPanelHeight);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncBookPanelHeight);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeGame);
    } else {
        initializeGame();
    }
})();
