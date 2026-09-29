/* Sound effects. On by default with a remembered mute toggle in the nav.
   Browsers block audio until the visitor interacts, so the AudioContext and
   the sound files are only set up on the first click or key press.
   Sounds are wired to DOM events, so site.js doesn't need to know about them. */
(function () {
    "use strict";

    var KEY = "js-sound"; // "off" when muted
    var BASE = "assets/sounds/";
    var SOUNDS = {
        hover: { file: "menu1.wav", gain: 0.22 },                 // Quake III Arena
        select: { file: "vadim_makes_sound-futuristic-holographic-interface-menu-opening-566063.mp3", gain: 0.45 }, // Bold Comet
        whoosh: { file: "ksjsbwuil-whoosh3-481204.mp3", gain: 0.5 },                  // Bold Comet
        ambience: { file: "kauasilbershlachparodes-futuristic-ship-ambience-494000.mp3", gain: 0.16 }, // Pixabay
    };
    var HOVER_TARGETS = ".nav-links a, .nav-cta, .nav-mark, .filter";

    var muted = false;
    try { muted = localStorage.getItem(KEY) === "off"; } catch (e) { /* storage blocked: default on */ }

    var stage = document.querySelector(".stage");
    var ctx = null;
    var master = null;
    var buffers = {};
    var ambience = null; // { src, gain }
    var lastHover = null;
    var lastHoverAt = 0;

    function unlock() {
        if (ctx) {
            if (ctx.state === "suspended") ctx.resume();
            return;
        }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);
        Object.keys(SOUNDS).forEach(function (name) {
            fetch(BASE + SOUNDS[name].file)
                .then(function (r) { return r.arrayBuffer(); })
                .then(function (data) { return new Promise(function (ok, bad) { ctx.decodeAudioData(data, ok, bad); }); })
                .then(function (buf) { buffers[name] = buf; })
                .catch(function () { /* a missing sound just stays silent */ });
        });
    }

    function play(name, opts) {
        if (!ctx || muted || !buffers[name]) return null;
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

    // The first click both unlocks audio and starts the downloads, so a sound
    // triggered by that same click may not be decoded yet: wait briefly for it.
    function playSoon(name, opts, then) {
        var tries = 0;
        (function attempt() {
            if (!ctx || muted) return;
            if (buffers[name]) { var h = play(name, opts); if (then) then(h); return; }
            if (++tries < 12) setTimeout(attempt, 50);
        })();
    }

    function startAmbience() {
        stopAmbience(0);
        playSoon("ambience", { loop: true }, function (a) {
            if (!a) return;
            if (stage && stage.hidden) { a.src.stop(); return; } // closed before it loaded
            var now = ctx.currentTime;
            a.gain.gain.setValueAtTime(0, now);
            a.gain.gain.linearRampToValueAtTime(SOUNDS.ambience.gain, now + 1.2);
            ambience = a;
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

    // First interaction unlocks audio (and downloads the files)
    ["pointerdown", "keydown"].forEach(function (type) {
        window.addEventListener(type, unlock, { capture: true, passive: true });
    });

    // Hover over menu items: once per item, throttled
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
            setTimeout(function () { if (f.getAttribute("aria-pressed") === "true") play("select"); }, 0);
        }
    }, true);

    // The stage: whoosh as a panel opens; ambience while a project panel is open
    if (stage && "MutationObserver" in window) {
        var panel = stage.querySelector(".stage-panel");
        new MutationObserver(function () {
            if (!stage.hidden) {
                playSoon("whoosh");
                var isProject = !panel.classList.contains("stage-panel--doc");
                if (isProject) startAmbience();
            } else {
                stopAmbience();
            }
        }).observe(stage, { attributes: true, attributeFilter: ["hidden"] });
    }

    // Mute toggle
    var btn = document.querySelector(".sound-toggle");
    function render() {
        if (!btn) return;
        btn.setAttribute("aria-pressed", String(!muted));
        btn.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
        btn.title = muted ? "Sound off" : "Sound on";
        var i = btn.querySelector("i");
        if (i) i.className = muted ? "fas fa-volume-mute" : "fas fa-volume-up";
    }
    if (btn) {
        btn.addEventListener("click", function () {
            muted = !muted;
            try { localStorage.setItem(KEY, muted ? "off" : "on"); } catch (e) { /* ignore */ }
            unlock();
            if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
            if (muted) stopAmbience(0.2);
            render();
            if (!muted) setTimeout(function () { play("hover"); }, 60); // audible confirmation
        });
        render();
    }
})();
