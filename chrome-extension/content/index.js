/*
Borderless Viewer content script
Features:
- Wheel to zoom (cursor-centered)
- Alt + wheel to rotate (any angle)
- Drag with left mouse to pan
- Keys: E/R rotate ±90°, H/V flip horizontal/vertical
- Toggle overlay and load a clicked image/video
*/

(function () {
  const overlayId = "bv-overlay";
  if (document.getElementById(overlayId)) {
    // Already injected; avoid duplicate listeners and DOM
    return;
  }

  let state = {
    scale: 1,
    rotationDeg: 0,
    flipH: 1,
    flipV: 1,
    translateX: 0,
    translateY: 0,
    isVisible: false,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0,
  };

  const overlay = document.createElement("div");
  overlay.id = overlayId;

  const stage = document.createElement("div");
  stage.id = "bv-stage";

  const media = document.createElement("img");
  media.id = "bv-media";
  media.alt = "Borderless Viewer";
  media.decoding = "async";
  media.referrerPolicy = "no-referrer";

  const hint = document.createElement("div");
  hint.id = "bv-hint";
  hint.textContent = "Wheel: Zoom | Alt+Wheel: Rotate | Drag: Pan | E/R: ±90° | H: Flip H | V: Flip V | Esc: Close";

  overlay.appendChild(stage);
  overlay.appendChild(hint);
  stage.appendChild(media);
  document.documentElement.appendChild(overlay);

  function setVisible(next) {
    state.isVisible = next;
    overlay.classList.toggle("bv-visible", next);
    if (next) {
      // reset cursor style
      overlay.classList.remove("bv-dragging");
    }
  }

  function resetTransform() {
    state.scale = 1;
    state.rotationDeg = 0;
    state.flipH = 1;
    state.flipV = 1;
    state.translateX = 0;
    state.translateY = 0;
    applyTransform();
  }

  function applyTransform() {
    const transform = `translate(${state.translateX}px, ${state.translateY}px) rotate(${state.rotationDeg}deg) scale(${state.scale * state.flipH}, ${state.scale * state.flipV})`;
    stage.style.transform = transform;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function screenToStageDelta(clientX, clientY) {
    // Compute how much stage should move to keep the point under cursor stationary when zooming
    const rect = stage.getBoundingClientRect();
    const stageCenterX = rect.left + rect.width / 2;
    const stageCenterY = rect.top + rect.height / 2;
    const dx = clientX - stageCenterX;
    const dy = clientY - stageCenterY;
    return { dx, dy };
  }

  function zoomAt(clientX, clientY, deltaY) {
    const zoomFactor = Math.pow(1.0015, -deltaY); // smooth zoom
    const prevScale = state.scale;
    const nextScale = clamp(prevScale * zoomFactor, 0.05, 100);

    // Keep cursor position stable: adjust translate accordingly
    const { dx, dy } = screenToStageDelta(clientX, clientY);
    const scaleRatio = nextScale / prevScale;
    state.translateX = dx - scaleRatio * dx + state.translateX;
    state.translateY = dy - scaleRatio * dy + state.translateY;

    state.scale = nextScale;
    applyTransform();
    showHud();
  }

  function rotateBy(deg) {
    state.rotationDeg = ((state.rotationDeg + deg) % 360 + 360) % 360;
    applyTransform();
    showHud();
  }

  function flipHorizontal() {
    state.flipH *= -1;
    applyTransform();
    showHud();
  }
  function flipVertical() {
    state.flipV *= -1;
    applyTransform();
    showHud();
  }

  function showHud() {
    hint.textContent = `Zoom: ${(state.scale).toFixed(2)}x  |  Rot: ${state.rotationDeg.toFixed(0)}°  |  Flip: ${state.flipH<0?"H":"-"}/${state.flipV<0?"V":"-"}`;
    clearTimeout(showHud._t);
    showHud._t = setTimeout(() => {
      hint.textContent = "Wheel: Zoom | Alt+Wheel: Rotate | Drag: Pan | E/R: ±90° | H: Flip H | V: Flip V | Esc: Close";
    }, 900);
  }

  function loadMedia(src) {
    resetTransform();

    // Detect if src is video
    if (src && /\.(mp4|webm|ogg|mkv)(\?|#|$)/i.test(src)) {
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.autoplay = true;
      video.id = "bv-media";
      video.style.maxWidth = "none";
      video.style.maxHeight = "none";
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      stage.replaceChildren(video);
    } else {
      const img = document.createElement("img");
      img.src = src || bestGuessImageOnPage();
      img.id = "bv-media";
      img.alt = "Borderless Viewer";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
      stage.replaceChildren(img);
    }

    setVisible(true);
  }

  function bestGuessImageOnPage() {
    // Try og:image then largest image
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    if (og?.content) return og.content;
    let best = null, bestArea = 0;
    for (const el of Array.from(document.images)) {
      const area = el.naturalWidth * el.naturalHeight;
      if (area > bestArea) { bestArea = area; best = el.src; }
    }
    return best || location.href;
  }

  function toggleOverlay() {
    if (state.isVisible) {
      setVisible(false);
    } else {
      loadMedia();
    }
  }

  // Event handlers
  overlay.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.altKey) {
      const rotationDelta = -Math.sign(e.deltaY) * (Math.abs(e.deltaY) / 4);
      rotateBy(rotationDelta);
    } else {
      zoomAt(e.clientX, e.clientY, e.deltaY);
    }
  }, { passive: false });

  overlay.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    state.isDragging = true;
    overlay.classList.add("bv-dragging");
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.dragOriginX = state.translateX;
    state.dragOriginY = state.translateY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!state.isDragging) return;
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    state.translateX = state.dragOriginX + dx;
    state.translateY = state.dragOriginY + dy;
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    if (!state.isDragging) return;
    state.isDragging = false;
    overlay.classList.remove("bv-dragging");
  });

  window.addEventListener("keydown", (e) => {
    if (!state.isVisible) return;
    if (e.key === "Escape") {
      setVisible(false);
    } else if (e.key === "e" || e.key === "E") {
      rotateBy(-90);
    } else if (e.key === "r" || e.key === "R") {
      rotateBy(90);
    } else if (e.key === "h" || e.key === "H") {
      flipHorizontal();
    } else if (e.key === "v" || e.key === "V") {
      flipVertical();
    }
  });

  // Close on overlay click if not dragging
  overlay.addEventListener("click", (e) => {
    if (state.isDragging) return; // ignore if was dragging
    if (e.target === overlay) setVisible(false);
  });

  // Messaging from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "BV_TOGGLE") {
      toggleOverlay();
    }
    if (msg?.type === "BV_OPEN") {
      loadMedia(msg.src);
    }
  });
})();
