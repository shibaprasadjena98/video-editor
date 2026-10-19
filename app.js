(() => {
  const $ = (selector) => document.querySelector(selector);
  const els = {
    videoInput: $("#videoInput"), audioInput: $("#audioInput"), mediaList: $("#mediaList"), mediaCount: $("#mediaCount"),
    previewVideo: $("#previewVideo"), canvas: $("#previewCanvas"), stage: $("#stage"), stageEmpty: $("#stageEmpty"),
    projectTitle: $("#projectTitle"), previewResolution: $("#previewResolution"), currentTime: $("#currentTime"), totalTime: $("#totalTime"),
    playButton: $("#playButton"), addClipButton: $("#addClipButton"), inspectorAddButton: $("#inspectorAddButton"),
    noSelection: $("#noSelection"), clipSettings: $("#clipSettings"), selectedClipTitle: $("#selectedClipTitle"),
    trimStart: $("#trimStart"), trimEnd: $("#trimEnd"), trimRangeStart: $("#trimRangeStart"), trimRangeEnd: $("#trimRangeEnd"),
    trimDuration: $("#trimDuration"), clipSpeed: $("#clipSpeed"), clipVolume: $("#clipVolume"), volumeValue: $("#volumeValue"),
    videoTrack: $("#videoTrack"), audioTrack: $("#audioTrack"), voiceClip: $("#voiceClip"), voiceLabel: $("#voiceLabel"), voiceStatus: $("#voiceStatus"),
    clipCount: $("#clipCount"),
    exportFormat: $("#exportFormat"),
    exportButton: $("#exportButton"), exportOverlay: $("#exportOverlay"), exportStatus: $("#exportStatus"), exportProgress: $("#exportProgress"),
    toast: $("#toast"), rulerTrack: $("#rulerTrack"), playhead: $("#playhead"), timelineScroll: $("#timelineScroll")
  };
  const state = { media: [], selected: null, selectedClipIndex: -1, clips: [], voice: null, ratio: "16:9", zoom: 1, filter: "none", title: "", recording: null, exportRecorder: null, exporting: false, cancelExport: false, duration: 0, objectUrls: new Set(), audioContext: null, sourceNode: null, volumeNode: null };
  const filters = { none: "none", warm: "saturate(1.2) sepia(.18)", mono: "grayscale(1)", cinema: "contrast(1.18) saturate(.82)", bright: "brightness(1.15) contrast(1.04)" };
  let toastTimer;

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
  }
  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  function clipLength(clip) { return Math.max(0, clip.end - clip.start) / clip.speed; }
  function totalDuration() { return state.clips.reduce((sum, clip) => sum + clipLength(clip), 0); }
  function timelineOffset(index) {
    return state.clips.slice(0, index).reduce((sum, clip) => sum + clipLength(clip), 0);
  }
  function getMedia(id) { return state.media.find(item => item.id === id); }
  function addObjectUrl(file) {
    const url = URL.createObjectURL(file);
    state.objectUrls.add(url);
    return url;
  }
  function makeThumb(url, duration, onReady) {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = url;
    video.addEventListener("loadedmetadata", () => {
      const seek = Math.min(0.5, (duration || video.duration) / 3);
      video.currentTime = seek;
    }, { once: true });
    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = 68;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        onReady(canvas.toDataURL("image/jpeg", .65));
      } catch (_) { /* Some browsers block thumbnail extraction for unsupported media. */ }
      video.removeAttribute("src");
      video.load();
    }, { once: true });
    return video;
  }
  let thumbSequence = 0;
  function renderMediaList() {
    els.mediaList.innerHTML = "";
    els.mediaCount.textContent = state.media.length;
    if (!state.media.length) {
      els.mediaList.innerHTML = '<div class="empty-media">Your imported videos will appear here.</div>';
      return;
    }
    state.media.forEach(item => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `media-item${state.selected === item.id ? " selected" : ""}`;
      row.setAttribute("aria-label", `Select ${item.name}`);
      const thumbId = `thumb-${++thumbSequence}`;
      row.innerHTML = `<img class="media-thumb" data-thumb="${thumbId}" alt=""><span class="media-item-info"><strong></strong><span>${formatTime(item.duration)}</span></span>`;
      row.querySelector("strong").textContent = item.name;
      row.addEventListener("click", () => selectMedia(item.id));
      els.mediaList.appendChild(row);
      if (item.thumb) row.querySelector("img").src = item.thumb;
      else makeThumb(item.url, item.duration, image => {
        item.thumb = image;
        const thumb = els.mediaList.querySelector(`[data-thumb="${thumbId}"]`);
        if (thumb) thumb.src = image;
      });
    });
  }
  function selectMedia(id) {
    const item = getMedia(id);
    if (!item) return;
    els.previewVideo.pause();
    activeClipIndex = -1;
    state.selected = id;
    state.selectedClipIndex = -1;
    renderMediaList();
    els.noSelection.hidden = true;
    els.clipSettings.hidden = false;
    $("#clipEditActions").hidden = true;
    els.selectedClipTitle.textContent = item.name;
    els.trimStart.max = item.duration;
    els.trimEnd.max = item.duration;
    els.trimStart.value = "0";
    els.trimEnd.value = item.duration.toFixed(1);
    els.trimRangeStart.max = item.duration;
    els.trimRangeEnd.max = item.duration;
    els.trimRangeStart.value = "0";
    els.trimRangeEnd.value = item.duration;
    els.clipSpeed.value = "1";
    els.clipVolume.value = "100";
    els.volumeValue.textContent = "100%";
    els.previewVideo.src = item.url;
    els.previewVideo.currentTime = 0;
    els.previewVideo.playbackRate = 1;
    els.previewVideo.volume = 1;
    if (state.volumeNode) state.volumeNode.gain.value = 1;
    els.stage.classList.add("has-video");
    els.stageEmpty.hidden = true;
    els.playButton.disabled = false;
    els.addClipButton.disabled = false;
    els.inspectorAddButton.disabled = false;
    updateTrimDuration();
    renderPreview();
    renderTimeline();
    drawFrame();
  }
  function updateTrimDuration() {
    const start = Number(els.trimStart.value) || 0;
    const end = Number(els.trimEnd.value) || 0;
    els.trimDuration.textContent = formatTime(Math.max(0, end - start));
    const clip = state.clips[state.selectedClipIndex];
    if (clip && clip.mediaId === state.selected) {
      clip.start = start;
      clip.end = end;
    }
  }
  function handleTrimChange(which) {
    const item = getMedia(state.selected);
    if (!item) return;
    let start = Math.min(item.duration, Math.max(0, Number(els.trimStart.value) || 0));
    let end = Math.min(item.duration, Math.max(0, Number(els.trimEnd.value) || 0));
    if (start >= end) {
      if (which === "start") start = Math.max(0, end - .1);
      else end = Math.min(item.duration, start + .1);
    }
    els.trimStart.value = start.toFixed(1);
    els.trimEnd.value = end.toFixed(1);
    els.trimRangeStart.value = start;
    els.trimRangeEnd.value = end;
    updateTrimDuration();
  }
  function renderPreview() {
    const ratio = state.ratio.split(":").map(Number);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = els.stage.parentElement.getBoundingClientRect();
    const stageRatio = ratio[0] / ratio[1];
    const maxWidth = Math.max(1, Math.min(bounds.width - 44, 800));
    const maxHeight = Math.max(1, bounds.height - 28);
    const width = Math.round(Math.min(maxWidth, maxHeight * stageRatio));
    const height = Math.round(width / stageRatio);
    if (!width || !height) return;
    els.stage.style.width = `${width}px`;
    els.stage.style.height = `${height}px`;
    els.canvas.width = Math.round(width * dpr);
    els.canvas.height = Math.round(height * dpr);
    els.canvas.style.width = `${width}px`;
    els.canvas.style.height = `${height}px`;
    els.previewResolution.textContent = state.ratio;
    els.stage.dataset.ratio = state.ratio;
    els.stage.style.aspectRatio = `${ratio[0]}/${ratio[1]}`;
    drawFrame();
  }
  function drawFrame() {
    const ctx = els.canvas.getContext("2d");
    if (!ctx) return;
    const width = els.canvas.width;
    const height = els.canvas.height;
    ctx.fillStyle = "#08090b";
    ctx.fillRect(0, 0, width, height);
    if (els.previewVideo.readyState >= 2 && els.previewVideo.videoWidth) {
      const sourceRatio = els.previewVideo.videoWidth / els.previewVideo.videoHeight;
      const targetRatio = width / height;
      let sx = 0, sy = 0, sw = els.previewVideo.videoWidth, sh = els.previewVideo.videoHeight;
      if (sourceRatio > targetRatio) { sw = sh * targetRatio; sx = (els.previewVideo.videoWidth - sw) / 2; }
      else { sh = sw / targetRatio; sy = (els.previewVideo.videoHeight - sh) / 2; }
      ctx.save();
      ctx.filter = filters[state.filter] || "none";
      ctx.drawImage(els.previewVideo, sx, sy, sw, sh, 0, 0, width, height);
      ctx.restore();
    }
    const title = state.title.trim();
    if (title) {
      const fontSize = Math.max(18, Math.round(width * .055));
      ctx.save();
      ctx.font = `800 ${fontSize}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(0,0,0,.85)";
      ctx.shadowBlur = Math.max(4, fontSize * .25);
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#fff";
      ctx.fillText(title, width / 2, height * .87, width * .88);
      ctx.restore();
    }
  }
  function setClipInVideo(index, seek = true) {
    const clip = state.clips[index];
    if (!clip) return;
    const media = getMedia(clip.mediaId);
    if (!media) return;
    if (els.previewVideo.src !== media.url) els.previewVideo.src = media.url;
    els.previewVideo.playbackRate = clip.speed;
    els.previewVideo.volume = clip.volume;
    if (seek) {
      try { els.previewVideo.currentTime = clip.start; } catch (_) { /* Metadata may still be loading. */ }
    }
  }
  function renderTimeline() {
    const duration = totalDuration();
    state.duration = duration;
    els.totalTime.textContent = formatTime(duration);
    els.clipCount.textContent = `${state.clips.length} ${state.clips.length === 1 ? "clip" : "clips"}`;
    els.exportButton.disabled = !state.clips.length || state.exporting;
    $("#clearTimelineButton").disabled = !state.clips.length;
    els.videoTrack.querySelectorAll(".clip-block").forEach(node => node.remove());
    const empty = els.videoTrack.querySelector(".track-empty");
    empty.hidden = state.clips.length > 0;
    state.clips.forEach((clip, index) => {
      const media = getMedia(clip.mediaId);
      if (!media) return;
      const block = document.createElement("button");
      block.type = "button";
      block.className = `clip-block${index === activeClipIndex ? " active" : ""}`;
      block.style.flexGrow = Math.max(.15, clipLength(clip));
      block.style.flexBasis = `${Math.max(75, clipLength(clip) * 17 * state.zoom)}px`;
      block.setAttribute("aria-label", `Clip ${index + 1}: ${media.name}, ${formatTime(clip.start)} to ${formatTime(clip.end)}`);
      block.innerHTML = `<img alt=""><span class="clip-block-info"><strong></strong><span>${formatTime(clip.start)}–${formatTime(clip.end)} · ${clip.speed}×</span></span><span class="clip-number">${index + 1}</span>`;
      block.querySelector("img").src = media.thumb || "";
      block.querySelector("strong").textContent = media.name;
      block.addEventListener("click", () => {
        const selectedMedia = getMedia(clip.mediaId);
        if (!selectedMedia) return;
        selectMedia(selectedMedia.id);
        activeClipIndex = index;
        state.selectedClipIndex = index;
        els.trimStart.value = clip.start;
        els.trimEnd.value = clip.end;
        els.trimRangeStart.value = clip.start;
        els.trimRangeEnd.value = clip.end;
        els.clipSpeed.value = String(clip.speed);
        els.clipVolume.value = Math.round(clip.volume * 100);
        els.volumeValue.textContent = `${Math.round(clip.volume * 100)}%`;
        $("#clipEditActions").hidden = false;
        updateTrimDuration();
        setClipInVideo(index);
        renderTimeline();
        updatePlayhead(timelineOffset(index));
        if (els.previewVideo.paused) drawFrame();
      });
      els.videoTrack.insertBefore(block, els.playhead);
    });
    els.voiceClip.hidden = !state.voice;
    $("#audioEmpty").hidden = !!state.voice;
    if (state.voice) {
      els.voiceLabel.textContent = state.voice.name;
      els.voiceClip.style.flexGrow = Math.max(.1, Math.min(state.duration, state.voice.duration || state.duration));
      els.voiceClip.style.flexBasis = `${Math.max(120, Math.min(state.duration || 1, state.voice.duration || state.duration) * 17 * state.zoom)}px`;
    }
    const tick = 40 * state.zoom;
    els.rulerTrack.style.setProperty("--tick", `${tick}px`);
    els.rulerTrack.innerHTML = "";
    const ticks = Math.max(1, Math.ceil((duration || 30) / (5 / state.zoom)));
    for (let i = 0; i <= ticks && i < 80; i++) {
      const marker = document.createElement("span");
      marker.textContent = formatTime(i * 5 / state.zoom);
      marker.style.left = `${i * tick}px`;
      els.rulerTrack.appendChild(marker);
    }
    updatePlayhead(playbackPosition());
  }
  let activeClipIndex = -1;
  function playbackPosition() {
    if (activeClipIndex < 0 || !state.clips[activeClipIndex]) return 0;
    const clip = state.clips[activeClipIndex];
    return timelineOffset(activeClipIndex) + Math.max(0, (els.previewVideo.currentTime - clip.start) / clip.speed);
  }
  function updatePlayhead(position) {
    const pxPerSec = 17 * state.zoom;
    els.playhead.style.left = `${Math.max(0, position * pxPerSec)}px`;
    els.currentTime.textContent = formatTime(position);
  }
  function addClip() {
    const media = getMedia(state.selected);
    if (!media) { toast("Select a video from your library first."); return; }
    const start = Math.max(0, Number(els.trimStart.value) || 0);
    const end = Math.min(media.duration, Number(els.trimEnd.value) || media.duration);
    if (end - start < .1) { toast("Choose a clip range of at least 0.1 seconds."); return; }
    state.clips.push({ mediaId: media.id, start, end, speed: Number(els.clipSpeed.value), volume: Number(els.clipVolume.value) / 100 });
    activeClipIndex = state.clips.length - 1;
    state.selectedClipIndex = activeClipIndex;
    $("#clipEditActions").hidden = false;
    setClipInVideo(activeClipIndex);
    renderTimeline();
    drawFrame();
    toast("Clip added to your timeline.");
  }
  function moveSelectedClip(offset) {
    const index = state.selectedClipIndex;
    const target = index + offset;
    if (index < 0 || target < 0 || target >= state.clips.length) return;
    [state.clips[index], state.clips[target]] = [state.clips[target], state.clips[index]];
    state.selectedClipIndex = target;
    activeClipIndex = target;
    setClipInVideo(target);
    renderTimeline();
    updatePlayhead(timelineOffset(target));
    drawFrame();
  }
  function goToClip(delta) {
    if (!state.clips.length) return;
    activeClipIndex = (activeClipIndex + delta + state.clips.length) % state.clips.length;
    setClipInVideo(activeClipIndex);
    renderTimeline();
    updatePlayhead(timelineOffset(activeClipIndex));
    drawFrame();
  }
  function setVoice(file) {
    if (!file || !file.type.startsWith("audio/")) { toast("Choose a supported audio file."); return; }
    if (state.voice && state.voice.url) URL.revokeObjectURL(state.voice.url);
    const url = addObjectUrl(file);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      state.voice = { file, url, name: file.name, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
      els.voiceStatus.textContent = `${file.name} · ${formatTime(state.voice.duration)}`;
      renderTimeline();
    }, { once: true });
    audio.addEventListener("error", () => toast("This audio file could not be opened."), { once: true });
    audio.load();
  }
  function ensureAudioGraph() {
    if (state.audioContext) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Web Audio is not supported by this browser.");
    const context = new Context();
    const source = context.createMediaElementSource(els.previewVideo);
    const volume = context.createGain();
    source.connect(volume);
    volume.connect(context.destination);
    state.audioContext = context;
    state.sourceNode = source;
    state.volumeNode = volume;
  }
  async function togglePlay() {
    if (!state.clips.length) { toast("Add a clip to the timeline to preview."); return; }
    if (!els.previewVideo.paused) {
      els.previewVideo.pause();
      els.playButton.textContent = "▶";
      els.playButton.setAttribute("aria-label", "Play");
      return;
    }
    if (activeClipIndex < 0) activeClipIndex = 0;
    if (els.previewVideo.currentTime < state.clips[activeClipIndex].start || els.previewVideo.currentTime >= state.clips[activeClipIndex].end) setClipInVideo(activeClipIndex);
    try {
      ensureAudioGraph();
      if (state.audioContext.state === "suspended") await state.audioContext.resume();
      state.volumeNode.gain.value = state.clips[activeClipIndex].volume;
      await els.previewVideo.play();
      els.playButton.textContent = "Ⅱ";
      els.playButton.setAttribute("aria-label", "Pause");
    } catch (error) { toast(`Playback couldn't start: ${error.message}`); }
  }
  els.previewVideo.addEventListener("timeupdate", () => {
    if (state.exporting) return;
    drawFrame();
    if (activeClipIndex >= 0 && state.clips[activeClipIndex]) {
      const clip = state.clips[activeClipIndex];
      state.volumeNode && (state.volumeNode.gain.value = clip.volume);
      updatePlayhead(playbackPosition());
      if (!els.previewVideo.paused && els.previewVideo.currentTime >= clip.end - .025) {
        if (activeClipIndex < state.clips.length - 1) {
          activeClipIndex++;
          setClipInVideo(activeClipIndex);
          renderTimeline();
          els.previewVideo.play().catch(error => toast(`Playback couldn't continue: ${error.message}`));
        } else {
          els.previewVideo.pause();
          els.playButton.textContent = "▶";
          updatePlayhead(state.duration);
        }
      }
    }
  });
  els.previewVideo.addEventListener("seeked", drawFrame);
  els.previewVideo.addEventListener("loadedmetadata", () => { renderPreview(); drawFrame(); });
  els.previewVideo.addEventListener("pause", () => {
    if (!state.exporting) { els.playButton.textContent = "▶"; els.playButton.setAttribute("aria-label", "Play"); drawFrame(); }
  });
  async function importVideos(files) {
    const list = [...files].filter(file => file.type.startsWith("video/"));
    if (!list.length) { toast("Choose a supported video file."); return; }
    let imported = 0;
    for (const file of list) {
      const url = addObjectUrl(file);
      const probe = document.createElement("video");
      probe.preload = "auto";
      try {
        const duration = await readVideoMetadata(probe, url);
        const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, file, url, duration, thumb: "" };
        state.media.push(item);
        imported++;
      } catch (error) {
        URL.revokeObjectURL(url);
        state.objectUrls.delete(url);
        toast(`${file.name}: ${error.message}`);
      } finally {
        probe.removeAttribute("src");
        probe.load();
      }
    }
    renderMediaList();
    if (imported) {
      if (!state.selected) selectMedia(state.media[0].id);
      els.projectTitle.textContent = state.media[0].name.replace(/\.[^.]+$/, "");
      toast(`${imported} video${imported === 1 ? "" : "s"} imported.`);
    }
    els.videoInput.value = "";
  }
  function setupDropzone() {
    const zone = $("#dropzone");
    ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove("dragging"); }));
    zone.addEventListener("drop", event => importVideos(event.dataTransfer.files));
  }
  function readVideoMetadata(video, url) {
    return new Promise((resolve, reject) => {
      let timeout;
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMetadata);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("error", onError);
      };
      const finish = duration => {
        if (settled) return;
        settled = true;
        cleanup();
        if (Number.isFinite(duration) && duration > 0) resolve(duration);
        else reject(new Error("The video duration could not be determined."));
      };
      const availableEnd = () => {
        try {
          if (video.seekable.length) {
            const end = video.seekable.end(video.seekable.length - 1);
            if (Number.isFinite(end) && end > 0) return end;
          }
        } catch (_) { /* The browser may not expose a seekable range for this file. */ }
        return 0;
      };
      const inspect = allowCurrentTime => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          finish(video.duration);
          return;
        }
        const seekableEnd = availableEnd();
        if (seekableEnd) {
          finish(seekableEnd);
          return;
        }
        if (allowCurrentTime && !video.seeking && Number.isFinite(video.currentTime) &&
            video.currentTime > 0 && video.currentTime < 1e100) finish(video.currentTime);
      };
      function onMetadata() {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          finish(video.duration);
          return;
        }
        video.addEventListener("durationchange", onDurationChange);
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("timeupdate", onTimeUpdate);
        timeout = setTimeout(() => {
          inspect(true);
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error("The browser could not determine this video's duration."));
          }
        }, 5000);
        try {
          video.currentTime = 1e101;
        } catch (_) {
          inspect(false);
        }
      }
      function onDurationChange() { inspect(false); }
      function onSeeked() { inspect(true); }
      function onTimeUpdate() { inspect(true); }
      function onError() {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("The video could not be decoded. Try MP4 or WebM."));
      }
      video.addEventListener("loadedmetadata", onMetadata, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.src = url;
      video.load();
    });
  }
  function drawExportFrame(ctx, video, ratio) {
    const width = ctx.canvas.width, height = ctx.canvas.height;
    ctx.fillStyle = "#08090b"; ctx.fillRect(0, 0, width, height);
    if (video.readyState >= 2 && video.videoWidth) {
      const sourceRatio = video.videoWidth / video.videoHeight;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sourceRatio > ratio) { sw = sh * ratio; sx = (video.videoWidth - sw) / 2; }
      else { sh = sw / ratio; sy = (video.videoHeight - sh) / 2; }
      ctx.save(); ctx.filter = filters[state.filter] || "none"; ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height); ctx.restore();
    }
    if (state.title.trim()) {
      const fontSize = Math.max(30, Math.round(width * .055));
      ctx.save(); ctx.font = `800 ${fontSize}px Manrope, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = fontSize * .25; ctx.shadowOffsetY = 2; ctx.fillStyle = "#fff"; ctx.fillText(state.title.trim(), width / 2, height * .87, width * .88); ctx.restore();
    }
  }
  async function waitForSeek(video, time) {
    if (Math.abs(video.currentTime - time) < .025 && video.readyState >= 2) return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out while seeking to a clip.")), 10000);
      video.addEventListener("seeked", () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("A video could not be decoded during export.")); }, { once: true });
      video.currentTime = time;
    });
  }
  const exportMimeTypes = {
    mp4: ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.42E01E", "video/mp4"],
    webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
  };
  function supportedMimeType(format) {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    return exportMimeTypes[format].find(type => MediaRecorder.isTypeSupported(type)) || "";
  }
  function configureExportFormats() {
    const mp4Option = els.exportFormat.querySelector('option[value="mp4"]');
    const webmOption = els.exportFormat.querySelector('option[value="webm"]');
    mp4Option.disabled = !supportedMimeType("mp4");
    webmOption.disabled = !supportedMimeType("webm");
    mp4Option.title = mp4Option.disabled
      ? "MP4 export is not supported by this browser. Choose WebM instead."
      : "Export as MP4 using this browser's built-in encoder.";
    webmOption.title = webmOption.disabled
      ? "WebM export is not supported by this browser. Choose MP4 instead."
      : "Export as WebM.";
    if (mp4Option.disabled) els.exportFormat.value = "webm";
    els.exportFormat.title = mp4Option.disabled
      ? "MP4 is not supported here; exporting is available in WebM."
      : "Choose MP4 or WebM for your exported video.";
  }
  async function exportVideo() {
    if (!state.clips.length || state.exporting) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast("Video export is not supported in this browser. Try a current version of Chrome or Edge."); return; }
    const format = els.exportFormat.value;
    const mime = supportedMimeType(format);
    if (!mime) {
      toast(`${format.toUpperCase()} export is not supported by this browser. Choose a supported format.`);
      return;
    }
    state.exporting = true;
    state.cancelExport = false;
    els.exportButton.disabled = true;
    els.exportOverlay.hidden = false;
    els.exportProgress.style.width = "0%";
    els.exportStatus.textContent = "Preparing your project…";
    let stream, recorder, voiceSource, audioDestination;
    try {
      ensureAudioGraph();
      const context = state.audioContext;
      await context.resume();
      const ratioParts = state.ratio.split(":").map(Number);
      const ratio = ratioParts[0] / ratioParts[1];
      const width = state.ratio === "9:16" ? 720 : 1280;
      const height = Math.round(width / ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      const videoStream = canvas.captureStream(30);
      audioDestination = context.createMediaStreamDestination();
      state.volumeNode.connect(audioDestination);
      const tracks = [...videoStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()];
      stream = new MediaStream(tracks);
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
      state.exportRecorder = recorder;
      const chunks = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
      const stopped = new Promise((resolve, reject) => {
        recorder.addEventListener("stop", () => resolve(chunks), { once: true });
        recorder.addEventListener("error", event => reject(event.error || new Error("The browser failed to encode the video.")), { once: true });
      });
      const total = totalDuration();
      let voiceBuffer = null;
      if (state.voice) {
        const bytes = await state.voice.file.arrayBuffer();
        voiceBuffer = await context.decodeAudioData(bytes);
      }
      recorder.start(250);
      const renderStart = performance.now();
      if (voiceBuffer) {
        voiceSource = context.createBufferSource();
        voiceSource.buffer = voiceBuffer;
        const voiceGain = context.createGain();
        voiceGain.gain.value = .9;
        voiceSource.connect(voiceGain);
        voiceGain.connect(audioDestination);
        voiceSource.start(context.currentTime + .08);
      }
      els.exportStatus.textContent = "Rendering your clips…";
      for (let i = 0; i < state.clips.length; i++) {
        if (state.cancelExport) break;
        const clip = state.clips[i];
        const media = getMedia(clip.mediaId);
        if (!media) throw new Error("A video in this timeline is no longer available.");
        els.previewVideo.pause();
        els.previewVideo.src = media.url;
        els.previewVideo.playbackRate = clip.speed;
        state.volumeNode.gain.value = clip.volume;
        await new Promise((resolve, reject) => {
          if (els.previewVideo.readyState >= 1) { resolve(); return; }
          els.previewVideo.addEventListener("loadedmetadata", resolve, { once: true });
          els.previewVideo.addEventListener("error", () => reject(new Error(`${media.name} could not be loaded for export.`)), { once: true });
        });
        await waitForSeek(els.previewVideo, clip.start);
        await els.previewVideo.play();
        const clipTimelineStart = timelineOffset(i);
        await new Promise((resolve, reject) => {
          let rafId;
          const draw = () => {
            if (state.cancelExport) { els.previewVideo.pause(); resolve(); return; }
            drawExportFrame(ctx, els.previewVideo, ratio);
            const progress = Math.min(100, ((clipTimelineStart + Math.max(0, (els.previewVideo.currentTime - clip.start) / clip.speed)) / total) * 100);
            els.exportProgress.style.width = `${progress}%`;
            els.exportStatus.textContent = `Rendering clip ${i + 1} of ${state.clips.length}…`;
            if (els.previewVideo.currentTime >= clip.end - .025) { els.previewVideo.pause(); resolve(); return; }
            if (els.previewVideo.error) { reject(new Error(`${media.name} encountered a decoding error.`)); return; }
            rafId = requestAnimationFrame(draw);
          };
          rafId = requestAnimationFrame(draw);
          els.previewVideo.addEventListener("error", () => { cancelAnimationFrame(rafId); reject(new Error(`${media.name} encountered a playback error.`)); }, { once: true });
        });
      }
      if (voiceSource) { try { voiceSource.stop(); } catch (_) { /* The source may have ended naturally. */ } }
      els.previewVideo.pause();
      if (recorder.state !== "inactive") recorder.stop();
      const result = await stopped;
      if (state.cancelExport) { toast("Export cancelled."); return; }
      if (!result.length) throw new Error("The export produced an empty video.");
      const blob = new Blob(result, { type: mime });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const safeName = (els.projectTitle.textContent || "video").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").trim() || "video";
      a.download = `${safeName}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      els.exportProgress.style.width = "100%";
      toast(`Export complete · ${formatTime((performance.now() - renderStart) / 1000)} render time`);
    } catch (error) {
      console.error("Video export failed:", error);
      toast(`Export failed: ${error.message}`);
    } finally {
      if (voiceSource) { try { voiceSource.stop(); } catch (_) {} }
      if (recorder && recorder.state !== "inactive") recorder.stop();
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (audioDestination) audioDestination.stream.getTracks().forEach(track => track.stop());
      if (state.volumeNode && audioDestination) state.volumeNode.disconnect(audioDestination);
      state.exportRecorder = null;
      state.exporting = false;
      els.exportOverlay.hidden = true;
      els.exportButton.disabled = !state.clips.length;
      renderTimeline();
    }
  }
  async function toggleRecording() {
    if (state.recording) {
      state.recording.stop();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast("Voice recording needs a supported browser and a secure connection (HTTPS or localhost).");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.addEventListener("dataavailable", event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach(track => track.stop());
        state.recording = null;
        $("#recordButton").classList.remove("recording");
        $("#recordButtonText").textContent = "Record voice";
        if (chunks.length) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          setVoice(new File([blob], `Voiceover ${new Date().toLocaleTimeString()}.webm`, { type: blob.type }));
          toast("Voiceover recording saved.");
        }
      }, { once: true });
      recorder.addEventListener("error", event => { stream.getTracks().forEach(track => track.stop()); state.recording = null; toast(`Recording failed: ${event.error?.message || "microphone error"}`); }, { once: true });
      state.recording = recorder;
      recorder.start();
      $("#recordButton").classList.add("recording");
      $("#recordButtonText").textContent = "Stop recording";
      els.voiceStatus.textContent = "Recording… Click stop when you're done.";
    } catch (error) {
      toast(error.name === "NotAllowedError" ? "Allow microphone access to record a voiceover." : `Microphone unavailable: ${error.message}`);
    }
  }
  function newProject() {
    if (state.exporting) { toast("Cancel the export before starting a new project."); return; }
    els.previewVideo.pause();
    state.media.forEach(item => URL.revokeObjectURL(item.url));
    if (state.voice) URL.revokeObjectURL(state.voice.url);
    state.objectUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
    state.media = []; state.selected = null; state.selectedClipIndex = -1; state.clips = []; state.voice = null; state.duration = 0; activeClipIndex = -1;
    els.projectTitle.textContent = "Untitled project";
    els.stage.classList.remove("has-video"); els.stageEmpty.hidden = false;
    els.previewVideo.removeAttribute("src"); els.previewVideo.load();
    els.playButton.disabled = true; els.addClipButton.disabled = true; els.inspectorAddButton.disabled = true;
    els.noSelection.hidden = false; els.clipSettings.hidden = true;
    els.voiceStatus.textContent = "No voiceover added yet";
    els.titleInput.value = ""; state.title = "";
    renderMediaList(); renderTimeline(); drawFrame();
  }
  els.videoInput.addEventListener("change", event => importVideos(event.target.files));
  els.audioInput.addEventListener("change", event => { if (event.target.files[0]) setVoice(event.target.files[0]); event.target.value = ""; });
  $("#addMediaButton").addEventListener("click", () => els.videoInput.click());
  $("#emptyImportButton").addEventListener("click", () => els.videoInput.click());
  $("#addClipButton").addEventListener("click", addClip);
  $("#inspectorAddButton").addEventListener("click", addClip);
  $("#playButton").addEventListener("click", togglePlay);
  $("#previousButton").addEventListener("click", () => goToClip(-1));
  $("#nextButton").addEventListener("click", () => goToClip(1));
  $("#trimStart").addEventListener("change", () => { handleTrimChange("start"); renderTimeline(); });
  $("#trimEnd").addEventListener("change", () => { handleTrimChange("end"); renderTimeline(); });
  $("#trimRangeStart").addEventListener("input", event => { els.trimStart.value = Number(event.target.value).toFixed(1); handleTrimChange("start"); renderTimeline(); });
  $("#trimRangeEnd").addEventListener("input", event => { els.trimEnd.value = Number(event.target.value).toFixed(1); handleTrimChange("end"); renderTimeline(); });
  els.clipSpeed.addEventListener("change", () => {
    if (state.selectedClipIndex >= 0) {
      state.clips[state.selectedClipIndex].speed = Number(els.clipSpeed.value);
      if (activeClipIndex === state.selectedClipIndex) els.previewVideo.playbackRate = Number(els.clipSpeed.value);
      renderTimeline();
    }
  });
  els.clipVolume.addEventListener("input", () => {
    els.volumeValue.textContent = `${els.clipVolume.value}%`;
    if (state.selectedClipIndex >= 0) state.clips[state.selectedClipIndex].volume = Number(els.clipVolume.value) / 100;
    if (state.volumeNode) state.volumeNode.gain.value = Number(els.clipVolume.value) / 100;
    renderTimeline();
  });
  $("#moveClipLeft").addEventListener("click", () => moveSelectedClip(-1));
  $("#moveClipRight").addEventListener("click", () => moveSelectedClip(1));
  $("#removeClipButton").addEventListener("click", () => {
    const index = state.selectedClipIndex;
    if (index < 0) return;
    state.clips.splice(index, 1);
    activeClipIndex = state.clips.length ? Math.min(index, state.clips.length - 1) : -1;
    state.selectedClipIndex = -1;
    $("#clipEditActions").hidden = true;
    renderTimeline();
    drawFrame();
    toast("Clip removed from the timeline.");
  });
  $("#filterSelect").addEventListener("change", event => { state.filter = event.target.value; drawFrame(); });
  $("#titleInput").addEventListener("input", event => { state.title = event.target.value; drawFrame(); });
  $("#aspectRatio").addEventListener("change", event => { state.ratio = event.target.value; renderPreview(); });
  $("#fullscreenButton").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(error => toast(`Fullscreen unavailable: ${error.message}`));
    else els.stage.requestFullscreen().catch(error => toast(`Fullscreen unavailable: ${error.message}`));
  });
  $("#recordButton").addEventListener("click", toggleRecording);
  $("#exportButton").addEventListener("click", exportVideo);
  $("#cancelExportButton").addEventListener("click", () => {
    state.cancelExport = true;
    if (state.exportRecorder && state.exportRecorder.state !== "inactive") state.exportRecorder.stop();
    els.exportStatus.textContent = "Cancelling export…";
  });
  $("#removeVoiceButton").addEventListener("click", () => {
    if (state.voice) URL.revokeObjectURL(state.voice.url);
    state.voice = null; els.voiceStatus.textContent = "No voiceover added yet"; renderTimeline();
  });
  $("#clearTimelineButton").addEventListener("click", () => {
    els.previewVideo.pause(); state.clips = []; activeClipIndex = -1; state.selectedClipIndex = -1; $("#clipEditActions").hidden = true; renderTimeline(); drawFrame();
  });
  $("#zoomIn").addEventListener("click", () => { state.zoom = Math.min(2.5, state.zoom + .25); $("#zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`; renderTimeline(); });
  $("#zoomOut").addEventListener("click", () => { state.zoom = Math.max(.5, state.zoom - .25); $("#zoomLabel").textContent = `${Math.round(state.zoom * 100)}%`; renderTimeline(); });
  $("#newProjectButton").addEventListener("click", () => {
    if ((state.media.length || state.clips.length || state.voice) && !confirm("Start a new project? This will clear your current timeline and imported media.")) return;
    newProject();
  });
  setupDropzone();
  configureExportFormats();
  renderTimeline();
  renderPreview();
  window.addEventListener("resize", renderPreview);
  window.addEventListener("beforeunload", event => {
    if (state.exporting || state.recording) { event.preventDefault(); event.returnValue = ""; }
  });
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $("#recordButton").title = "Microphone recording requires HTTPS or localhost.";
  }
})();
