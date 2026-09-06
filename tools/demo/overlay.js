/**
 * Presentation layer injected into the running app for a recording.
 *
 * Lives outside the app bundle on purpose: a demo should film the real product, not a version of
 * it that has been altered to film well. Nothing here ships, and the page underneath is untouched.
 */
window.__demo = (() => {
  /*
   * Built on first use, not on load.
   *
   * This runs as an init script so captions survive navigation, which means it executes before
   * the document has a body to append to. Everything is created lazily instead, and re-created
   * automatically after a navigation replaces the DOM.
   */
  let nodes = null;

  function ensure() {
    if (nodes && document.body.contains(nodes.cursor)) return nodes;

  const style = document.createElement("style");
  style.textContent = `
    /*
     * The overlay lives in the top layer, via the popover API.
     *
     * A native <dialog> opened with showModal renders in the top layer, which sits above every
     * z-index there is, so a caption stacked with z-index alone gets dimmed behind the backdrop
     * exactly when it is explaining the dialog. Popovers join the same layer without stealing
     * focus the way a second modal would.
     */
    #demo-cursor, #demo-caption, #demo-card {
      border: 0; padding: 0; margin: 0; overflow: visible;
      background: transparent; inset: auto; width: auto; height: auto;
      color: inherit;
    }
    /* :popover-open outranks a bare id, so each element restates its own display here. */
    #demo-cursor:popover-open, #demo-caption:popover-open { display: block; }
    #demo-card:popover-open { display: flex; }

    #demo-cursor {
      position: fixed; z-index: 2147483647; top: 0; left: 0;
      width: 22px; height: 22px; pointer-events: none;
      transition: transform 520ms cubic-bezier(0.33, 1, 0.68, 1);
      will-change: transform;
    }
    #demo-cursor svg { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.35)); }
    #demo-cursor.tap::after {
      content: ""; position: absolute; inset: -12px;
      border-radius: 999px; border: 2px solid #c8102e;
      animation: demo-tap 420ms ease-out forwards;
    }
    @keyframes demo-tap { from { transform: scale(0.4); opacity: 1 } to { transform: scale(1.25); opacity: 0 } }

    #demo-caption {
      position: fixed; left: 50%; bottom: 44px; top: auto; transform: translateX(-50%) translateY(10px);
      z-index: 2147483646; pointer-events: none;
      background: #1c1c1c; color: #fcfbf8;
      padding: 12px 22px; border-radius: 9999px;
      font: 500 19px/1.2 ui-sans-serif, system-ui, sans-serif;
      letter-spacing: -0.01em; white-space: nowrap;
      box-shadow: 0 8px 30px rgba(0,0,0,0.22);
      opacity: 0; transition: opacity 380ms ease, transform 380ms ease;
    }
    #demo-caption.on { opacity: 1; transform: translateX(-50%) translateY(0); }

    #demo-card {
      position: fixed; z-index: 2147483645;
      top: 0; left: 0; width: 100vw; height: 100vh;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #f7f4ed; color: #1c1c1c; gap: 18px;
      opacity: 0; transition: opacity 520ms ease; pointer-events: none;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    #demo-card.on { opacity: 1; }
    #demo-card .wordmark { font-size: 76px; font-weight: 600; letter-spacing: -0.035em; }
    #demo-card .wordmark em { color: #c8102e; font-style: normal; }
    #demo-card .sub { font-size: 24px; color: #5f5f5d; letter-spacing: -0.01em; }
    #demo-card .url { margin-top: 10px; font-size: 19px; color: #1c1c1c; opacity: 0.55; }
    @media (prefers-color-scheme: dark) {
      #demo-card { background: #1a1815; color: #f2efe7; }
      #demo-card .wordmark em { color: #f2556b; }
      #demo-card .sub { color: #a09a8e; }
      #demo-caption { background: #f2efe7; color: #1a1815; }
    }
  `;
  document.head.appendChild(style);

  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.popover = "manual";
  cursor.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
    <path d="M5 2.5 19.5 11.5 12.8 12.6 9.6 19z" fill="#1c1c1c" stroke="#fcfbf8" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`;
  document.body.appendChild(cursor);

  const caption = document.createElement("div");
  caption.id = "demo-caption";
  caption.popover = "manual";
  document.body.appendChild(caption);

  const card = document.createElement("div");
  card.id = "demo-card";
  card.popover = "manual";
  document.body.appendChild(card);

    for (const el of [cursor, caption, card]) {
      try {
        el.showPopover();
      } catch {
        // A browser without popover support still gets the z-index stacking above.
      }
    }
    nodes = { cursor, caption, card };
    return nodes;
  }

  return {
    move(x, y) {
      ensure().cursor.style.transform = `translate(${x}px, ${y}px)`;
    },
    tap() {
      const { cursor } = ensure();
      cursor.classList.remove("tap");
      void cursor.offsetWidth; // restart the animation
      cursor.classList.add("tap");
    },
    say(text) {
      const { caption } = ensure();
      if (!text) {
        caption.classList.remove("on");
        return;
      }
      caption.textContent = text;
      caption.classList.add("on");
    },
    showCard(html) {
      const { card } = ensure();
      card.innerHTML = html;
      card.classList.add("on");
    },
    hideCard() {
      ensure().card.classList.remove("on");
    },
    hideCursor(hidden) {
      ensure().cursor.style.opacity = hidden ? "0" : "1";
    },
  };
})();
