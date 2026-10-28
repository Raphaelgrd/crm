const input = document.getElementById("crmUrl");
const keyInput = document.getElementById("apiKey");
const btn = document.getElementById("save");
const savedMsg = document.getElementById("savedMsg");

chrome.storage.sync.get({ crmUrl: "http://localhost:3000" }, ({ crmUrl }) => {
  input.value = crmUrl;
});
chrome.storage.local.get({ apiKey: "" }, ({ apiKey }) => {
  keyInput.value = apiKey;
});

btn.addEventListener("click", () => {
  const url = input.value.trim().replace(/\/$/, "");
  if (!url) return;
  chrome.storage.local.set({ apiKey: keyInput.value.trim() });
  chrome.storage.sync.set({ crmUrl: url }, () => {
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
});
