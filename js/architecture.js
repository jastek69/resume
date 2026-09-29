/* Architecture page: render Mermaid diagrams lazily, open them in the stage
   with zoom and pan. Relies on site.js (window.Site) for the stage itself. */
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "Inter, system-ui, sans-serif",
    themeVariables: {
        darkMode: true,
        background: "transparent",
        fontSize: "14px",
        primaryColor: "#12203a",
        primaryTextColor: "#e9eefb",
        primaryBorderColor: "#6ee7ff",
        secondaryColor: "#1b1640",
        tertiaryColor: "#0d1526",
        lineColor: "#8a98bb",
        textColor: "#e9eefb",
        clusterBkg: "#0b1222",
        clusterBorder: "#3d5a80",
        edgeLabelBackground: "#0a0f1c",
        nodeTextColor: "#e9eefb",
        actorBkg: "#12203a",
        actorBorder: "#6ee7ff",
        actorTextColor: "#e9eefb",
        actorLineColor: "#3d5a80",
        signalColor: "#aab5cd",
        signalTextColor: "#e9eefb",
        labelBoxBkgColor: "#12203a",
        labelBoxBorderColor: "#6ee7ff",
        labelTextColor: "#e9eefb",
        loopTextColor: "#e9eefb",
        noteBkgColor: "#1b1640",
        noteBorderColor: "#a78bfa",
        noteTextColor: "#e9eefb",
        activationBkgColor: "#1b1640",
        activationBorderColor: "#a78bfa",
        sequenceNumberColor: "#04121a",
    },
});

const cards = Array.from(document.querySelectorAll(".diagram-card"));
const rendered = new Map(); // card -> svg markup
let queue = Promise.resolve();
let seq = 0;

// Mermaid is not safe to run concurrently, so renders go through one queue
function render(card) {
    if (card.dataset.state) return queue;
    card.dataset.state = "pending";
    queue = queue.then(async () => {
        const preview = card.querySelector(".diagram-preview");
        const status = preview.querySelector(".diagram-status");
        const src = card.querySelector('script[type="text/x-mermaid"]');
        if (!src) {
            // Image diagrams need no rendering
            if (status) status.remove();
            card.dataset.state = "done";
            return;
        }
        try {
            const { svg } = await mermaid.render("mmd-" + ++seq, src.textContent);
            rendered.set(card, svg);
            preview.insertAdjacentHTML("beforeend", svg);
            if (status) status.remove();
            card.dataset.state = "done";
        } catch (err) {
            if (status) status.textContent = "This diagram couldn't be rendered.";
            card.dataset.state = "error";
            console.warn("mermaid render failed for", card.id, err);
        }
    });
    return queue;
}

if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (en.isIntersecting) {
                render(en.target);
                io.unobserve(en.target);
            }
        });
    }, { rootMargin: "300px 0px" });
    cards.forEach((c) => io.observe(c));
} else {
    cards.forEach(render);
}

/* ---------- Stage viewer with zoom + pan ---------- */

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

function buildViewer(card, target) {
    const tags = card.querySelector(".panel-tags").cloneNode(true);
    const title = document.createElement("h3");
    title.className = "panel-title";
    title.id = "stage-title";
    title.textContent = card.querySelector(".diagram-title").textContent;
    const caption = card.querySelector(".diagram-caption").cloneNode(true);

    const head = document.createElement("div");
    head.className = "doc-head";
    const headText = document.createElement("div");
    headText.append(tags, title, caption);

    const toolbar = document.createElement("div");
    toolbar.className = "diagram-toolbar";
    toolbar.setAttribute("role", "group");
    toolbar.setAttribute("aria-label", "Zoom");
    toolbar.innerHTML =
        '<button type="button" class="btn btn--icon" data-zoom="out" aria-label="Zoom out"><i class="fas fa-minus" aria-hidden="true"></i></button>' +
        '<button type="button" class="btn zoom-level" data-zoom="fit" aria-label="Fit to view">100%</button>' +
        '<button type="button" class="btn btn--icon" data-zoom="in" aria-label="Zoom in"><i class="fas fa-plus" aria-hidden="true"></i></button>';
    head.append(headText, toolbar);

    const canvas = document.createElement("div");
    canvas.className = "diagram-canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "Diagram. Use the zoom buttons, or drag to pan.");
    const layer = document.createElement("div");
    layer.className = "zoom-layer";
    const img = card.querySelector(".diagram-img");
    if (img) {
        const big = img.cloneNode(true);
        big.loading = "eager";
        layer.append(big);
        canvas.classList.add("is-image");
    } else if (rendered.has(card)) {
        layer.innerHTML = rendered.get(card);
        const svg = layer.querySelector("svg");
        svg.removeAttribute("style"); // drop Mermaid's max-width so zoom can enlarge it
        svg.removeAttribute("height");
        svg.setAttribute("width", "100%");
    } else {
        layer.innerHTML = '<p class="diagram-status">This diagram couldn\'t be rendered.</p>';
    }
    canvas.append(layer);
    target.append(head, canvas);

    // Zoom
    let zoom = 1;
    const level = toolbar.querySelector(".zoom-level");
    function setZoom(z, cx, cy) {
        const prev = zoom;
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
        // Keep the point under the cursor (or the center) steady while zooming
        const rect = canvas.getBoundingClientRect();
        const px = cx === undefined ? rect.width / 2 : cx - rect.left;
        const py = cy === undefined ? rect.height / 2 : cy - rect.top;
        const ox = (canvas.scrollLeft + px) / prev;
        const oy = (canvas.scrollTop + py) / prev;
        layer.style.width = zoom * 100 + "%";
        canvas.scrollLeft = ox * zoom - px;
        canvas.scrollTop = oy * zoom - py;
        level.textContent = Math.round(zoom * 100) + "%";
    }
    toolbar.addEventListener("click", (e) => {
        const b = e.target.closest("[data-zoom]");
        if (!b) return;
        const k = b.dataset.zoom;
        setZoom(k === "in" ? zoom * 1.25 : k === "out" ? zoom / 1.25 : 1);
    });
    canvas.addEventListener("wheel", (e) => {
        if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls; ctrl/cmd + wheel zooms
        e.preventDefault();
        setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
        if (e.key === "+" || e.key === "=") setZoom(zoom * 1.25);
        else if (e.key === "-") setZoom(zoom / 1.25);
        else if (e.key === "0") setZoom(1);
    });

    // Drag to pan
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, y: e.clientY, l: canvas.scrollLeft, t: canvas.scrollTop };
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add("is-dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        canvas.scrollLeft = drag.l - (e.clientX - drag.x);
        canvas.scrollTop = drag.t - (e.clientY - drag.y);
    });
    const endDrag = () => { drag = null; canvas.classList.remove("is-dragging"); };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
}

async function openDiagram(card, origin) {
    if (!window.Site) return;
    await render(card);
    window.Site.openStage(origin || card, (target) => buildViewer(card, target), "diagram");
}

document.addEventListener("click", (e) => {
    const card = e.target.closest(".diagram-card");
    if (!card) return;
    if (e.target.closest(".diagram-open")) {
        openDiagram(card, card);
    } else if (e.target.closest(".diagram-preview")) {
        openDiagram(card, card);
    }
});

// Deep link: architecture.html#<card-id> opens that diagram
if (location.hash) {
    const card = document.getElementById(location.hash.slice(1));
    if (card && card.classList.contains("diagram-card")) {
        card.scrollIntoView({ block: "center" });
        setTimeout(() => openDiagram(card, card), 600);
    }
}
