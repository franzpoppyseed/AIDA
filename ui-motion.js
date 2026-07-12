(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  document.documentElement.classList.add("motion-ready");

  // Page entrance.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.add("page-loaded"));
  });

  // Soft cursor light. It stays subtle so the matte finish does not turn glossy.
  if (!reducedMotion && !coarsePointer) {
    window.addEventListener("pointermove", event => {
      document.documentElement.style.setProperty("--pointer-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--pointer-y", `${event.clientY}px`);
    }, { passive: true });
  }

  // Scroll reveal with a small stagger.
  const revealTargets = [
    ".intro-copy > *",
    ".intro-actions",
    ".track-grid .panel",
    ".workspace-grid .panel",
    ".site-footer"
  ].flatMap(selector => $$(selector));

  revealTargets.forEach((node, index) => {
    node.classList.add("motion-reveal");
    node.style.setProperty("--reveal-delay", `${Math.min(index * 45, 360)}ms`);
  });

  if (!reducedMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5% 0px" });

    revealTargets.forEach(node => observer.observe(node));
  } else {
    revealTargets.forEach(node => node.classList.add("is-visible"));
  }

  // Subtle panel depth. This is intentionally restrained.
  if (!reducedMotion && !coarsePointer) {
    const tiltTargets = $$(".panel, .single-study-card, .review-flashcard, .context-review-card, .context-passage-card");
    tiltTargets.forEach(card => {
      let frame = 0;
      card.addEventListener("pointermove", event => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          const rotateY = (x - 0.5) * 2.4;
          const rotateX = (0.5 - y) * 2.0;
          card.style.setProperty("--card-x", `${x * 100}%`);
          card.style.setProperty("--card-y", `${y * 100}%`);
          card.style.transform = `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
        });
      });
      card.addEventListener("pointerleave", () => {
        if (frame) cancelAnimationFrame(frame);
        card.style.transform = "";
      });
    });
  }

  // Magnetic movement on the main controls. Small enough to keep button alignment feeling exact.
  if (!reducedMotion && !coarsePointer) {
    const magnetic = $$(".btn, .primary-nav button, .text-button, .control-button, .modal-close, .rating-btn");
    magnetic.forEach(button => {
      button.addEventListener("pointermove", event => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        button.style.setProperty("--magnet-x", `${x * 0.06}px`);
        button.style.setProperty("--magnet-y", `${y * 0.06}px`);
      });
      button.addEventListener("pointerleave", () => {
        button.style.setProperty("--magnet-x", "0px");
        button.style.setProperty("--magnet-y", "0px");
      });
    });
  }

  // Clean click ripple for buttons.
  document.addEventListener("pointerdown", event => {
    const button = event.target.closest("button, .btn");
    if (!button || reducedMotion) return;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "matte-ripple";
    const size = Math.max(rect.width, rect.height) * 1.35;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });

  // Animate changing dashboard numbers without touching the learning logic.
  const numericTargets = [
    "#jpXpTop", "#yueXpTop", "#jpXpCard", "#yueXpCard",
    "#jpProgressValue", "#yueProgressValue", "#reviewAllCount", "#reviewDueCount",
    "#reviewJpCount", "#reviewYueCount", "#streak"
  ].map(selector => $(selector)).filter(Boolean);

  numericTargets.forEach(node => {
    let lastText = node.textContent;
    const observer = new MutationObserver(() => {
      if (node.textContent === lastText) return;
      lastText = node.textContent;
      node.animate([
        { opacity: 0.45, transform: "translateY(5px)" },
        { opacity: 1, transform: "translateY(0)" }
      ], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true });
  });

  // Top bar becomes a little tighter after the user starts scrolling.
  let ticking = false;
  const updateScrollState = () => {
    document.body.classList.toggle("has-scrolled", window.scrollY > 24);
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(updateScrollState);
      ticking = true;
    }
  }, { passive: true });
  updateScrollState();
})();
