import { loadConfig } from "./config.js";
import RSSParser from "rss-parser";
import he from "he";

const BOOKMARK_BAR_ID = "1";

async function init() {
  const config = await loadConfig();

  console.log("using configuration", JSON.stringify(config));
  chrome.alarms.clearAll();
  chrome.alarms.create("poll", { periodInMinutes: 20 });
  chrome.alarms.onAlarm.addListener(() => updateFeeds(config));

  updateFeeds(config);
}

//polls each configured feed with a delay between each to reduce load all at once
async function updateFeeds(config) {
  config.feeds.forEach(updateFeedBookmarks);
}

async function deleteRemovedFeedFolders(config) {
  console.log("calling delete");
  if (!config?.newValue || !config?.oldValue) return;

  const { newValue, oldValue } = config;
  console.log("iterating over", oldValue.feeds);
  oldValue.feeds.forEach(async (feed) => {
    if (newValue.feeds.find((newFeed) => newFeed.uuid === feed.uuid)) return;

    const folderKey = feed.uuid + FOLDER_KEY_SUFFIX;
    const folderId = (await chrome.storage.sync.get())[folderKey];
    console.log("removing folder", folderId);
    chrome.bookmarks.removeTree(folderId);
  });
}

const FOLDER_KEY_SUFFIX = "_folder_id";

async function updateFeedBookmarks(feed) {
  console.log("updating", feed);
  const folderKey = feed.uuid + FOLDER_KEY_SUFFIX;
  let folderId = (await chrome.storage.sync.get())[folderKey];
  console.log("read rolderID", folderId);

  if (folderId !== undefined)
    try {
      await chrome.bookmarks.get(folderId);
    } catch {
      // folder does not exist so do not use this id (a new folder will get created)
      folderId = undefined;
    }

  if (folderId === undefined) {
    const folder = await chrome.bookmarks.create({
      title: feed.name,
      parentId: BOOKMARK_BAR_ID,
    });
    console.log(`setting folder for ${feed.uuid} to`, folder.id, "via", {
      [folderKey]: folder.id,
    });
    await chrome.storage.sync.set({ [folderKey]: folder.id });
    folderId = folder.id;
  }

  // fetch feed
  const parser = new RSSParser();
  let rss;
  try {
    rss = await parser.parseURL(feed.rssURL);
  } catch (e) {
    return console.error(feed.name, e);
  }

  // clear the existing bookmarks
  const children = await chrome.bookmarks.getChildren(folderId);
  await Promise.all(children.map((c) => chrome.bookmarks.remove(c.id)));

  for (const item of rss.items) {
    await chrome.bookmarks.create({
      title: he.decode(item.title),
      url: item.link,
      parentId: folderId,
    });
  }

  await chrome.bookmarks.create({
    title: `Open ${feed.name}`,
    url: feed.url,
    parentId: folderId,
  });
}

// if config changes re-init to pickup changes
chrome.storage.onChanged.addListener(async ({ config }) => {
  console.log("storage on change called");
  await deleteRemovedFeedFolders(config);
  if (config?.newValue) init();
});

init();
