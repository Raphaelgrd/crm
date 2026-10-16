const MEETING_PATTERNS = [
  /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/,
  /teams\.microsoft\.com.*meetup-join/,
  /teams\.microsoft\.com.*\/meet\b/,
  /teams\.live\.com\/meet\//,
];

const state = { isRecording: false, tabId: null, startTime: null };

function isMeetingUrl(url) {
  if (!url) return false;
  return MEETING_PATTERNS.some((p) => p.test(url));
}

// Detect meeting tab becoming active
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  if (isMeetingUrl(tab.url) && !state.isRecording) {
    await startRecording(tabId);
  } else if (!isMeetingUrl(tab.url) && state.isRecording && state.tabId === tabId) {
    await stopRecording();
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (state.isRecording && state.tabId === tabId) {
    await stopRecording();
  }
});

async function startRecording(tabId) {
  try {
    // Get stream ID from the meeting tab (Chrome 116+ supports this in service workers)
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

    state.isRecording = true;
    state.tabId = tabId;
    state.startTime = Date.now();

    await chrome.storage.local.set({ recording: true, startTime: state.startTime });

    // Create offscreen document for audio capture (one at a time)
    const offscreenUrl = chrome.runtime.getURL("offscreen.html");
    const existing = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    if (existing.length === 0) {
      await chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ["USER_MEDIA"],
        justification: "Capture audio de la réunion pour transcription",
      });
    }

    const { crmUrl = "http://localhost:3000" } = await chrome.storage.sync.get({ crmUrl: "http://localhost:3000" });

    // Give offscreen doc a moment to initialize
    await new Promise((r) => setTimeout(r, 200));

    chrome.runtime.sendMessage({ type: "START_CAPTURE", streamId, crmUrl }).catch(() => {});

    chrome.action.setBadgeText({ text: "●" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });

    chrome.notifications.create("recording-start", {
      type: "basic",
      iconUrl: "icon.png",
      title: "Netforce Recorder",
      message: "Enregistrement démarré — la réunion sera transcrite automatiquement.",
    });
  } catch (err) {
    console.error("[Netforce] Failed to start recording:", err);
    state.isRecording = false;
  }
}

async function stopRecording() {
  if (!state.isRecording) return;
  state.isRecording = false;
  await chrome.storage.local.set({ recording: false });
  chrome.action.setBadgeText({ text: "" });
  chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }).catch(() => {});
}

// Messages from offscreen doc
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RECORDING_STATUS") {
    sendResponse({ isRecording: state.isRecording, startTime: state.startTime });
  }

  if (msg.type === "CAPTURE_STOPPED") {
    const transcript = msg.transcript || "";
    if (!transcript.trim()) return;

    chrome.storage.local.set({ pendingTranscript: transcript }, async () => {
      const { crmUrl = "http://localhost:3000" } = await chrome.storage.sync.get({ crmUrl: "http://localhost:3000" });
      const tab = await chrome.tabs.create({ url: `${crmUrl}/comptes-rendus/nouveau` });

      const listener = (tabId, changeInfo) => {
        if (tabId !== tab.id || changeInfo.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (transcriptText) => {
            const dispatch = () =>
              document.dispatchEvent(
                new CustomEvent("netforce-transcript", { detail: { transcript: transcriptText } })
              );
            // Give React time to hydrate
            if (document.readyState === "complete") setTimeout(dispatch, 1200);
            else window.addEventListener("load", () => setTimeout(dispatch, 1200));
          },
          args: [transcript],
        }).catch(() => {});
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }
});
