import { InputCapture } from "./input-capture.js";

const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const resetBtn = document.getElementById("reset-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const copyJsonBtn = document.getElementById("copy-json-btn");
const downloadCsvBtn = document.getElementById("download-csv-btn");
const testTarget = document.getElementById("test-target");
const targetWrapEl = document.querySelector(".target-wrap");
const inputLogEl = document.getElementById("input-log");
const statusEl = document.getElementById("status");
const currentInputValueEl = document.getElementById("current-input-value");

const samplesValueEl = document.getElementById("samples-value");
const latestValueEl = document.getElementById("latest-value");
const minValueEl = document.getElementById("min-value");
const avgValueEl = document.getElementById("avg-value");

const INPUT_CUE_DURATION_MS = 140;
const eventLog = [];
let running = false;
let currentInputType = null;
let currentInputValue = null;
let renderScheduled = false;
let renderedLogCount = 0;
let logListEl = null;
let inputCueTimeoutId = null;
let firstInputTime = null;
let latestInputTime = null;
const localDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3,
  hour12: false,
});

const inputCapture = new InputCapture(testTarget, (eventType, eventTimeStamp, inputValue) => {
  if (!running) {
    return;
  }

  const inputTime = normalizeEventTimestamp(eventTimeStamp);
  const sample = {
    eventType,
    inputValue: inputValue || null,
    inputTime,
  };

  currentInputType = sample.eventType;
  currentInputValue = sample.inputValue;
  eventLog.push(sample);
  if (firstInputTime === null) {
    firstInputTime = sample.inputTime;
  }
  latestInputTime = sample.inputTime;
  flashInputCue();
  scheduleRender();
});

function formatAbsoluteLocalTime(epochMs) {
  if (epochMs === null || epochMs === undefined) {
    return "-";
  }
  return localDateTimeFormatter.format(new Date(epochMs));
}

function formatSource(eventType) {
  if (!eventType) {
    return "-";
  }

  const sourceLabels = {
    keyboard: "Keyboard",
    mouse: "Mouse",
    touch: "Touch",
    pen: "Pen",
    gamepad: "Gamepad",
    xr: "WebXR",
    pointer: "Pointer",
  };

  return sourceLabels[eventType] || eventType.slice(0, 1).toUpperCase() + eventType.slice(1);
}

function formatCurrentInput(eventType, inputValue) {
  if (inputValue) {
    return inputValue;
  }
  return formatSource(eventType);
}

function render() {
  renderScheduled = false;
  const sampleCount = eventLog.length;
  currentInputValueEl.textContent = formatCurrentInput(currentInputType, currentInputValue);
  samplesValueEl.textContent = String(sampleCount);
  latestValueEl.textContent = formatSource(currentInputType);
  minValueEl.textContent = formatAbsoluteLocalTime(firstInputTime);
  avgValueEl.textContent = formatAbsoluteLocalTime(latestInputTime);

  renderInputLog();
}

function renderInputLog() {
  if (eventLog.length === 0) {
    inputLogEl.innerHTML = '<p class="empty-state">No samples yet.</p>';
    logListEl = null;
    renderedLogCount = 0;
    return;
  }

  if (!logListEl) {
    inputLogEl.innerHTML = "";
    logListEl = document.createElement("ol");
    logListEl.className = "input-log-list";
    inputLogEl.appendChild(logListEl);
  }

  for (let i = renderedLogCount; i < eventLog.length; i += 1) {
    const entry = eventLog[i];
    const item = document.createElement("li");
    item.className = "input-log-entry";
    item.textContent =
      `${i + 1}. input=${formatCurrentInput(entry.eventType, entry.inputValue)} ` +
      `source=${formatSource(entry.eventType)} at=${formatAbsoluteLocalTime(entry.inputTime)}`;
    logListEl.appendChild(item);
  }

  renderedLogCount = eventLog.length;
  inputLogEl.scrollTop = inputLogEl.scrollHeight;
}

function scheduleRender() {
  if (renderScheduled) {
    return;
  }
  renderScheduled = true;
  requestAnimationFrame(() => {
    if (!running) {
      renderScheduled = false;
      return;
    }
    render();
  });
}

