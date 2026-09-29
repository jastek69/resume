/* Sound effects. On by default with a remembered mute toggle in the nav.
   The AudioContext is created and the sounds preloaded as soon as the page is
   idle. Browsers only let it *run* after the visitor interacts (unless they
   already trust the site), so the first click, tap, or key press resumes it;
   until then the speaker button pulses with a hint. Sounds are wired to DOM
   events, so site.js doesn't need to know about them. */
(function () {
    "use strict";

    var KEY = "js-sound"; // "off" when muted
    var BASE = "assets/sounds/";
    var SOUNDS = {
        hover: { file: "menu1.wav", gain: 0.22 },                 // Quake III Arena
        select: { file: "vadim_makes_sound-futuristic-holographic-interface-menu-opening-566063.mp3", gain: 0.45 }, // Bold Comet
        whoosh: { file: "ksjsbwuil-whoosh3-481204.mp3", gain: 0.5 },                  // Bold Comet
        close: { file: "vadim_makes_sound-futuristic-holographic-interface-menu-opening-566063.mp3", gain: 0.45 }, // Bold Comet
        ambience: { file: "kauasilbershlachparodes-futuristic-ship-ambience-494000.mp3", gain: 0.26 }, // Pixabay
    };
    // Menu items and every glass panel
    var HOVER_TARGETS = [
        ".nav-links a", ".nav-cta", ".nav-mark", ".filter",
        ".panel", ".diagram-card", ".metric", ".stage-node", ".theme", ".role", ".skill",
        ".arch-teaser", ".cred--badge",
    ].join(", ");

    var muted = false;
    try { muted = localStorage.getItem(KEY) === "off"; } catch (e) { /* storage blocked: default on */ }

    var stage = document.querySelector(".stage");
    var btn = document.querySelector(".sound-toggle");
    var ctx = null;
    var master = null;
    var buffers = {};
    var ambience = null; // { src, gain }
    var lastHover = null;
    var lastHoverAt = 0;

    function running() {
        return !!ctx && ctx.state === "running";
    }

    function setup() {
        if (ctx) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC(); // starts "suspended" unless the browser already allows audio here
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        ctx.onstatechange = render;
        Object.keys(SOUNDS).forEach(function (name) {
            fetch(BASE + SOUNDS[name].file)
                .then(function (r) { return r.arrayBuffer(); })
                .then(function (data) { return new Promise(function (ok, bad) { ctx.decodeAudioData(data, ok, bad); }); })
                .then(function (buf) { buffers[name] = buf; })
                .catch(function () { /* a missing sound just stays silent */ });
        });
        render();
    }

    function unlock() {
        setup();
        if (ctx && ctx.state !== "running") ctx.resume().then(render, render);
    }

    function play(name, opts) {
        // Never queue sounds while audio is blocked: they'd all fire at once on unlock
        if (!running() || muted || !buffers[name]) return null;
        var src = ctx.createBufferSource();
        src.buffer = buffers[name];
        src.loop = !!(opts && opts.loop);
        var g = ctx.createGain();
        g.gain.value = SOUNDS[name].gain;
        src.connect(g).connect(master);
        src.start();
        document.dispatchEvent(new CustomEvent("site:sound", { detail: name })); // lets tests observe plays
        return { src: src, gain: g };
    }

    // A sound triggered by the unlocking click itself may land a moment
    // before the context is running or the file is decoded: wait briefly.
    function playSoon(name, opts, then) {
        var tries = 0;
        (function attempt() {
            if (!ctx || muted) return;
            if (running() && buffers[name]) { var h = play(name, opts); if (then) then(h); return; }
            if (++tries < 16) setTimeout(attempt, 50);
        })();
    }

    function startAmbience() {
        stopAmbience(0);
        playSoon("ambience", { loop: true }, function (a) {
            if (!a) return;
            var now = ctx.currentTime;
            a.gain.gain.setValueAtTime(0, now);
            a.gain.gain.linearRampToValueAtTime(SOUNDS.ambience.gain, now + 1.0);
            ambience = a;
            if (stage && stage.hidden) stopAmbience(); // panel closed before it loaded
        });
    }

    function stopAmbience(fade) {
        if (!ambience) return;
        var a = ambience;
        ambience = null;
        var t = fade === undefined ? 0.6 : fade;
        var now = ctx.currentTime;
        a.gain.gain.cancelScheduledValues(now);
        a.gain.gain.setValueAtTime(a.gain.gain.value, now);
        a.gain.gain.linearRampToValueAtTime(0, now + t);
        a.src.stop(now + t + 0.05);
    }

    // Set up and preload once the page is idle; any first interaction resumes
    function whenIdle(fn) {
        if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 2000 });
        else setTimeout(fn, 800);
    }
    if (document.readyState === "complete") whenIdle(setup);
    else window.addEventListener("load", function () { whenIdle(setup); });

    ["pointerdown", "keydown", "touchend", "click"].forEach(function (type) {
        window.addEventListener(type, unlock, { capture: true, passive: true });
    });

    // Hover over menu items and panels: once per element, throttled
    document.addEventListener("pointerover", function (e) {
        if (e.pointerType && e.pointerType !== "mouse") return;
        var t = e.target.closest && e.target.closest(HOVER_TARGETS);
        if (!t || t === lastHover) return;
        lastHover = t;
        var now = performance.now();
        if (now - lastHoverAt < 70) return;
        lastHoverAt = now;
        play("hover");
    });
    document.addEventListener("pointerout", function (e) {
        var t = e.target.closest && e.target.closest(HOVER_TARGETS);
        if (t && !t.contains(e.relatedTarget)) lastHover = null;
    });

    // A filter choice loads a new set of projects/diagrams
    document.addEventListener("click", function (e) {
        var f = e.target.closest && e.target.closest(".filter");
        if (f && f.getAttribute("aria-pressed") !== "true") {
            // site.js flips aria-pressed in the same click; play after it has
            setTimeout(function () { if (f.getAttribute("aria-pressed") === "true") playSoon("select"); }, 0);
        }
    }, true);

    // The stage: whoosh as a panel opens, quiet ambience while a project panel
    // is open, and the hologram sound as any panel closes
    if (stage && "MutationObserver" in window) {
        var panel = stage.querySelector(".stage-panel");
        new MutationObserver(function () {
            if (!stage.hidden) {
                playSoon("whoosh");
                if (!panel.classList.contains("stage-panel--doc")) startAmbience();
            } else {
                stopAmbience();
                playSoon("close");
            }
        }).observe(stage, { attributes: true, attributeFilter: ["hidden"] });
    }

    // Mute toggle, with a hint while the browser is still holding audio back
    function render() {
        if (!btn) return;
        var waiting = !muted && ctx && ctx.state !== "running";
        btn.classList.toggle("is-waiting", !!waiting);
        btn.setAttribute("aria-pressed", String(!muted));
        btn.setAttribute("aria-label", muted ? "Turn sound on" : waiting ? "Sound on: click anywhere to enable" : "Mute sound");
        btn.title = muted ? "Sound off" : waiting ? "Click anywhere to enable sound" : "Sound on";
        var i = btn.querySelector("i");
        if (i) i.className = muted ? "fas fa-volume-mute" : "fas fa-volume-up";
    }
    if (btn) {
        btn.addEventListener("click", function () {
            // A click while audio is waiting just enables it (unlock ran in the capture phase)
            if (btn.classList.contains("is-waiting")) { playSoon("hover"); return; }
            muted = !muted;
            try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch (e) { /* ignore */ }
            if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
            if (muted) stopAmbience(0.2);
            render();
            if (!muted) playSoon("hover"); // audible confirmation
        });
        render();
    }
})();
