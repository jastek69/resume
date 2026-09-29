/* Liquid glass behavior. Motion explains state; nothing here is decorative-only.
   Every animation reads its timing from the CSS motion tokens and collapses
   to an instant state change under prefers-reduced-motion. */
(function () {
    "use strict";

    var root = document.documentElement;
    root.classList.add("js");

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    function token(name) {
        return getComputedStyle(root).getPropertyValue(name).trim();
    }

    function ms(name) {
        var v = token(name);
        return v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000;
    }

    function motionOn() {
        return !reduceMotion.matches;
    }

    /* ---------- Pointer light: ambient spotlight + per-panel specular ---------- */

    var pending = null;
    window.addEventListener("pointermove", function (e) {
        if (pending) return;
        pending = requestAnimationFrame(function () {
            root.style.setProperty("--mx", e.clientX + "px");
            root.style.setProperty("--my", e.clientY + "px");
            pending = null;
        });
    }, { passive: true });

    document.querySelectorAll(".glass").forEach(function (el) {
        el.addEventListener("pointermove", function (e) {
            if (!finePointer.matches) return;
            var r = el.getBoundingClientRect();
            var x = e.clientX - r.left;
            var y = e.clientY - r.top;
            el.style.setProperty("--px", x + "px");
            el.style.setProperty("--py", y + "px");
            el.classList.add("is-lit");

            // Panels bend slightly toward the pointer
            if (el.classList.contains("panel") && motionOn()) {
                var max = parseFloat(token("--tilt-max")) || 0;
                el.style.setProperty("--ry", (((x / r.width) - 0.5) * 2 * max).toFixed(2) + "deg");
                el.style.setProperty("--rx", (((0.5 - y / r.height)) * 2 * max).toFixed(2) + "deg");
            }
        });
        el.addEventListener("pointerleave", function () {
            el.classList.remove("is-lit");
            el.style.removeProperty("--rx");
            el.style.removeProperty("--ry");
        });
    });

    /* ---------- Reveal on scroll ---------- */

    var revealables = document.querySelectorAll("[data-reveal]");
    if ("IntersectionObserver" in window) {
        var revealer = new IntersectionObserver(function (entries) {
            // Stagger siblings that enter together
            var batch = entries.filter(function (en) { return en.isIntersecting; });
            batch.forEach(function (en, i) {
                en.target.style.setProperty("--reveal-delay", motionOn() ? Math.min(i * 60, 300) + "ms" : "0ms");
                en.target.classList.add("is-in");
                revealer.unobserve(en.target);
                // Drop the stagger once revealed so later hovers respond instantly
                setTimeout(function () {
                    en.target.style.removeProperty("--reveal-delay");
                    en.target.classList.add("is-settled");
                }, ms("--dur-slow") + 320);
            });
        }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
        revealables.forEach(function (el) { revealer.observe(el); });
    } else {
        revealables.forEach(function (el) { el.classList.add("is-in"); });
    }

    /* ---------- Bead: a morphing indicator that slides between options ---------- */

    function moveBead(bead, target, container) {
        if (!bead || !target) return;
        var c = container.getBoundingClientRect();
        var t = target.getBoundingClientRect();
        bead.style.setProperty("--bead-x", (t.left - c.left + container.scrollLeft) + "px");
        bead.style.setProperty("--bead-y", (t.top - c.top) + "px");
        bead.style.setProperty("--bead-w", t.width + "px");
        bead.style.setProperty("--bead-h", t.height + "px");
        bead.style.setProperty("--bead-o", "1");
    }

    /* ---------- Nav: active section ---------- */

    var navList = document.querySelector(".nav-links");
    var navBead = document.querySelector(".nav-bead");
    var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
    var activeLink = null;

    function setActive(id) {
        var link = navLinks.find(function (a) { return a.getAttribute("href") === "#" + id; }) || null;
        if (link === activeLink) return;
        navLinks.forEach(function (a) { a.removeAttribute("aria-current"); });
        activeLink = link;
        if (link) {
            link.setAttribute("aria-current", "true");
            moveBead(navBead, link, navList);
            link.scrollIntoView({ block: "nearest", inline: "nearest" });
        } else if (navBead) {
            navBead.style.setProperty("--bead-o", "0");
        }
    }

    // A page-level link (e.g. Architecture) starts with the bead on it
    var pageLink = navList && navList.querySelector('[aria-current="page"]');
    if (pageLink) requestAnimationFrame(function () { moveBead(navBead, pageLink, navList); });

    if ("IntersectionObserver" in window) {
        var sections = navLinks
            .map(function (a) { var h = a.getAttribute("href"); return h.charAt(0) === "#" ? document.querySelector(h) : null; })
            .filter(Boolean);
        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) setActive(en.target.id);
            });
        }, { rootMargin: "-45% 0px -50% 0px" });
        sections.forEach(function (s) { spy.observe(s); });
        var topEl = document.getElementById("top");
        if (topEl) spy.observe(topEl);
    }

    /* ---------- Filters with FLIP reflow ---------- */

    var filters = document.querySelector(".filters");
    var filterBead = document.querySelector(".filter-bead");
    var panelGrid = document.querySelector("[data-filter-grid]");
    var panels = panelGrid ? Array.prototype.slice.call(panelGrid.querySelectorAll(":scope > [data-domain]")) : [];
    var noun = (panelGrid && panelGrid.dataset.noun) || "project";
    var isWork = !!(panelGrid && panelGrid.id === "panels");
    var archive = document.querySelector(".archive");
    var announcer = document.getElementById("announcer");

    function applyFilter(value) {
        var first = new Map();
        panels.forEach(function (p) {
            if (!p.hidden) first.set(p, p.getBoundingClientRect());
        });

        var shown = 0;
        panels.forEach(function (p) {
            var match = value === "all" || p.dataset.domain.split(" ").indexOf(value) !== -1;
            p.hidden = !match;
            if (match) shown++;
        });
        if (archive) archive.hidden = !(value === "all" || value === "blockchain");

        if (announcer) announcer.textContent = shown + " " + noun + (shown === 1 ? "" : "s") + " shown";
        if (!motionOn() || !panelGrid.animate) return;

        var dur = ms("--dur-slow");
        var ease = token("--ease-emphasized");
        panels.forEach(function (p) {
            if (p.hidden) return;
            var last = p.getBoundingClientRect();
            var was = first.get(p);
            if (was) {
                var dx = was.left - last.left;
                var dy = was.top - last.top;
                if (dx || dy) {
                    p.animate(
                        [{ translate: dx + "px " + dy + "px" }, { translate: "0 0" }],
                        { duration: dur, easing: ease }
                    );
                }
            } else {
                p.animate(
                    [{ opacity: 0, scale: "0.94" }, { opacity: 1, scale: "1" }],
                    { duration: dur, easing: ease }
                );
            }
        });
    }

    if (filters) {
        var buttons = Array.prototype.slice.call(filters.querySelectorAll(".filter"));
        filters.addEventListener("click", function (e) {
            var btn = e.target.closest(".filter");
            if (!btn) return;
            buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
            moveBead(filterBead, btn, filters);
            btn.scrollIntoView({ block: "nearest", inline: "nearest", behavior: motionOn() ? "smooth" : "auto" });
            activate(null);
            applyFilter(btn.dataset.filter);
        });
        requestAnimationFrame(function () {
            moveBead(filterBead, filters.querySelector('[aria-pressed="true"]'), filters);
        });
    }

    /* ---------- Work: the pointed-at panel grows and the view centers on it ---------- */

    var activePanel = null;
    var anchor = null; // pointer position when we last scrolled; hover is frozen until it moves
    var dwell = null;

    function setOrigin(p) {
        // Grow inward from the grid edge so edge panels stay on the page
        var g = panelGrid.getBoundingClientRect();
        var r = p.getBoundingClientRect();
        var mid = r.left + r.width / 2;
        var third = g.width / 3;
        p.style.setProperty("--origin", mid < g.left + third ? "left center" : mid > g.right - third ? "right center" : "center");
    }

    function activate(p) {
        if (!isWork || p === activePanel) return;
        if (activePanel) activePanel.classList.remove("is-active");
        activePanel = p;
        if (p) {
            setOrigin(p);
            p.classList.add("is-active");
        }
        panelGrid.classList.toggle("has-active", !!p);
    }

    function centerOn(p, pt) {
        if (!motionOn() || source || !p.isConnected || p.hidden) return;
        var r = p.getBoundingClientRect();
        var delta = r.top + r.height / 2 - window.innerHeight / 2;
        if (Math.abs(delta) < 32) return;
        anchor = pt; // the scroll will slide other panels under a still pointer; ignore that
        window.scrollBy({ top: delta, behavior: "smooth" });
    }

    if (isWork) panelGrid.addEventListener("pointermove", function (e) {
        if (e.pointerType !== "mouse" || source) return;
        if (anchor) {
            if (Math.abs(e.clientX - anchor.x) + Math.abs(e.clientY - anchor.y) < 10) return;
            anchor = null;
        }
        var p = e.target.closest(".panel");
        if (p === activePanel) return;
        activate(p);
        clearTimeout(dwell);
        if (p) {
            var pt = { x: e.clientX, y: e.clientY };
            // Center only after the pointer rests, so passing over panels doesn't scroll
            dwell = setTimeout(function () { if (activePanel === p) centerOn(p, pt); }, 450);
        }
    });

    if (isWork) panelGrid.addEventListener("pointerleave", function () {
        if (anchor) return;
        clearTimeout(dwell);
        activate(null);
    });

    window.addEventListener("resize", function () {
        if (activeLink) moveBead(navBead, activeLink, navList);
        if (filters) moveBead(filterBead, filters.querySelector('[aria-pressed="true"]'), filters);
    });

    /* ---------- Stage: a panel opens, recenters, and the page recedes ---------- */

    var stage = document.querySelector(".stage");
    var stagePanel = stage.querySelector(".stage-panel");
    var stageContent = stage.querySelector(".stage-content");
    var source = null;
    var lastFocus = null;
    var closing = false;

    function morph(from, to, opts) {
        // FLIP: animate the stage shell from one rect to the other
        var dx = from.left - to.left;
        var dy = from.top - to.top;
        var sx = from.width / to.width;
        var sy = from.height / to.height;
        var a = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
        var frames = opts.reverse ? [{ transform: "none" }, { transform: a }] : [{ transform: a }, { transform: "none" }];
        return stagePanel.animate(frames, { duration: opts.duration, easing: opts.easing, fill: "both" });
    }

    // Open the stage from any origin element; fill() writes the content
    function openStage(origin, fill, variant) {
        if (source) return;
        source = origin;
        lastFocus = document.activeElement;

        stageContent.innerHTML = "";
        fill(stageContent);
        stagePanel.classList.toggle("stage-panel--doc", variant === "doc" || variant === "diagram");
        stagePanel.classList.toggle("stage-panel--diagram", variant === "diagram");

        var gap = window.innerWidth - root.clientWidth;
        document.body.style.paddingRight = gap ? gap + "px" : "";
        document.body.classList.add("is-locked", "stage-open");
        stage.hidden = false;
        stagePanel.scrollTop = 0;

        var from = origin.getBoundingClientRect();
        var to = stagePanel.getBoundingClientRect();
        origin.classList.add("is-source");

        requestAnimationFrame(function () {
            stage.classList.add("is-in");
        });

        if (motionOn() && stagePanel.animate) {
            var anim = morph(from, to, { duration: ms("--dur-slow"), easing: token("--ease-emphasized") });
            anim.onfinish = function () { anim.cancel(); };
        }

        stagePanel.focus({ preventScroll: true });
    }

    function openPanel(panel) {
        clearTimeout(dwell);
        anchor = null;
        activate(null);
        openStage(panel, function (target) {
            // Header + detail, copied from the card
            ["panel-tags", "panel-title", "panel-summary", "panel-meta"].forEach(function (cls) {
                var el = panel.querySelector("." + cls);
                if (el) target.appendChild(el.cloneNode(true));
            });
            var title = target.querySelector(".panel-title");
            title.textContent = title.textContent.trim();
            title.id = "stage-title";
            target.appendChild(panel.querySelector(".panel-detail").cloneNode(true));
        });
    }

    /* ---------- Résumé viewer: same stage, document variant ---------- */

    var resumeTpl = document.getElementById("resume-viewer");
    // Phones and tablets rarely render PDFs inline; offer open/download instead
    var inlinePdf = window.matchMedia("(min-width: 760px) and (pointer: fine)");

    document.querySelectorAll("[data-open-resume]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            if (!resumeTpl) return;
            e.preventDefault();
            openStage(btn, function (target) {
                target.appendChild(resumeTpl.content.cloneNode(true));
                var frame = target.querySelector(".doc-frame");
                var fallback = target.querySelector(".doc-fallback");
                if (inlinePdf.matches) {
                    frame.src = frame.dataset.src;
                    fallback.hidden = true;
                } else {
                    frame.remove();
                }
            }, "doc");
        });
    });

    function closePanel() {
        if (!source || closing) return;
        closing = true;
        var panel = source;

        stage.classList.remove("is-in");
        document.body.classList.remove("stage-open");

        var finished = false;
        function done() {
            if (finished) return;
            finished = true;
            stage.hidden = true;
            stageContent.innerHTML = "";
            panel.classList.remove("is-source");
            document.body.classList.remove("is-locked");
            document.body.style.paddingRight = "";
            source = null;
            closing = false;
            var opener = panel.querySelector && panel.querySelector(".panel-open");
            (opener || lastFocus || document.body).focus({ preventScroll: true });
        }

        if (motionOn() && stagePanel.animate && !panel.hidden) {
            var from = panel.getBoundingClientRect();
            var to = stagePanel.getBoundingClientRect();
            var anim = morph(from, to, { duration: ms("--dur-base"), easing: token("--ease-exit"), reverse: true });
            anim.onfinish = function () { anim.cancel(); done(); };
            // Background tabs may never fire onfinish; don't leave the page locked
            setTimeout(function () { anim.cancel(); done(); }, ms("--dur-base") + 400);
        } else {
            done();
        }
    }

    if (isWork) panelGrid.addEventListener("click", function (e) {
        if (e.target.closest("a")) return; // repo links inside a card open directly
        var panel = e.target.closest(".panel");
        if (panel) openPanel(panel);
    });

    stage.addEventListener("click", function (e) {
        if (e.target.closest("[data-close]")) closePanel();
    });

    document.addEventListener("keydown", function (e) {
        if (!source) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closePanel();
            return;
        }
        if (e.key === "Tab") {
            // Keep focus inside the open panel
            var focusables = Array.prototype.slice.call(
                stagePanel.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
            );
            if (!focusables.length) return;
            var firstEl = focusables[0];
            var lastEl = focusables[focusables.length - 1];
            if (e.shiftKey && (document.activeElement === firstEl || document.activeElement === stagePanel)) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    });

    /* ---------- Experience: panels open and close in place ---------- */

    document.querySelectorAll(".role-toggle").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var role = btn.closest(".role");
            var open = !role.classList.contains("is-open");
            role.classList.toggle("is-open", open);
            btn.setAttribute("aria-expanded", String(open));
        });
    });

    /* ---------- Copy email with visible state change ---------- */

    var copyBtn = document.querySelector(".copy-email");
    if (copyBtn && navigator.clipboard) {
        var label = copyBtn.querySelector("span");
        copyBtn.addEventListener("click", function () {
            navigator.clipboard.writeText(copyBtn.dataset.email).then(function () {
                copyBtn.classList.add("is-done");
                label.textContent = "Copied";
                setTimeout(function () {
                    copyBtn.classList.remove("is-done");
                    label.textContent = "Copy email";
                }, 2000);
            });
        });
    } else if (copyBtn) {
        copyBtn.hidden = true;
    }

    var year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();
    window.Site = { openStage: openStage, closeStage: closePanel, motionOn: motionOn, token: token, ms: ms };
})();
