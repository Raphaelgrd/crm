let mediaRecorder = null;
let stream = null;
let transcript = "";
let crmUrl = "http://localhost:3000";
let pendingChunks = 0;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_CAPTURE") {
    crmUrl = msg.crmUrl || crmUrl;
    startCapture(msg.streamId);
  }
  if (msg.type === "STOP_CAPTURE") {
    scheduleStop();
  }
});

async function startCapture(streamId) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    transcript = "";
    pendingChunks = 0;

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 500) {
        pendingChunks++;
        transcribeChunk(e.data);
      }
    };

    // 10-second chunks
    mediaRecorder.start(10_000);
  } catch (err) {
    console.error("[Netforce Offscreen] Capture failed:", err);
  }
}

async function transcribeChunk(blob) {
  try {
    const fd = new FormData();
    fd.append("audio", blob, "audio.webm");

    const res = await fetch(`${crmUrl}/api/ai/transcribe`, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) return;

    const data = await res.json();
    if (data.text && data.text.trim()) {
      transcript += (transcript ? " " : "") + data.text.trim();
      chrome.runtime.sendMessage({ type: "TRANSCRIPT_CHUNK", text: data.text.trim() }).catch(() => {});
    }
  } catch (err) {
    console.error("[Netforce Offscreen] Transcription failed:", err);
  } finally {
    pendingChunks = Math.max(0, pendingChunks - 1);
    checkFinished();
  }
}

let stopping = false;

function scheduleStop() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    chrome.runtime.sendMessage({ type: "CAPTURE_STOPPED", transcript }).catch(() => {});
    return;
  }
  stopping = true;
  mediaRecorder.stop();
  stream?.getTracks().forEach((t) => t.stop());

  // Give in-flight chunks time to finish
  setTimeout(() => checkFinished(true), 3000);
}

function checkFinished(force = false) {
  if (!stopping) return;
  if (force || pendingChunks === 0) {
    stopping = false;
    chrome.runtime.sendMessage({ type: "CAPTURE_STOPPED", transcript }).catch(() => {});
  }
}
