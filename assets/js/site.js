/* Tribos - progressive enhancement only.
   No bundler, no dependencies, no scroll listeners.

   Motion budget rules that the whole file obeys:
     - Nothing here is required to read the page. Every block below degrades to
       a static, fully legible page when JS is blocked, when the browser is old,
       or when the visitor asked for reduced motion.
     - There is not a single `scroll` event listener. Anything tied to scroll
       position is either an IntersectionObserver or a CSS scroll-driven
       animation (`animation-timeline`), both of which run off the main thread.
     - Pointer-driven effects (tilt, magnet) write to CSS custom properties
       inside one shared rAF, so N elements cost one frame callback, not N.
     - Only `transform`, `opacity` and `filter` are ever animated.
   ========================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduce = reduceQuery.matches;
  var hasIO = "IntersectionObserver" in window;

  // Disarm the head script's dead-man switch: this file loaded, so the reveal
  // styles can stay armed and the observer below will show each block.
  if (window.__tribosRevealFallback) {
    clearTimeout(window.__tribosRevealFallback);
    window.__tribosRevealFallback = null;
  }

  function on(media, fn) {
    if (media.addEventListener) media.addEventListener("change", fn);
    else if (media.addListener) media.addListener(fn);
  }

  /* =====================================================================
     Shared pointer frame

     Every pointer-reactive effect registers a writer here instead of owning
     its own requestAnimationFrame loop. One loop, coalesced writes, and it
     stops itself the moment nothing is hovered.
     ===================================================================== */
  var frameJobs = [];
  var frameQueued = false;

  function scheduleFrame() {
    if (frameQueued || reduce) return;
    frameQueued = true;
    requestAnimationFrame(function () {
      frameQueued = false;
      for (var i = 0; i < frameJobs.length; i++) frameJobs[i]();
      frameJobs.length = 0;
    });
  }

  function queue(job) {
    frameJobs.push(job);
    scheduleFrame();
  }

  /* =====================================================================
     Theme
     ===================================================================== */
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
  on(systemDark, function () {
    if (!root.hasAttribute("data-theme")) syncThemeLabels();
  });

  /* =====================================================================
     Nav elevation
     ===================================================================== */
  var nav = document.querySelector("[data-nav]");
  var sentinel = document.querySelector("[data-nav-sentinel]");
  if (nav && sentinel && hasIO) {
    new IntersectionObserver(
      function (entries) {
        nav.dataset.stuck = String(!entries[0].isIntersecting);
      },
      { rootMargin: "0px" }
    ).observe(sentinel);
  }

  /* =====================================================================
     Split text

     Wraps each word of a heading in its own span so the reveal can cascade
     across the line instead of fading the whole block at once.

     Accessibility: the original string is copied onto the parent as
     `aria-label` and every generated span is `aria-hidden`, so assistive tech
     reads one clean sentence rather than a stream of disconnected words.

     The split is whitespace-only. It never touches the characters themselves,
     so accented letters and the narrow no-break spaces used by French
     typography (U+202F, before ; : ! ?) survive intact: U+202F is not matched
     by the ASCII space class used here, which is exactly what we want, since
     splitting there would let a line break land in front of a punctuation mark.
     ===================================================================== */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    var text = el.textContent.replace(/\s+/g, " ").trim();
    if (!text) return;

    el.setAttribute("aria-label", text);

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    var index = 0;
    nodes.forEach(function (node) {
      // Skip whitespace-only nodes. Pretty-printed markup puts a newline and
      // indentation between every element, and wrapping those in a .word span
      // adds a phantom inline-block on its own line: a three-line headline
      // rendered with double leading because each line was preceded by an
      // empty 72px line box.
      if (!/\S/.test(node.nodeValue)) return;
      // Split on ASCII spaces only. U+202F and U+00A0 stay glued to their word,
      // which is the whole point of using them in the copy.
      var parts = node.nodeValue.split(/( )/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part === " ") {
          frag.appendChild(document.createTextNode(" "));
          return;
        }
        if (!part) return;
        var word = document.createElement("span");
        word.className = "word";
        word.setAttribute("aria-hidden", "true");
        word.style.setProperty("--w", index++);
        var inner = document.createElement("span");
        inner.className = "word-in";
        inner.textContent = part;
        word.appendChild(inner);
        frag.appendChild(word);
      });
      node.parentNode.replaceChild(frag, node);
    });

    // Children that were already elements (a <br>, an <em>) keep working; only
    // text nodes were rewritten. Hide the leftovers from AT so the aria-label
    // is the single source of truth.
    Array.prototype.forEach.call(el.children, function (child) {
      if (!child.classList.contains("word")) child.setAttribute("aria-hidden", "true");
    });

    el.dataset.splitDone = "true";
    el.style.setProperty("--words", index);
  }

  if (!reduce) {
    document.querySelectorAll("[data-split]").forEach(splitWords);
  }

  /* =====================================================================
     Reveal on enter

     One observer for the whole page. `.reveal` blocks fade up; `[data-split]`
     headings cascade their words. Both are unobserved after firing, so a long
     page never accumulates live observers.
     ===================================================================== */
  var revealables = document.querySelectorAll(".reveal, [data-split]");

  if (reduce || !hasIO) {
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
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    revealables.forEach(function (el) {
      io.observe(el);
    });
  }

  /* =====================================================================
     Count up

     `<span data-count="2165">2165</span>` ticks from 0 to the final value the
     first time it scrolls into view. The DOM already contains the final
     number, so no-JS and reduced-motion visitors simply read it.
     ===================================================================== */
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  // Mirror the thousands separator the copy actually used, rather than guessing
  // a locale. French writes "5\u202F000" with a narrow no-break space and
  // "2165" with nothing at all; re-formatting either one would quietly rewrite
  // a number the copy set deliberately.
  var SEPARATORS = ["\u202F", "\u00A0", "\u2009", " "];

  function separatorOf(sample) {
    for (var i = 0; i < SEPARATORS.length; i++) {
      if (sample.indexOf(SEPARATORS[i]) > -1) return SEPARATORS[i];
    }
    return "";
  }

  function formatNumber(value, separator) {
    var text = String(value);
    if (!separator) return text;
    return text.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  }

  var counters = document.querySelectorAll("[data-count]");
  if (counters.length && !reduce && hasIO) {
    var countIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          countIO.unobserve(el);

          var separator = separatorOf(el.textContent);
          var target = parseFloat(el.dataset.count);
          if (isNaN(target)) return;
          var duration = parseInt(el.dataset.countDuration, 10) || 1400;
          var start = 0;

          var step = function (now) {
            if (!start) start = now;
            var t = Math.min((now - start) / duration, 1);
            var value = Math.round(easeOutQuart(t) * target);
            el.textContent = formatNumber(value, separator);
            if (t < 1) requestAnimationFrame(step);
          };
          el.textContent = formatNumber(0, separator);
          requestAnimationFrame(step);
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach(function (el) {
      countIO.observe(el);
    });
  }

  /* =====================================================================
     Pointer tilt

     Cheap 3D parallax for the hero device. Writes two custom properties that
     the stylesheet consumes; the element keeps its own transform authoring in
     CSS, so nothing here has to know about the layout.
     ===================================================================== */
  function bindTilt(el) {
    var strength = parseFloat(el.dataset.tilt) || 6;
    var rect = null;
    var raf = false;
    var lastX = 0;
    var lastY = 0;

    function write() {
      raf = false;
      if (!rect) return;
      var px = (lastX - rect.left) / rect.width - 0.5;
      var py = (lastY - rect.top) / rect.height - 0.5;
      el.style.setProperty("--ry", (px * strength).toFixed(2) + "deg");
      el.style.setProperty("--rx", (-py * strength).toFixed(2) + "deg");
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    }

    el.addEventListener("pointerenter", function (event) {
      if (event.pointerType !== "mouse") return;
      rect = el.getBoundingClientRect();
      el.dataset.tilting = "true";
    });

    el.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse" || !rect) return;
      lastX = event.clientX;
      lastY = event.clientY;
      if (!raf) {
        raf = true;
        queue(write);
      }
    });

    el.addEventListener("pointerleave", function () {
      rect = null;
      el.dataset.tilting = "false";
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--px", "0");
      el.style.setProperty("--py", "0");
    });
  }

  /* =====================================================================
     Magnetic buttons

     The primary CTA leans toward the cursor as it approaches. Fine pointers
     only: on touch there is no hover state to lean into, and the transform
     would fight the tap.
     ===================================================================== */
  function bindMagnet(el) {
    var pull = parseFloat(el.dataset.magnetic) || 0.28;
    var raf = false;
    var lastX = 0;
    var lastY = 0;
    var rect = null;

    function write() {
      raf = false;
      if (!rect) return;
      var dx = (lastX - (rect.left + rect.width / 2)) * pull;
      var dy = (lastY - (rect.top + rect.height / 2)) * pull;
      el.style.setProperty("--mx", dx.toFixed(2) + "px");
      el.style.setProperty("--my", dy.toFixed(2) + "px");
    }

    el.addEventListener("pointerenter", function (event) {
      if (event.pointerType !== "mouse") return;
      rect = el.getBoundingClientRect();
    });

    el.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse" || !rect) return;
      lastX = event.clientX;
      lastY = event.clientY;
      if (!raf) {
        raf = true;
        queue(write);
      }
    });

    function release() {
      rect = null;
      el.style.setProperty("--mx", "0px");
      el.style.setProperty("--my", "0px");
    }

    el.addEventListener("pointerleave", release);
    el.addEventListener("blur", release);
  }

  function bindPointerEffects() {
    if (reduce || !finePointer.matches) return;
    document.querySelectorAll("[data-tilt]").forEach(function (el) {
      if (el.dataset.tiltBound) return;
      el.dataset.tiltBound = "1";
      bindTilt(el);
    });
    document.querySelectorAll("[data-magnetic]").forEach(function (el) {
      if (el.dataset.magnetBound) return;
      el.dataset.magnetBound = "1";
      bindMagnet(el);
    });
  }

  bindPointerEffects();
  on(finePointer, bindPointerEffects);

  /* =====================================================================
     Live leaderboard

     The product claim is "le classement bouge à chaque séance validée", so the
     site shows it happening rather than describing it. Rows are reordered with
     FLIP: read every row's position, reorder the DOM, then play each row from
     its old position back to its new one with a single transform.

     Reduced motion and no-JS both leave the authored order on screen, which is
     already a correct, readable leaderboard.
     ===================================================================== */
  function bindLeaderboard(board) {
    var rows = Array.prototype.slice.call(board.querySelectorAll("[data-row]"));
    if (rows.length < 2) return;

    var timer = null;
    var running = false;

    function pointsOf(row) {
      return parseInt(row.dataset.points, 10) || 0;
    }

    function paint() {
      var ordered = rows.slice().sort(function (a, b) {
        return pointsOf(b) - pointsOf(a);
      });
      var max = pointsOf(ordered[0]) || 1;
      ordered.forEach(function (row, i) {
        var rank = row.querySelector("[data-rank]");
        if (rank) rank.textContent = String(i + 1);
        row.dataset.place = String(i + 1);
        var value = row.querySelector("[data-points-label]");
        if (value) value.textContent = pointsOf(row) + " pts";
        var bar = row.querySelector("[data-bar]");
        if (bar) bar.style.setProperty("--fill", (pointsOf(row) / max).toFixed(3));
      });
      return ordered;
    }

    function tick() {
      // One member finishes a session and banks the points the app awards for
      // it. Only the mover changes, so the reorder reads as a consequence.
      var mover = rows[Math.floor(Math.random() * rows.length)];
      var gain = [50, 75, 100][Math.floor(Math.random() * 3)];

      var first = rows.map(function (row) {
        return row.getBoundingClientRect().top;
      });

      mover.dataset.points = String(pointsOf(mover) + gain);
      var ordered = paint();
      ordered.forEach(function (row) {
        board.appendChild(row);
      });

      rows.forEach(function (row, i) {
        var delta = first[i] - row.getBoundingClientRect().top;
        if (!delta) return;
        row.style.transition = "none";
        row.style.transform = "translateY(" + delta + "px)";
        // Force a style flush so the browser keeps the inverted position as the
        // starting frame instead of collapsing both writes into one paint.
        void row.offsetHeight;
        row.style.transition = "transform 0.62s cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "";
      });

      mover.dataset.moved = "true";
      setTimeout(function () {
        mover.removeAttribute("data-moved");
      }, 900);
    }

    paint();

    function start() {
      if (running || reduce) return;
      running = true;
      timer = setInterval(tick, 2600);
    }

    function stop() {
      running = false;
      clearInterval(timer);
    }

    if (hasIO && !reduce) {
      new IntersectionObserver(
        function (entries) {
          entries[0].isIntersecting ? start() : stop();
        },
        { threshold: 0.4 }
      ).observe(board);
    }

    // Never animate behind a hidden tab: the interval would keep queueing
    // reorders that all land at once when the visitor comes back.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
    });
  }

  document.querySelectorAll("[data-leaderboard]").forEach(bindLeaderboard);

  /* =====================================================================
     Weekly group objective

     The product's actual loop: the group owes N sessions this week, everyone's
     sessions count toward the same total, and members are NEVER ranked by
     contribution (lib/screens/group/widgets/weekly_goal_card.dart is explicit
     about that). Sessions land one at a time and the bar fills; when the target
     is reached it holds, then starts over.

     Reduced motion and no-JS both leave the authored 1/4 on screen, which is a
     correct still frame of the same thing.
     ===================================================================== */
  function bindGoal(card) {
    var target = parseInt(card.dataset.target, 10) || 4;
    var doneEl = card.querySelector("[data-goal-done]");
    var bar = card.querySelector("[data-goal-bar]");
    var status = card.querySelector("[data-goal-status]");
    var members = Array.prototype.slice.call(
      card.querySelectorAll("[data-goal-member]")
    );
    if (!doneEl || !bar || !members.length) return;

    var counts = members.map(function (m) {
      return parseInt(m.querySelector("[data-goal-count]").textContent, 10) || 0;
    });
    var timer = null;
    var running = false;

    function paint() {
      var done = counts.reduce(function (a, b) {
        return a + b;
      }, 0);
      doneEl.textContent = String(done);
      bar.style.setProperty("--fill", Math.min(done / target, 1).toFixed(3));
      members.forEach(function (m, i) {
        var b = m.querySelector("[data-goal-count]");
        b.textContent = counts[i] ? String(counts[i]) : "";
        m.dataset.active = counts[i] ? "true" : "false";
      });
      if (status) {
        status.textContent = done + " séance" + (done > 1 ? "s" : "") +
          " sur " + target + " cette semaine.";
      }
      return done;
    }

    function tick() {
      var done = counts.reduce(function (a, b) {
        return a + b;
      }, 0);
      if (done >= target) {
        // Hold on the completed state for a beat, then start the week over.
        counts = counts.map(function (_, i) {
          return i === 0 ? 1 : 0;
        });
        paint();
        return;
      }
      // Give the next session to whichever member has done the fewest, so the
      // demo never turns into a race between them.
      var lowest = 0;
      for (var i = 1; i < counts.length; i++) {
        if (counts[i] < counts[lowest]) lowest = i;
      }
      counts[lowest] += 1;
      var justDone = members[lowest];
      justDone.dataset.moved = "true";
      setTimeout(function () {
        justDone.removeAttribute("data-moved");
      }, 900);
      paint();
    }

    paint();

    function start() {
      if (running || reduce) return;
      running = true;
      timer = setInterval(tick, 2200);
    }

    function stop() {
      running = false;
      clearInterval(timer);
    }

    if (hasIO && !reduce) {
      new IntersectionObserver(
        function (entries) {
          entries[0].isIntersecting ? start() : stop();
        },
        { threshold: 0.5 }
      ).observe(card);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
    });
  }

  document.querySelectorAll("[data-goal]").forEach(bindGoal);

  /* =====================================================================
     Points burst

     A short particle spray on the primary CTA. DOM nodes rather than canvas:
     there are only twelve of them, they are removed on animationend, and the
     whole effect costs two composited properties.
     ===================================================================== */
  function burst(el) {
    if (reduce) return;
    var layer = el.querySelector(".burst");
    if (!layer) {
      layer = document.createElement("span");
      layer.className = "burst";
      layer.setAttribute("aria-hidden", "true");
      el.appendChild(layer);
    }
    if (layer.childElementCount) return;

    for (var i = 0; i < 12; i++) {
      var dot = document.createElement("i");
      var angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
      var distance = 26 + Math.random() * 34;
      dot.style.setProperty("--dx", Math.cos(angle) * distance + "px");
      dot.style.setProperty("--dy", Math.sin(angle) * distance + "px");
      dot.style.setProperty("--d", (Math.random() * 90).toFixed(0) + "ms");
      layer.appendChild(dot);
    }
    setTimeout(function () {
      layer.textContent = "";
    }, 900);
  }

  document.querySelectorAll("[data-burst]").forEach(function (el) {
    el.addEventListener("pointerenter", function (event) {
      if (event.pointerType === "mouse") burst(el);
    });
  });

  /* =====================================================================
     Pinned screen sequence

     A phone stays pinned while the three "comment ça marche" steps scroll past
     it, and the screenshot cross-fades to match the step in view. This is the
     one place the page shows three product screens without asking for three
     separate scroll sections.

     Fallback: without IO, or under reduced motion, the CSS leaves every screen
     stacked at full opacity with the first one on top, and the steps read as a
     normal list.
     ===================================================================== */
  var sequence = document.querySelector("[data-sequence]");
  if (sequence && hasIO && !reduce) {
    var screens = sequence.querySelectorAll("[data-screen]");
    var steps = sequence.querySelectorAll("[data-step]");

    if (screens.length && screens.length === steps.length) {
      var activate = function (index) {
        if (sequence.dataset.active === String(index)) return;
        sequence.dataset.active = String(index);
        screens.forEach(function (screen, i) {
          screen.dataset.on = String(i === index);
        });
        steps.forEach(function (step, i) {
          step.dataset.on = String(i === index);
        });
      };

      activate(0);

      var stepIO = new IntersectionObserver(
        function (entries) {
          // Pick the entry closest to the middle of the viewport rather than
          // the first intersecting one: on a tall screen two steps are visible
          // at once and "first" would flip back and forth on every scroll tick.
          var best = null;
          var bestDistance = Infinity;
          var middle = window.innerHeight / 2;
          steps.forEach(function (step, i) {
            var rect = step.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight) return;
            var distance = Math.abs(rect.top + rect.height / 2 - middle);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = i;
            }
          });
          if (best !== null) activate(best);
          void entries;
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-20% 0px -20% 0px" }
      );
      steps.forEach(function (step) {
        stepIO.observe(step);
      });
    }
  }

  /* =====================================================================
     Sticky signup bar (small screens)

     Appears once the hero form has scrolled away and hides again over the
     footer form, so the visitor always has exactly one visible way in and the
     bar never covers the field it points at.
     ===================================================================== */
  var stickyBar = document.querySelector("[data-sticky-cta]");
  if (stickyBar && hasIO) {
    // The anchors are the real forms themselves, not markers placed after them:
    // a zero-height sentinel below a 800px section is off screen for the whole
    // time that section fills the viewport, so the dock used to sit on top of
    // the very field it was pointing at.
    var anchors = document.querySelectorAll("[data-cta-anchor]");
    var visible = {};

    var stickyIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.dataset.ctaAnchor] = entry.isIntersecting;
        });
        var anyVisible = Object.keys(visible).some(function (key) {
          return visible[key];
        });
        stickyBar.dataset.show = String(!anyVisible);
      },
      { threshold: 0 }
    );
    anchors.forEach(function (el) {
      stickyIO.observe(el);
    });
  }

  /* =====================================================================
     FAQ accordion

     <details> stays the source of truth so the no-JS and find-in-page
     behaviours are native. This only adds the open/close height transition,
     via the grid-template-rows 0fr -> 1fr technique, and closes siblings so
     the list never turns into a wall of open answers.
     ===================================================================== */
  var faq = document.querySelector("[data-faq]");
  if (faq) {
    faq.addEventListener("toggle", function (event) {
      var item = event.target;
      if (item.tagName !== "DETAILS" || !item.open) return;
      faq.querySelectorAll("details[open]").forEach(function (other) {
        if (other !== item) other.open = false;
      });
    }, true);
  }

  /* =====================================================================
     Mobile menu
     ===================================================================== */
  var menuBtn = document.querySelector("[data-menu-toggle]");
  var menu = document.querySelector("[data-menu]");
  if (menuBtn && menu) {
    // The panel is fixed over the page, so without this the page behind it
    // stays in the tab order and focus disappears under the overlay.
    var behind = [
      document.querySelector("main"),
      document.querySelector("footer"),
      document.querySelector(".nav-links"),
      stickyBar,
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

  /* =====================================================================
     Signup jump

     Every secondary "rejoindre la bêta" control points at a real form anchor.
     This just moves focus into the email field after the scroll settles, so a
     keyboard visitor lands on the input rather than at the top of the section.
     ===================================================================== */
  document.querySelectorAll("[data-focus-signup]").forEach(function (link) {
    link.addEventListener("click", function () {
      var target = document.querySelector(link.getAttribute("href"));
      if (!target) return;
      var field = target.querySelector('input[type="email"]');
      if (!field) return;
      // Let the native hash jump run first; focusing before it lands would
      // scroll twice and fight the smooth-scroll.
      setTimeout(function () {
        field.focus({ preventScroll: true });
      }, reduce ? 0 : 520);
    });
  });

  /* =====================================================================
     Waitlist forms

     There is more than one entry point on the page and every one posts to
     the same Appwrite Function, distinguished by a hidden `source` field.
     Each form is wired independently so a failure in one never disables
     another.

     En local, tools/dev-server.mjs interprète l’URL relative et exécute la
     même fonction avec les variables du .env. En production, l’appel part
     vers la fonction Cloud (exécution « guests », sans authentification).
     ===================================================================== */
  var BETA_PROJECT_ID = "69e8edda0008511fbbf7";
  var BETA_FUNCTION_ID = "beta-signup";
  var BETA_EXEC_URL =
    (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      ? "/v1/functions/" + BETA_FUNCTION_ID + "/executions"
      : "https://fra.cloud.appwrite.io/v1/functions/" + BETA_FUNCTION_ID + "/executions";

  document.querySelectorAll("[data-waitlist]").forEach(bindWaitlist);

  function bindWaitlist(form) {
    var status = form.querySelector("[data-status]");
    var submit = form.querySelector('button[type="submit"]');
    var emailField = form.querySelector("[data-field-email]");
    var email = form.querySelector('input[type="email"]');
    var emailError = emailField ? emailField.querySelector("[data-error]") : null;
    // Scoped to the form, not the field: in the inline layouts the help line is
    // a sibling of [data-field-email] rather than a child, and looking it up on
    // the field silently dropped its id out of aria-describedby the moment an
    // error was announced.
    var help = form.querySelector("[data-help]");
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
      var describedBy = help ? help.id : "";
      if (!message) {
        emailField.removeAttribute("data-invalid");
        email.removeAttribute("aria-invalid");
        if (describedBy) email.setAttribute("aria-describedby", describedBy);
        emailError.textContent = "";
        return;
      }
      emailField.setAttribute("data-invalid", "true");
      email.setAttribute("aria-invalid", "true");
      email.setAttribute(
        "aria-describedby",
        (emailError.id + " " + describedBy).trim()
      );
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
            : "Cette adresse email n’a pas l’air valide."
        );
        email.focus();
        return;
      }
      setFieldError(null);

      // The Appwrite Function is a real server call. We do it over fetch so
      // the page can show sending / success / failure instead of a full
      // reload, and fall back to the native submit when fetch is unavailable
      // or fails.
      if (!window.fetch || !window.FormData || !window.URLSearchParams) return;

      event.preventDefault();
      var data = new URLSearchParams(new FormData(form)).toString();

      if (submit) {
        submit.setAttribute("aria-busy", "true");
        submit.textContent = "Envoi…";
      }
      setStatus("sending", "Envoi de ton inscription…");

      fetch(BETA_EXEC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": BETA_PROJECT_ID,
        },
        body: JSON.stringify({ functionId: BETA_FUNCTION_ID, body: data, async: false }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (execution) {
          // The function returns its own payload wrapped in an execution
          // envelope whose statusCode / response fields we unpack.
          var payload = null;
          if (execution && execution.statusCode === 200 && execution.response) {
            try {
              payload = JSON.parse(execution.response);
            } catch (e) {
              payload = null;
            }
          }
          if (!payload || payload.success === false) throw new Error("inscription refusée");
          // A form whose success page IS the page it lives on (the group-size
          // form on merci.html) must not navigate: that would reload and throw
          // away the confirmation the visitor is reading. It reports inline and
          // collapses instead.
          var target = form.dataset.success;
          if (!target || target === "inline") {
            form.dataset.done = "true";
            if (submit) submit.removeAttribute("aria-busy");
            setStatus("ok", form.dataset.doneMessage || "C’est enregistré. Merci\u202f!");
            return;
          }
          setStatus("ok", "C’est enregistré. On passe à l’étape 2…");
          window.location.assign(target);
        })
        .catch(function () {
          if (submit) {
            submit.removeAttribute("aria-busy");
            submit.textContent = submitLabel;
          }
          setStatus(
            "error",
            "L’envoi a échoué. Réessaie dans un instant."
          );
        });
    });
  }

  /* =====================================================================
     Cross-form email sync

     Three forms on one page all ask for the same address. Typing it into the
     hero and then scrolling to the bottom form used to mean typing it twice.
     The value is mirrored across every form and kept in sessionStorage so the
     confirmation page can use it without ever putting an address in a URL.
     ===================================================================== */
  var EMAIL_STORE = "tribos-email";
  var emailInputs = document.querySelectorAll('[data-waitlist] input[type="email"]');

  if (emailInputs.length) {
    try {
      var saved = sessionStorage.getItem(EMAIL_STORE);
      if (saved) {
        emailInputs.forEach(function (input) {
          if (!input.value) input.value = saved;
        });
      }
    } catch (e) {
      /* storage blocked: the forms still work, they just do not share state */
    }

    emailInputs.forEach(function (input) {
      input.addEventListener("input", function () {
        emailInputs.forEach(function (other) {
          if (other !== input) other.value = input.value;
        });
        try {
          sessionStorage.setItem(EMAIL_STORE, input.value);
        } catch (e) {}
      });
    });
  }

  // Hidden fields on the confirmation page that need the address the visitor
  // just submitted, without it ever appearing in the URL or browser history.
  document.querySelectorAll("[data-fill]").forEach(function (field) {
    try {
      var value = sessionStorage.getItem(field.dataset.fill);
      if (value) field.value = value;
    } catch (e) {}
  });

  /* =====================================================================
     Platform choice

     The help text under the email field answers the choice the visitor just
     made. It is the cheapest way to make "on te dit quand" feel like a promise
     rather than a form field.
     ===================================================================== */
  var platformNotes = {
    android: "Parfait\u202f: Android, c\u2019est la vague en cours.",
    iphone:
      "Noté. Android passe en premier, la version iPhone suit\u202f: tu es sur la liste iOS dès l\u2019ouverture.",
  };

  document.querySelectorAll("[data-field-platform]").forEach(function (fieldset) {
    var form = fieldset.closest("form");
    var note = form && form.querySelector("[data-platform-note]");
    if (!note) return;
    var original = note.textContent;

    fieldset.addEventListener("change", function (event) {
      var value = event.target && event.target.value;
      note.textContent = platformNotes[value] || original;
      try {
        sessionStorage.setItem("tribos-telephone", value);
      } catch (e) {}
    });
  });

  /* =====================================================================
     Share / invite

     Tribos is worthless solo, so the confirmation page asks for the second
     signup rather than saying thank you and sending the visitor home.

     Deliberately links only. There is no field anywhere for a friend's email
     address: collecting a third party's address in order to mail them without
     their consent is a straightforward GDPR problem in France, and it would
     burn the sending domain before launch. The friend clicks through and
     consents for themselves.
     ===================================================================== */
  document.querySelectorAll("[data-share]").forEach(function (rack) {
    var url = rack.dataset.shareUrl || window.location.origin + "/";
    var text = (rack.dataset.shareText || "").replace(/\s+/g, " ").trim();
    var full = text ? text + " " + url : url;

    // The static markup already carries working wa.me / sms: hrefs so the rack
    // survives with JS off. They are rewritten here only so a single source of
    // truth (data-share-text) stays authoritative if the copy changes.
    var wa = rack.querySelector("[data-share-wa]");
    if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(full);

    var sms = rack.querySelector("[data-share-sms]");
    // "?&body=" is the form that works on both iOS and Android.
    if (sms) sms.href = "sms:?&body=" + encodeURIComponent(full);

    var native = rack.querySelector("[data-share-native]");
    if (native && navigator.share) {
      native.hidden = false;
      native.addEventListener("click", function () {
        navigator.share({ title: "Tribos", text: text, url: url }).catch(function () {
          /* the visitor dismissed the sheet; nothing to report */
        });
      });
    }

    var copy = rack.querySelector("[data-share-copy]");
    if (copy) {
      var label = copy.querySelector("[data-share-label]") || copy;
      var original = label.textContent;
      copy.addEventListener("click", function () {
        var done = function () {
          label.textContent = "Copié\u202f!";
          copy.dataset.copied = "true";
          setTimeout(function () {
            label.textContent = original;
            copy.removeAttribute("data-copied");
          }, 2400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(full).then(done, fallbackCopy);
        } else {
          fallbackCopy();
        }
        function fallbackCopy() {
          var area = document.createElement("textarea");
          area.value = full;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          try {
            document.execCommand("copy");
            done();
          } catch (e) {
            label.textContent = "Copie impossible";
          }
          document.body.removeChild(area);
        }
      });
    }
  });

  /* =====================================================================
     Reduced-motion changes mid-session

     Someone flipping the OS switch while the page is open should not have to
     reload to stop the leaderboard and the pointer effects.
     ===================================================================== */
  on(reduceQuery, function () {
    reduce = reduceQuery.matches;
    if (reduce) {
      root.setAttribute("data-motion", "off");
      document.querySelectorAll(".reveal, [data-split]").forEach(function (el) {
        el.classList.add("is-in");
      });
    } else {
      root.removeAttribute("data-motion");
    }
  });
})();
