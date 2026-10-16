const input = document.getElementById("crmUrl");
const btn = document.getElementById("save");
const savedMsg = document.getElementById("savedMsg");

chrome.storage.sync.get({ crmUrl: "http://localhost:3000" }, ({ crmUrl }) => {
  input.value = crmUrl;
});

btn.addEventListener("click", () => {
  const url = input.value.trim().replace(/\/$/, "");
  if (!url) return;
  chrome.storage.sync.set({ crmUrl: url }, () => {
    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });
});
