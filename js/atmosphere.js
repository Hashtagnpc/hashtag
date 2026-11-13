
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("lightfall-canvas");
  const artwork = document.querySelector(".vice-artwork");

  if (!canvas || !artwork) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const mobile = window.matchMedia("(max-width: 768px)").matches;

  const colors = [
    "rgba(255, 105, 180,",
    "rgba(170, 110, 255,",
    "rgba(80, 180, 255,",
    "rgba(255, 180, 210,"
  ];

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let animationFrame = null;
  let lastFrame = 0;
  let artworkTimer = null;
  let destroyed = false;

  const streaks = [];

  const streakCount = reducedMotion ? 0 : mobile ? 24 : 55;

  function createStreak(initial = false) {
    return {
      x: Math.random() * width,
      y: initial ? Math.random() * height : -Math.random() * 180,
      length: 30 + Math.random() * (mobile ? 65 : 120),
      speed: 35 + Math.random() * 85,
      thickness: 0.5 + Math.random() * 1.2,
      opacity: 0.12 + Math.random() * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)]
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();

    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);

    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    context.setTransform(
      pixelRatio, 0,
      0, pixelRatio,
      0, 0
    );

    if (!streaks.length) {
      for (let i = 0; i < streakCount; i++) {
        streaks.push(createStreak(true));
      }
    }

    drawStaticFrame();
  }

  function drawStaticFrame() {
    context.clearRect(0, 0, width, height);

    streaks.forEach(streak => {
      drawStreak(streak);
    });
  }

  function drawStreak(streak) {
    const gradient = context.createLinearGradient(
      streak.x,
      streak.y,
      streak.x - 12,
      streak.y + streak.length
    );

    gradient.addColorStop(0, `${streak.color}${streak.opacity})`);
    gradient.addColorStop(1, `${streak.color}0)`);

    context.beginPath();
    context.moveTo(streak.x, streak.y);
    context.lineTo(streak.x - 12, streak.y + streak.length);

    context.strokeStyle = gradient;
    context.lineWidth = streak.thickness;
    context.shadowColor = `${streak.color}${streak.opacity})`;
    context.shadowBlur = 12;
    context.stroke();

    context.shadowBlur = 0;
  }

  function animate(timestamp) {
    if (destroyed || document.hidden || reducedMotion) {
      animationFrame = null;
      return;
    }

    animationFrame = requestAnimationFrame(animate);

    if (timestamp - lastFrame < 1000 / 30) return;

    const delta = lastFrame
      ? Math.min((timestamp - lastFrame) / 1000, 0.05)
      : 0.016;

    lastFrame = timestamp;

    context.clearRect(0, 0, width, height);

    streaks.forEach((streak, index) => {
      streak.y += streak.speed * delta;

      // A gentle sideways drift gives the lights a cinematic feel.
      streak.x += Math.sin(timestamp / 1800 + index) * 0.12;

      drawStreak(streak);

      if (streak.y - streak.length > height) {
        streaks[index] = createStreak();
      }
    });
  }

  function startAnimation() {
    if (
      destroyed ||
      reducedMotion ||
      document.hidden ||
      animationFrame !== null
    ) {
      return;
    }

    lastFrame = 0;
    animationFrame = requestAnimationFrame(animate);
  }

  function stopAnimation() {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
  }

  // Artwork appears occasionally, then fades away.
  function showArtworkCycle() {
    if (destroyed || document.hidden || reducedMotion) return;

    artwork.classList.add("visible");

    artworkTimer = window.setTimeout(() => {
      artwork.classList.remove("visible");

      artworkTimer = window.setTimeout(() => {
        showArtworkCycle();
      }, 5000 + Math.random() * 5000);

    }, 6000 + Math.random() * 3000);
  }

  function clearArtworkTimer() {
    if (artworkTimer !== null) {
      window.clearTimeout(artworkTimer);
      artworkTimer = null;
    }
  }

  function handleVisibility() {
    if (document.hidden) {
      stopAnimation();
      clearArtworkTimer();
      artwork.classList.remove("visible");
    } else {
      startAnimation();

      if (!reducedMotion) {
        showArtworkCycle();
      }
    }
  }

  resizeCanvas();

  if (!reducedMotion) {
    startAnimation();

    // Give visitors time to see the website before the artwork appears.
    artworkTimer = window.setTimeout(showArtworkCycle, 3500);
  } else {
    // Reduced-motion mode keeps a subtle static background.
    streaks.splice(0, streaks.length, ...Array.from(
      { length: Math.min(10, streakCount) },
      () => createStreak(true)
    ));
    drawStaticFrame();
  }

  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("visibilitychange", handleVisibility);

  window.addEventListener("pagehide", () => {
    destroyed = true;
    stopAnimation();
    clearArtworkTimer();
  }, { once: true });
});
