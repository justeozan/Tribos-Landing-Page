/* Tribos - progressive enhancement only.
   No scroll listeners: nav state and reveals both use IntersectionObserver,
   and the rail progress bar is a CSS scroll-driven animation. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Disarm the head script's dead-man switch: this file loaded, so the reveal
  // styles can stay armed and the observer below will show each block.
  if (window.__tribosRevealFallback) {
    clearTimeout(window.__tribosRevealFallback);
    window.__tribosRevealFallback = null;
  }

  /* ---------- Theme ---------- */
  var STORE = "tribos-theme";

  function applyTheme(value) {
    if (value === "light" || value === "dark") {
      root.setAttribute("data-theme", value);
    } else {
      root.removeAttribute("data-theme");
    }
  }

  function currentTheme() {
    var set = root.getAttribute("data-theme");
    if (set) return set;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  var themeToggles = document.querySelectorAll("[data-theme-toggle]");

  // The markup ships the light-mode label. Anyone arriving in dark mode (system
  // preference or a stored choice) heard "Passer en thème sombre" on a button
  // that does the opposite, and only one of the two toggles was ever corrected.
  function syncThemeLabels() {
    var label =
      currentTheme() === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
    themeToggles.forEach(function (btn) {
      btn.setAttribute("aria-label", label);
    });
  }

  syncThemeLabels();

  themeToggles.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(STORE, next);
      } catch (e) {
        /* private mode: the toggle still works for this page view */
      }
      syncThemeLabels();
    });
  });

  // Keep the label honest when the OS preference flips and no explicit choice
  // has been stored.
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  var onSystemChange = function () {
    if (!root.hasAttribute("data-theme")) syncThemeLabels();
  };
  if (systemDark.addEventListener) systemDark.addEventListener("change", onSystemChange);
  else if (systemDark.addListener) systemDark.addListener(onSystemChange);

  /* ---------- Nav elevation ---------- */
  var nav = document.querySelector("[data-nav]");
  var sentinel = document.querySelector("[data-nav-sentinel]");
  if (nav && sentinel && "IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        nav.dataset.stuck = String(!entries[0].isIntersecting);
      },
      { rootMargin: "0px" }
    ).observe(sentinel);
  }

  /* ---------- Scroll reveal ---------- */
  var revealables = document.querySelectorAll(".reveal");
  if (reduce.matches || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) {
      el.classList.add("is-in");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
  }

  /* ---------- Mobile menu ---------- */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-menu]");
  if (menuBtn && menu) {
    // The panel is fixed over the page, so without this the page behind it
    // stays in the tab order and focus disappears under the overlay.
    var behind = [
      document.querySelector("main"),
      document.querySelector("footer"),
      document.querySelector(".nav-links"),
    ].filter(Boolean);

    var setMenu = function (open) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
      menu.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
      behind.forEach(function (el) {
        if (open) {
          el.setAttribute("inert", "");
          el.setAttribute("aria-hidden", "true");
        } else {
          el.removeAttribute("inert");
          el.removeAttribute("aria-hidden");
        }
      });
      if (open) {
        var first = menu.querySelector("a, button");
        if (first) first.focus();
      }
    };
    menuBtn.addEventListener("click", function () {
      setMenu(menuBtn.getAttribute("aria-expanded") !== "true");
    });
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        menuBtn.focus();
      }
    });
  }

  /* ---------- Waitlist form ---------- */
  var form = document.querySelector("[data-waitlist]");
  if (!form) return;

  var status = form.querySelector("[data-status]");
  var submit = form.querySelector('button[type="submit"]');
  var emailField = form.querySelector("[data-field-email]");
  var email = form.querySelector('input[type="email"]');
  var emailError = form.querySelector("#email-error");
  var submitLabel = submit ? submit.textContent : "";

  // Native validation is suppressed only once we know JS is running. Without
  // this, `novalidate` in the markup would also disable the browser's own
  // required / type=email enforcement on the no-JS path, letting an empty
  // address through to Netlify.
  form.setAttribute("novalidate", "");

  function setStatus(state, message) {
    if (!status) return;
    if (!state) {
      status.removeAttribute("data-state");
      status.textContent = "";
      return;
    }
    status.setAttribute("data-state", state);
    status.textContent = message;
  }

  // Field problems are reported on the field; the status line is reserved for
  // network state. Otherwise one bad address produced two different messages
  // in two places at once.
  function setFieldError(message) {
    if (!emailField || !email || !emailError) return;
    if (!message) {
      emailField.removeAttribute("data-invalid");
      email.removeAttribute("aria-invalid");
      email.setAttribute("aria-describedby", "email-help");
      emailError.textContent = "";
      return;
    }
    emailField.setAttribute("data-invalid", "true");
    email.setAttribute("aria-invalid", "true");
    email.setAttribute("aria-describedby", "email-error email-help");
    emailError.textContent = message;
  }

  if (email && emailField) {
    email.addEventListener("input", function () {
      setFieldError(null);
      if (status && status.getAttribute("data-state") === "error") setStatus(null);
    });
  }

  form.addEventListener("submit", function (event) {
    if (email && !email.checkValidity()) {
      event.preventDefault();
      setFieldError(
        email.validity.valueMissing
          ? "Il manque ton adresse email."
          : "Cette adresse email n\u2019a pas l\u2019air valide."
      );
      email.focus();
      return;
    }
    setFieldError(null);

    // Netlify Forms needs a real POST. We do it over fetch so the page can
    // show sending / success / failure instead of a full reload, and fall
    // back to the native submit when fetch is unavailable or fails.
    if (!window.fetch || !window.FormData || !window.URLSearchParams) return;

    event.preventDefault();
    var data = new URLSearchParams(new FormData(form)).toString();

    if (submit) {
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Envoi…";
    }
    setStatus("sending", "Envoi de ton inscription…");

    // Netlify Forms is posted to the page that contains the form, not to the
    // success page the `action` attribute points at.
    fetch(form.dataset.endpoint || window.location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: data,
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        window.location.assign(form.dataset.success || "./merci.html");
      })
      .catch(function () {
        if (submit) {
          submit.removeAttribute("aria-busy");
          submit.textContent = submitLabel;
        }
        setStatus(
          "error",
          "L\u2019envoi a \u00e9chou\u00e9. R\u00e9essaie dans un instant."
        );
      });
  });
})();
