import { loadConfig } from "./config.js";
import RSSParser from "rss-parser";
import he from "he";

const BOOKMARK_BAR_ID = "1";

/**
 * Storage change 
 * @typedef {Object} StorageChange
 * @property {import("./config.js").FeedConfig} [newValue]
 * @property {import("./config.js").FeedConfig} [oldValue]
 */

/**
 * Initializes
 * @returns {Promise<void>} 
 */
async function init() {
  const config = await loadConfig();

  console.log("using configuration", JSON.stringify(config));
  await updateFeeds(config);
}

/**
 * Polls each configured feed with a delay between each to reduce load all at once
 * @param {import("./config.js").FeedConfig} config
 * @returns {Promise<void>} 
 */
async function updateFeeds(config) {
  for (const feed of config.feeds) {
    await updateFeedBookmarks(feed);
  }
}

/**
 * Deletes bookmarks folders removed from config
 * @param {StorageChange} config 
 * @returns {Promise<void>}
 */
async function deleteRemovedFeedFolders(config) {
  console.log("calling delete");
  if (!config?.newValue || !config?.oldValue) return;

  const { newValue, oldValue } = config;
  console.log("iterating over", oldValue.feeds);
  for (const feed of oldValue.feeds) {
    // Skip delete if item exists in new config and old config
    if (newValue.feeds.find((newFeed) => newFeed.uuid === feed.uuid)) continue;

    const folderKey = feed.uuid + FOLDER_KEY_SUFFIX;
    const folderId = (await chrome.storage.sync.get())[folderKey];
    console.log("removing folder", folderId);
    await chrome.bookmarks.removeTree(folderId);
  }
}

const FOLDER_KEY_SUFFIX = "_folder_id";

/**
 * Finds or creates bookmarks folder by feed item
 * @param {import("./config.js").FeedItem} feed 
 * @returns {Promise<string>} Folder ID
 */
async function findOrCreateFolder(feed) {
  const folderKey = feed.uuid + FOLDER_KEY_SUFFIX;
  let folderId = (await chrome.storage.sync.get())[folderKey];
  console.log("read folderID", folderId);
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
  return folderId;
}

/**
 * Updates feed item bookmarks
 * @param {import("./config.js").FeedItem} feed 
 * @returns {Promise<void>}
 */
async function updateFeedBookmarks(feed) {
  console.log("updating", feed);
  const folderId = await findOrCreateFolder(feed);

  // fetch feed
  const parser = new RSSParser();
  let rss;
  try {
    rss = await parser.parseURL(feed.rssURL);
  } catch (e) {
    return console.error(feed.name, e);
  }

  // remove existing bookmarks
  const children = await chrome.bookmarks.getChildren(folderId);
  await Promise.all(children.map((c) => chrome.bookmarks.remove(c.id)));

  // create new bookmarks
  for (const item of rss.items) {
    await chrome.bookmarks.create({ title: he.decode(item.title), url: item.link, parentId: folderId });
  }

  await chrome.bookmarks.create({ title: `Open ${feed.name}`, url: feed.url, parentId: folderId });
}

chrome.storage.onChanged.addListener(async ({ config }) => {
  await deleteRemovedFeedFolders(config);
  if (config?.newValue) {
    await init();
  }
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.alarms.clear("poll");
  await chrome.alarms.create("poll", { periodInMinutes: 20 }); // does this run in 20 or now AND in 20?
  chrome.alarms.onAlarm.addListener(async () => {
    const config = await loadConfig();
    await updateFeeds(config)
  });
});

(async () => {
  await init();
})();
