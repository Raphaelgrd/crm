const dot = document.getElementById("dot");
const statusText = document.getElementById("statusText");
const recordingInfo = document.getElementById("recordingInfo");
const timerEl = document.getElementById("timer");
const preview = document.getElementById("preview");
const btnStop = document.getElementById("btnStop");
const btnSettings = document.getElementById("btnSettings");

let timerInterval = null;

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function refresh() {
  const { recording, startTime, lastChunk } = await chrome.storage.local.get(["recording", "startTime", "lastChunk"]);

  if (recording && startTime) {
    dot.classList.add("active");
    statusText.textContent = "Réunion en cours — transcription active";
    statusText.classList.add("recording");
    recordingInfo.style.display = "block";

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerEl.textContent = fmt(Date.now() - startTime);
    }, 1000);
    timerEl.textContent = fmt(Date.now() - startTime);

    if (lastChunk) {
      preview.textContent = "…" + lastChunk.slice(-120);
      preview.classList.add("visible");
    }
  } else {
    dot.classList.remove("active");
    statusText.textContent = "En attente d'une réunion Teams ou Google Meet…";
    statusText.classList.remove("recording");
    recordingInfo.style.display = "none";
    clearInterval(timerInterval);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if ("recording" in changes || "lastChunk" in changes) refresh();
});

btnStop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
  chrome.storage.local.set({ recording: false });
  refresh();
});

btnSettings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Store last chunk for preview
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TRANSCRIPT_CHUNK" && msg.text) {
    chrome.storage.local.set({ lastChunk: msg.text });
  }
});

refresh();
