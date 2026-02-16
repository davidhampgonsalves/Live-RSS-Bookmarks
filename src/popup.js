function setupButton(btn, func) {
  btn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url?.startsWith("chrome://")) return undefined;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: func
    });
  });  
}

setupButton(document.getElementById('cmdLoadFeeds'), loadFeeds);

function loadFeeds() {
  chrome.runtime.sendMessage({ action: "loadFeeds" });
}