function flashInputCue() {
  testTarget.classList.add("input-received");
  if (inputCueTimeoutId !== null) {
    clearTimeout(inputCueTimeoutId);
  }
  inputCueTimeoutId = setTimeout(() => {
    testTarget.classList.remove("input-received");
    inputCueTimeoutId = null;
  }, INPUT_CUE_DURATION_MS);
}

function setRunning(next) {
  running = next;
  if (running) {
    inputCapture.start();
    statusEl.textContent = "Running";
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    inputCapture.stop();
    if (inputCueTimeoutId !== null) {
      clearTimeout(inputCueTimeoutId);
      inputCueTimeoutId = null;
    }
    testTarget.classList.remove("input-received");
    statusEl.textContent = "Stopped";
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function resetAll() {
  eventLog.length = 0;
  currentInputType = null;
  currentInputValue = null;
  firstInputTime = null;
  latestInputTime = null;
  renderedLogCount = 0;
  logListEl = null;
  if (inputCueTimeoutId !== null) {
    clearTimeout(inputCueTimeoutId);
    inputCueTimeoutId = null;
  }
  testTarget.classList.remove("input-received");
  statusEl.textContent = "Idle";
  render();
}

async function copyJson() {
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      count: eventLog.length,
      firstInputTime,
      firstInputTimeLocal: formatAbsoluteLocalTime(firstInputTime),
      latestInputTime,
      latestInputTimeLocal: formatAbsoluteLocalTime(latestInputTime),
    },
    samples: eventLog,
  };

  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  statusEl.textContent = "Copied JSON to clipboard.";
}

function downloadCsv() {
  const header = "index,inputValue,eventType,inputTimeLocal,inputTimeEpochMs";
  const rows = eventLog.map((entry, i) =>
    [
      i + 1,
      escapeCsv(formatCurrentInput(entry.eventType, entry.inputValue)),
      escapeCsv(formatSource(entry.eventType)),
      escapeCsv(formatAbsoluteLocalTime(entry.inputTime)),
      entry.inputTime.toFixed(3),
    ].join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "input-events.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = "Downloaded CSV.";
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!text.includes(",") && !text.includes('"') && !text.includes("\n")) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeEventTimestamp(eventTimeStamp) {
  if (!Number.isFinite(eventTimeStamp)) {
    return Date.now();
  }

  if (eventTimeStamp > 1e12) {
    return eventTimeStamp;
  }

  return performance.timeOrigin + eventTimeStamp;
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isTargetWrapFullscreen() {
  const fullscreenElement = getFullscreenElement();
  return fullscreenElement === targetWrapEl;
}

function updateFullscreenButtonState() {
  const isFullscreen = isTargetWrapFullscreen();
  fullscreenBtn.textContent = isFullscreen ? "Exit Fullscreen" : "Fullscreen Input";
  fullscreenBtn.setAttribute("aria-pressed", String(isFullscreen));
}

function requestTargetWrapFullscreen() {
  if (!targetWrapEl) {
    throw new Error("Input area container was not found.");
  }
  const requestFullscreen =
    targetWrapEl.requestFullscreen || targetWrapEl.webkitRequestFullscreen;
  if (!requestFullscreen) {
    throw new Error("Fullscreen is not supported in this browser.");
  }
  return requestFullscreen.call(targetWrapEl);
}

function exitDocumentFullscreen() {
  const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exitFullscreen) {
    throw new Error("Cannot exit fullscreen in this browser.");
  }
  return exitFullscreen.call(document);
}

async function toggleTargetWrapFullscreen() {
  if (isTargetWrapFullscreen()) {
    await exitDocumentFullscreen();
    return;
  }
  await requestTargetWrapFullscreen();
}

function onFullscreenChange() {
  updateFullscreenButtonState();
  if (isTargetWrapFullscreen()) {
    testTarget.focus({ preventScroll: true });
  }
}

startBtn.addEventListener("click", () => setRunning(true));
stopBtn.addEventListener("click", () => setRunning(false));
resetBtn.addEventListener("click", resetAll);
fullscreenBtn.addEventListener("click", () => {
  toggleTargetWrapFullscreen().catch((error) => {
    statusEl.textContent = `Fullscreen error: ${error.message}`;
  });
});
copyJsonBtn.addEventListener("click", () => {
  copyJson().catch((error) => {
    statusEl.textContent = `Clipboard error: ${error.message}`;
  });
});
downloadCsvBtn.addEventListener("click", downloadCsv);
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

updateFullscreenButtonState();
render();
