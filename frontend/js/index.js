// js/index.js — marketing page logic only
// ADD at top of index.js
import { initAuthListener } from './auth.js';
initAuthListener();
/* ── Scroll reveal ── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("reveal-visible");
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal-on-scroll")
  .forEach(el => revealObserver.observe(el));

/* ── Animated stat counters ── */
const statObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = Number(el.dataset.target);
    let current = 0;
    const increment = target / 40;
    const tick = () => {
      current += increment;
      if (current >= target) {
        el.textContent = target;
      } else {
        el.textContent = Math.floor(current);
        requestAnimationFrame(tick);
      }
    };
    tick();
    statObserver.unobserve(el);
  });
}, { threshold: 0.4 });

document.querySelectorAll(".stat-number")
  .forEach(el => statObserver.observe(el));

/* ── CTA buttons → quiz page ── */
["hero-start-btn", "floating-cta"].forEach(id => {
  document.getElementById(id)
    ?.addEventListener("click", () => {
      window.location.href = "/quiz.html";
    });
});

/* ── Header auth button ── */
document.getElementById("header-auth-btn")
  ?.addEventListener("click", () => {
    window.location.href = "/auth.html?mode=signup";
  });

/* ── Upgrade buttons ── */
document.querySelectorAll("#upgrade-btn-global")
  .forEach(btn => btn.addEventListener("click", () => {
    window.location.href = "/pricing.html";
  }));
