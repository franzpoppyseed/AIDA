(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function bootIntro() {
    const veil = $("#introVeil");
    if (!veil) return;
    const finish = () => veil.classList.add("is-gone");
    if (reduceMotion) finish();
    else window.setTimeout(finish, 1100);
  }

  function initReveal() {
    const nodes = $$(".motion-reveal");
    if (!nodes.length) return;
    nodes.forEach((node, index) => node.style.transitionDelay = `${Math.min(index * 55, 330)}ms`);
    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(node => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6%" });
    nodes.forEach(node => observer.observe(node));
  }

  function initCursorAura() {
    const aura = $("#cursorAura");
    if (!aura || reduceMotion || matchMedia("(pointer: coarse)").matches) return;
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let tx = x;
    let ty = y;
    window.addEventListener("pointermove", event => {
      tx = event.clientX;
      ty = event.clientY;
    }, { passive: true });
    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      aura.style.transform = `translate3d(${x - 190}px,${y - 190}px,0)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function initTilt() {
    if (reduceMotion || matchMedia("(pointer: coarse)").matches) return;
    const cards = $$(".motion-card");
    cards.forEach(card => {
      let frame = 0;
      const onMove = event => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.transform = `perspective(1200px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) translateY(-4px)`;
        });
      };
      card.addEventListener("pointermove", onMove, { passive: true });
      card.addEventListener("pointerleave", () => {
        cancelAnimationFrame(frame);
        card.style.transform = "";
      });
    });
  }

  function initMagneticControls() {
    if (reduceMotion || matchMedia("(pointer: coarse)").matches) return;
    const selector = ".btn, .primary-nav button, .modal-close, .analyze-button, .control-button";
    $$(selector).forEach(control => {
      control.addEventListener("pointermove", event => {
        const rect = control.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        control.style.transform = `translate3d(${(x * 0.09).toFixed(1)}px,${(y * 0.09).toFixed(1)}px,0)`;
      }, { passive: true });
      control.addEventListener("pointerleave", () => control.style.transform = "");
    });
  }

  function initClickRipples() {
    if (reduceMotion) return;
    document.addEventListener("pointerdown", event => {
      const target = event.target.closest("button, .btn, .library-item, .queue-card");
      if (!target) return;
      const ripple = document.createElement("i");
      ripple.className = "motion-ripple";
      ripple.style.left = `${event.clientX}px`;
      ripple.style.top = `${event.clientY}px`;
      document.body.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    }, { passive: true });
  }

  function initGlitchPulse() {
    const mark = $(".glitch-mark");
    if (!mark || reduceMotion) return;
    let timer = 0;
    const pulse = () => {
      mark.classList.add("is-glitching");
      window.setTimeout(() => mark.classList.remove("is-glitching"), 480);
      timer = window.setTimeout(pulse, 2800 + Math.random() * 4200);
    };
    timer = window.setTimeout(pulse, 1800);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) window.clearTimeout(timer);
      else timer = window.setTimeout(pulse, 1400);
    });
  }

  function initDialogMotion() {
    const actionMap = new Map([
      ["open-study", "studyStudio"],
      ["review", "reviewStudio"],
      ["usage-lab", "usageLabDialog"],
      ["context-browser", "contextBrowserDialog"],
      ["data-library", "dataLibrary"],
      ["profile", "profileDialog"],
      ["progress", "progressDialog"]
    ]);

    const sync = () => {
      const openIds = new Set($$("dialog[open]").map(dialog => dialog.id));
      $$(".primary-nav [data-action]").forEach(button => {
        const id = actionMap.get(button.dataset.action);
        button.classList.toggle("active", Boolean(id && openIds.has(id)));
      });
    };

    $$("dialog").forEach(dialog => {
      dialog.addEventListener("close", sync);
      dialog.addEventListener("cancel", sync);
    });
    document.addEventListener("click", event => {
      if (event.target.closest("[data-action]")) requestAnimationFrame(sync);
    });
  }

  function initCanvas() {
    const canvas = $("#motionCanvas");
    if (!canvas || reduceMotion) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];
    let pointerX = innerWidth * 0.5;
    let pointerY = innerHeight * 0.35;
    let raf = 0;
    let last = performance.now();

    const palette = [
      [217, 255, 55],
      [111, 44, 255],
      [114, 239, 255],
      [255, 255, 255]
    ];

    const makeParticle = () => {
      const color = palette[Math.floor(Math.random() * palette.length)];
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.04 + Math.random() * 0.14,
        size: 0.6 + Math.random() * 1.3,
        alpha: 0.08 + Math.random() * 0.25,
        color
      };
    };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      width = innerWidth;
      height = innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(30, Math.min(92, Math.round((width * height) / 22000)));
      particles = Array.from({ length: count }, makeParticle);
    };

    const draw = now => {
      const dt = Math.min(32, now - last);
      last = now;
      ctx.clearRect(0, 0, width, height);

      const gradient = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, Math.max(width, height) * 0.34);
      gradient.addColorStop(0, "rgba(114,239,255,.025)");
      gradient.addColorStop(0.42, "rgba(111,44,255,.015)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > height + 12) { p.y = -12; p.x = Math.random() * width; }
        if (p.x < -12) p.x = width + 12;
        if (p.x > width + 12) p.x = -12;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else { last = performance.now(); raf = requestAnimationFrame(draw); }
    });

    resize();
    raf = requestAnimationFrame(draw);
  }

  function initScrollParallax() {
    if (reduceMotion) return;
    const hero = $(".home-hero");
    const mark = $(".hero-mark");
    if (!hero || !mark) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, -rect.top / Math.max(rect.height, 1)));
      mark.style.transform = `translate3d(0,${(progress * 24).toFixed(1)}px,0)`;
    };
    window.addEventListener("scroll", () => {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
  }

  bootIntro();
  initReveal();
  initCursorAura();
  initTilt();
  initMagneticControls();
  initClickRipples();
  initGlitchPulse();
  initDialogMotion();
  initCanvas();
  initScrollParallax();
})();
