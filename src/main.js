import { LatencyEngine } from "./latency-engine.js";
import { InputCapture } from "./input-capture.js";
import { StatsTracker } from "./stats.js";

const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const resetBtn = document.getElementById("reset-btn");
const copyJsonBtn = document.getElementById("copy-json-btn");
const downloadCsvBtn = document.getElementById("download-csv-btn");
const testTarget = document.getElementById("test-target");
const inputLogEl = document.getElementById("input-log");
const statusEl = document.getElementById("status");
const currentInputValueEl = document.getElementById("current-input-value");

const samplesValueEl = document.getElementById("samples-value");
const latestValueEl = document.getElementById("latest-value");
const minValueEl = document.getElementById("min-value");
const avgValueEl = document.getElementById("avg-value");
const maxValueEl = document.getElementById("max-value");

const INPUT_CUE_DURATION_MS = 140;
const stats = new StatsTracker();
const eventLog = [];
let running = false;
let currentInputType = null;
let currentInputValue = null;
let renderScheduled = false;
let renderedLogCount = 0;
let logListEl = null;
let inputCueTimeoutId = null;

const latencyEngine = new LatencyEngine((sample) => {
  if (!running) {
    return;
  }

  currentInputType = sample.eventType;
  currentInputValue = sample.inputValue || null;
  stats.addSample(sample.latencyMs);
  eventLog.push(sample);
  flashInputCue();
  scheduleRender();
});

const inputCapture = new InputCapture(testTarget, (eventType, eventTimeStamp, inputValue) => {
  latencyEngine.recordInput(eventType, eventTimeStamp, inputValue);
});

function formatMs(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${value.toFixed(2)} ms`;
}

function formatInputType(eventType) {
  if (!eventType) {
    return "-";
  }
  return eventType.slice(0, 1).toUpperCase() + eventType.slice(1);
}

function formatCurrentInput(eventType, inputValue) {
  if (inputValue) {
    return inputValue;
  }
  return formatInputType(eventType);
}

function render() {
  renderScheduled = false;
  const summary = stats.getSummary();
  currentInputValueEl.textContent = formatCurrentInput(currentInputType, currentInputValue);
  samplesValueEl.textContent = String(summary.count);
  latestValueEl.textContent = formatMs(summary.latest);
  minValueEl.textContent = formatMs(summary.min);
  avgValueEl.textContent = formatMs(summary.avg);
  maxValueEl.textContent = formatMs(summary.max);

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
      `source=${entry.eventType} at=${entry.inputTime.toFixed(3)}ms ` +
      `paint=${entry.paintTime.toFixed(3)}ms latency=${entry.latencyMs.toFixed(3)}ms`;
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
  stats.reset();
  eventLog.length = 0;
  currentInputType = null;
  currentInputValue = null;
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
    summary: stats.getSummary(),
    bins: stats.getBins(),
    samples: eventLog,
  };

  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  statusEl.textContent = "Copied JSON to clipboard.";
}

function downloadCsv() {
  const header = "index,inputValue,eventType,inputTime,paintTime,latencyMs";
  const rows = eventLog.map((entry, i) =>
    [
      i + 1,
      escapeCsv(formatCurrentInput(entry.eventType, entry.inputValue)),
      escapeCsv(entry.eventType),
      entry.inputTime.toFixed(3),
      entry.paintTime.toFixed(3),
      entry.latencyMs.toFixed(3),
    ].join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "latency-samples.csv";
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

startBtn.addEventListener("click", () => setRunning(true));
stopBtn.addEventListener("click", () => setRunning(false));
resetBtn.addEventListener("click", resetAll);
copyJsonBtn.addEventListener("click", () => {
  copyJson().catch((error) => {
    statusEl.textContent = `Clipboard error: ${error.message}`;
  });
});
downloadCsvBtn.addEventListener("click", downloadCsv);

render();
