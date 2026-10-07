(() => {
  const stateKey = "__vkVideoMirrorExtensionState__";
  if (globalThis[stateKey]?.installed) return;

  const state = { installed: true, pip: null, launcher: null };
  globalThis[stateKey] = state;

  function findVideos(root = document) {
    const videos = [];
    const seen = new Set();

    function visit(scope) {
      if (!scope || seen.has(scope)) return;
      seen.add(scope);

      if (scope instanceof HTMLVideoElement) videos.push(scope);
      if (!scope.querySelectorAll) return;

      for (const video of scope.querySelectorAll("video")) {
        if (!videos.includes(video)) videos.push(video);
      }
      for (const element of scope.querySelectorAll("*")) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    }

    visit(root);
    return videos;
  }

  function chooseVideo() {
    return findVideos()
      .map(video => {
        const rect = video.getBoundingClientRect();
        const style = getComputedStyle(video);
        const visible = rect.width > 0 && rect.height > 0 &&
          style.display !== "none" && style.visibility !== "hidden" &&
          rect.right > 0 && rect.bottom > 0 &&
          rect.left < innerWidth && rect.top < innerHeight;
        const playing = !video.paused && !video.ended;
        return { video, visible, playing, area: rect.width * rect.height };
      })
      .filter(item => item.visible && item.video.currentSrc)
      .sort((a, b) => Number(b.playing) - Number(a.playing) || b.area - a.area)[0]?.video || null;
  }

  function toggleMirror() {
    const video = chooseVideo();
    if (!video) return { ok: false, message: "Не нашёл видимое видео на этой вкладке." };

    if (video.dataset.vkVideoMirrorEnabled === "true") {
      const previous = video.dataset.vkVideoMirrorPreviousScale || "";
      const priority = video.dataset.vkVideoMirrorPreviousPriority || "";
      if (previous) video.style.setProperty("scale", previous, priority);
      else video.style.removeProperty("scale");
      delete video.dataset.vkVideoMirrorEnabled;
      delete video.dataset.vkVideoMirrorPreviousScale;
      delete video.dataset.vkVideoMirrorPreviousPriority;
      return { ok: true, message: "Зеркалирование выключено." };
    }

    video.dataset.vkVideoMirrorPreviousScale = video.style.getPropertyValue("scale");
    video.dataset.vkVideoMirrorPreviousPriority = video.style.getPropertyPriority("scale");
    video.style.setProperty("scale", "-1 1", "important");
    video.dataset.vkVideoMirrorEnabled = "true";
    return { ok: true, message: "Видео отражено по горизонтали." };
  }

  function removeLauncher() {
    if (state.launcher) {
      state.launcher.remove();
      state.launcher = null;
    }
  }

  async function closeMirroredPip() {
    const pip = state.pip;
    if (!pip) return;

    pip.closed = true;
    if (pip.frameCallback && pip.source.cancelVideoFrameCallback) {
      pip.source.cancelVideoFrameCallback(pip.frameCallback);
    }
    if (pip.animationFrame) cancelAnimationFrame(pip.animationFrame);
    pip.source.muted = pip.previousMuted;
    pip.output.pause();
    pip.output.srcObject = null;
    pip.output.remove();
    for (const track of pip.stream.getTracks()) track.stop();
    state.pip = null;
  }

  async function openMirroredPip(source) {
    if (state.pip) {
      if (document.pictureInPictureElement === state.pip.output) {
        await document.exitPictureInPicture();
        return { ok: true, message: "Зеркальное PiP закрыто." };
      }
      await closeMirroredPip();
    }

    if (!source.videoWidth || !source.videoHeight) {
      throw new Error("Видео ещё не загрузило кадр. Запустите его и нажмите кнопку PiP ещё раз.");
    }
    if (!source.captureStream || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("Этот видеоплеер не поддерживает захват потока для зеркального PiP.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось создать canvas для зеркального видео.");

    const draw = () => {
      if (source.videoWidth && source.videoHeight &&
          (canvas.width !== source.videoWidth || canvas.height !== source.videoHeight)) {
        canvas.width = source.videoWidth;
        canvas.height = source.videoHeight;
      }
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    };

    try {
      draw();
      const canvasStream = canvas.captureStream(30);
      const mediaStream = source.captureStream();
      const stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...mediaStream.getAudioTracks()
      ]);
      if (!stream.getVideoTracks().length) throw new Error("Не удалось получить видеопоток.");

      const output = document.createElement("video");
      output.autoplay = true;
      output.playsInline = true;
      output.muted = source.muted;
      output.volume = source.volume;
      output.style.cssText = "position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;opacity:0;pointer-events:none";
      output.srcObject = stream;
      document.documentElement.appendChild(output);

      const pip = {
        source,
        output,
        stream,
        previousMuted: source.muted,
        closed: false,
        animationFrame: 0,
        frameCallback: 0
      };
      state.pip = pip;

      const drawNextFrame = () => {
        if (pip.closed) return;
        try { draw(); } catch { /* A later decoded frame can still be drawable. */ }
        if (source.requestVideoFrameCallback) {
          pip.frameCallback = source.requestVideoFrameCallback(drawNextFrame);
        } else {
          pip.animationFrame = requestAnimationFrame(drawNextFrame);
        }
      };
      if (source.requestVideoFrameCallback) {
        pip.frameCallback = source.requestVideoFrameCallback(drawNextFrame);
      } else {
        pip.animationFrame = requestAnimationFrame(drawNextFrame);
      }

      await output.play();
      await output.requestPictureInPicture();
      source.muted = true;
      output.addEventListener("leavepictureinpicture", () => { void closeMirroredPip(); }, { once: true });
      return { ok: true, message: "Зеркальное PiP открыто. Нажмите кнопку ещё раз, чтобы закрыть." };
    } catch (error) {
      await closeMirroredPip();
      if (error?.name === "SecurityError") {
        throw new Error("VK не разрешил захват кадра этого видео для зеркального PiP.");
      }
      throw error;
    }
  }

  function togglePipLauncher() {
    if (state.launcher) {
      removeLauncher();
      return { ok: true, message: "Кнопка зеркального PiP убрана." };
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Зеркальное PiP";
    button.title = "Открыть текущее видео в зеркальном окне PiP";
    button.style.cssText = [
      "all:initial",
      "position:fixed",
      "right:24px",
      "bottom:24px",
      "z-index:2147483647",
      "padding:10px 14px",
      "border:1px solid rgba(255,255,255,.22)",
      "border-radius:10px",
      "background:#0077ff",
      "color:#fff",
      "box-shadow:0 4px 18px rgba(0,0,0,.35)",
      "font:600 14px/1.2 system-ui,sans-serif",
      "cursor:pointer"
    ].join(";");

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const source = chooseVideo();
      if (!source) {
        button.textContent = "Видео не найдено";
        return;
      }
      button.disabled = true;
      button.textContent = "Открываю PiP…";
      try {
        const result = await openMirroredPip(source);
        button.textContent = result.message.includes("открыто") ? "Закрыть зеркальное PiP" : "Зеркальное PiP";
      } catch (error) {
        button.textContent = "PiP не открылось";
        button.title = error?.message || "Не удалось открыть зеркальное PiP.";
      } finally {
        button.disabled = false;
      }
    });

    document.documentElement.appendChild(button);
    state.launcher = button;
    return { ok: true, message: "Кнопка добавлена внизу справа. Нажмите её на странице — это нужно для разрешения Chrome на PiP." };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "vk-video-mirror") return false;

    try {
      if (message.action === "toggle-mirror") sendResponse(toggleMirror());
      else if (message.action === "toggle-pip-launcher") sendResponse(togglePipLauncher());
      else sendResponse({ ok: false, message: "Неизвестное действие." });
    } catch (error) {
      sendResponse({ ok: false, message: error?.message || "Не удалось выполнить действие." });
    }
    return false;
  });
})();
