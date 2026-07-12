(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setupReveal() {
    const nodes = $$(".reveal-on-scroll");
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      nodes.forEach(node => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -5% 0px" });
    nodes.forEach(node => observer.observe(node));
  }

  function bindTilt(card) {
    if (!card || card.dataset.tiltBound === "true" || reducedMotion.matches) return;
    card.dataset.tiltBound = "true";
    const strength = Number(card.dataset.tiltStrength || 7);
    card.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.setProperty("--tilt-x", `${(-y * strength).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(x * strength).toFixed(2)}deg`);
      card.style.setProperty("--pointer-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--pointer-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      card.classList.add("is-tilting");
    });
    card.addEventListener("pointerleave", () => {
      card.classList.remove("is-tilting");
      card.style.removeProperty("--tilt-x");
      card.style.removeProperty("--tilt-y");
    });
  }

  function setupTilt() {
    const selector = [
      ".tilt-card",
      ".context-review-card",
      ".context-passage-card",
      ".library-item",
      ".queue-card",
      ".single-study-card",
      ".review-flashcard"
    ].join(",");
    $$(selector).forEach(bindTilt);
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(selector)) bindTilt(node);
        $$(selector, node).forEach(bindTilt);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupGlitch() {
    const target = $(".glitch-text");
    if (!target || reducedMotion.matches) return;
    const pulse = () => {
      target.classList.add("is-glitching");
      window.setTimeout(() => target.classList.remove("is-glitching"), 620);
      window.setTimeout(pulse, 3200 + Math.random() * 2800);
    };
    window.setTimeout(pulse, 1100);
  }

  function setupDialogGlow() {
    document.addEventListener("pointermove", event => {
      const dialog = event.target.closest("dialog[open]");
      if (!dialog) return;
      const rect = dialog.getBoundingClientRect();
      dialog.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      dialog.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }, { passive: true });
  }

  function setupActiveNav() {
    const map = new Map([
      ["studyStudio", "open-study"],
      ["reviewStudio", "review"],
      ["usageLabDialog", "usage-lab"],
      ["contextBrowserDialog", "context-browser"],
      ["dataLibrary", "data-library"],
      ["profileDialog", "profile"],
      ["progressDialog", "progress"]
    ]);
    const navButtons = $$("[data-action]");
    const sync = () => {
      const open = $$('dialog[open]').find(dialog => map.has(dialog.id));
      const action = open ? map.get(open.id) : "";
      navButtons.forEach(button => button.classList.toggle("active", button.dataset.action === action));
    };
    const observer = new MutationObserver(sync);
    $$('dialog').forEach(dialog => observer.observe(dialog, { attributes: true, attributeFilter: ["open"] }));
    sync();
  }

  function setupCanvas() {
    const canvas = $("#cyberCanvas");
    if (!canvas || reducedMotion.matches) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let raf = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(26, Math.min(70, Math.floor(width / 24)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: 0.12 + Math.random() * 0.42,
        length: 18 + Math.random() * 80,
        alpha: 0.03 + Math.random() * 0.12
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 1;
      particles.forEach((particle, index) => {
        particle.y += particle.speed;
        if (particle.y > height + particle.length) {
          particle.y = -particle.length;
          particle.x = Math.random() * width;
        }
        ctx.strokeStyle = index % 9 === 0
          ? `rgba(212,255,50,${particle.alpha})`
          : index % 13 === 0
            ? `rgba(109,33,255,${particle.alpha})`
            : `rgba(255,255,255,${particle.alpha * 0.45})`;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y - particle.length);
        ctx.lineTo(particle.x, particle.y);
        ctx.stroke();
      });
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else draw();
    });
  }

  function setupButtonBursts() {
    document.addEventListener("pointerdown", event => {
      const button = event.target.closest("button, .btn");
      if (!button) return;
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--click-x", `${event.clientX - rect.left}px`);
      button.style.setProperty("--click-y", `${event.clientY - rect.top}px`);
      button.classList.remove("button-burst");
      void button.offsetWidth;
      button.classList.add("button-burst");
    });
  }

  function init() {
    setupReveal();
    setupTilt();
    setupGlitch();
    setupDialogGlow();
    setupActiveNav();
    setupCanvas();
    setupButtonBursts();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
