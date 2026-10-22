
document.getElementById('cmdLoadFeeds').addEventListener('click',  async () => {
  chrome.runtime.sendMessage({ action: "loadFeeds" });
});


// TODO store in central place
// Key in chrome.storage.local where results are kept
const STORAGE_KEY = 'bookmarkVisitedMap';

document.getElementById('cmdExportHistory').addEventListener('click', async () => {
  console.log("exportHistory");
  chrome.storage.local.get([STORAGE_KEY], (res) => {
    const data = res[STORAGE_KEY] || {}; // map: { [bookmarkId]: { id, title, url, visited, lastChecked } }
    const text = JSON.stringify(data);

    // console.log(text);
    // Attached is a json with websites and the information whether they were visited or not.
    // Based on that, make a prediction whether the user would visit the following website: 

    safeClipboardCopy(text);
  });
});

async function safeClipboardCopy(text) {
  // Validate input
  if (!text || typeof text !== "string") {
    console.error("Invalid text provided");
    return false;
  }

  // Try modern Clipboard API first
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Clipboard API error:", err);
      // Fall through to fallback
    }
  }

  // Fallback to execCommand
  console.log("Using fallback copy method");
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  
  try {
    textarea.select();
    document.execCommand("copy");
    return true;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// **** RUN WEBPACK TASK AFTER MAKING CHANGES
