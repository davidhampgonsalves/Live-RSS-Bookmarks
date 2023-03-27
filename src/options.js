import { loadConfig, saveConfig } from "./config.js";

//loads the feed configuration in the options page
async function showFeeds() {
  var { feeds } = await loadConfig();

  feeds.forEach((feed, i) => addFeed(feed, i));

  if (!feeds.length) addFeed();
}

function feedElementCount() {
  return document.querySelectorAll(".feed:not(.feed-template").length;
}

//appends a feed to the options page
function addFeed(feed = { uuid: crypto.randomUUID() }, i = null) {
  if (i == null) i = feedElementCount();

  var newFeed = document.querySelector(".feed-template").cloneNode(true);
  newFeed.classList.remove("feed-template");

  //set the new fields values if they were passed in
  for (const field in feed) {
    const input = newFeed.querySelector(`input[name='feed[].${field}']`);
    if (feed[field] != null) input.value = feed[field];
  }

  for (const input of newFeed.querySelectorAll(`input`)) {
    input.name = input.name.replace("[]", `[${i}]`);
  }

  document.querySelector("#feeds").appendChild(newFeed);

  newFeed.querySelector(".delete").addEventListener("click", (event) => {
    event.preventDefault();
    event.target.closest(".feed").remove();

    if (feedElementCount() === 0) addFeed();
  });

  return false;
}

function onAdd() {
  addFeed();
  return false;
}

//saves or appends to the current settings with the feeds on the page
let previousTimeout = null;
function onSave(event) {
  event.preventDefault();

  const formData = new FormData(event.target);
  const feeds = [];
  let lastFormIndex;
  for (const [key, value] of formData.entries()) {
    const formIndex = key.replace(/\D/g, "");
    // Since removals can result in missing form key indexes we just use them to
    // check when we are on a new entity
    if(formIndex != lastFormIndex) {
      lastFormIndex = formIndex;
      feeds.push({})
    }
    feeds[feeds.length-1][key.replace(/.+\./g, "")] = value;
  }
  const config = { feeds };

  saveConfig(config);

  const saveButton = document.querySelector("#save");
  const saveMsg = saveButton.innerHTML;
  saveButton.innerHTML =
    "<span class='material-symbols-outlined'>check</span> Saved";

  if (previousTimeout) window.clearTimeout(previousTimeout);
  previousTimeout = window.setTimeout(
    () => (saveButton.innerHTML = saveMsg),
    2000
  );
}

//init method of the options page
document.addEventListener("DOMContentLoaded", function () {
  document.querySelector("#add").addEventListener("click", onAdd);
  document.querySelector("form").addEventListener("submit", onSave);

  showFeeds();
});
