import { loadConfig } from "./config.js";
import RSSParser from "rss-parser";
import he from "he";

var BOOKMARK_BAR_ID;

/**
 * Storage change
 * @typedef {Object} StorageChange
 * @property {import("./config.js").FeedConfig} [newValue]
 * @property {import("./config.js").FeedConfig} [oldValue]
 */

async function getBookmarksBarId() {
  const bookmarkTreeNodes = await new Promise((resolve) => {
    chrome.bookmarks.getTree((nodes) => {
      resolve(nodes);
    });
  });

  function findBookmarksBar(node) {
    if (node.folderType === "bookmarks-bar") {
      return node;
    }

    if (node.children) {
      for (let child of node.children) {
        const result = findBookmarksBar(child);
        if (result) return result;
      }
    }

    return null;
  }
  return findBookmarksBar(bookmarkTreeNodes[0]).id;
}

function stripUrlParameters(url) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.href;
  } catch (e) {
    // fallback for relative URLs
    return url.split(/[?#]/)[0];
  }
}

function addUrlParameters(url, addParameters) {
  if (!url) return url;
  if (!addParameters || typeof addParameters !== "string") return url;
  const trimmed = addParameters.trim();
  if (!trimmed) return url;

  try {
    const u = new URL(url);
    const [paramsPart, newHash] = trimmed.split("#");
    const cleanParams = paramsPart.replace(/^[?&]+/, "");

    if (cleanParams) {
      if (u.search) {
        u.search += "&" + cleanParams;
      } else {
        u.search = "?" + cleanParams;
      }
    }

    if (newHash !== undefined) {
      u.hash = "#" + newHash;
    }

    return u.href;
  } catch (e) {
    const [paramsPart, newHash] = trimmed.split("#");
    const cleanParams = paramsPart.replace(/^[?&]+/, "");
    const [baseUrl, existingHash] = url.split("#");

    let result = baseUrl;
    if (cleanParams) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      result += separator + cleanParams;
    }

    const finalHash = newHash !== undefined ? newHash : existingHash;
    if (finalHash !== undefined) {
      result += "#" + finalHash;
    }

    return result;
  }
}

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
    try {
      await chrome.bookmarks.removeTree(folderId);
    } catch (e) {
      console.error(e);
    }
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
  console.log("findOrCreate folderID", folderId);
  if (folderId !== undefined)
    try {
      await chrome.bookmarks.get(folderId);
      return folderId;
    } catch {
      // folder does not exist so do not use this id
      folderId = undefined;
      console.log("Couldn't find folder");
    }

  console.log("findOrCreate folderID not found, checking by name");
  // folder id check failed, check based on name + presence of the feed open bookmark
  const bookmarks = await chrome.bookmarks.search({ title: feed.name });
  for (const bk of bookmarks) {
    if (bk.url) continue; // skip non-folders

    const children = await chrome.bookmarks.getChildren(bk.id);
    const feedBookmark = children.find((bk) => bk.url == feed.url);
    if (children.length === 0 || feedBookmark) {
      await chrome.storage.sync.set({ [folderKey]: bk.id });
      return bk.id;
    }
  }

  if (BOOKMARK_BAR_ID == null) {
    BOOKMARK_BAR_ID = await getBookmarksBarId();
  }
  console.log(
    `Create new folder '${feed.name}' with parentId '${BOOKMARK_BAR_ID}'`,
  );

  console.log("findOrCreate name not found, creating folder");
  // folder was not found, create folder
  const folder = await chrome.bookmarks.create({
    title: feed.name,
    parentId: BOOKMARK_BAR_ID,
  });
  console.log(`setting folder for ${feed.uuid} to`, folder.id, "via", {
    [folderKey]: folder.id,
  });
  await chrome.storage.sync.set({ [folderKey]: folder.id });

  return folder.id;
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
    return console.error(
      `Failed to fetch feed "${feed.name}" (${feed.rssURL}):`,
      e,
    );
  }

  const children = await chrome.bookmarks.getChildren(folderId);

  // analyze which bookmarks have been opened and which haven't
  updateVisitedMap(children);

  // remove existing bookmarks
  await Promise.all(children.map((c) => chrome.bookmarks.remove(c.id)));

  // create new bookmarks
  for (const item of rss.items) {
    const pattern = new RegExp(feed.filter);
    const title = he.decode(item.title);
    if (feed.filter.length > 0 && pattern.test(title)) {
      console.log("Skipped ", title);
    } else {
      let url = feed.stripParameters
        ? stripUrlParameters(item.link)
        : item.link;
      if (feed.addParameters) {
        url = addUrlParameters(url, feed.addParameters);
      }
      await chrome.bookmarks.create({
        title: title,
        url: url,
        parentId: folderId,
      });
    }
  }

  await chrome.bookmarks.create({
    title: `Open ${feed.name}`,
    url: feed.url,
    parentId: folderId,
  });
}

// Key in chrome.storage.local where results are kept
const STORAGE_KEY = "bookmarkVisitedMap";

// returns true if history has at least one visit for url
async function wasVisited(url) {
  // chrome.history.getVisits returns visit records for the URL
  return new Promise((resolve) => {
    chrome.history.getVisits({ url }, (visits) =>
      resolve(visits && visits.length > 0),
    );
  });
}

// Load stored map from chrome.storage.local
function loadStoredMap() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || {}); // map: { [bookmarkId]: { id, title, url, visited, lastChecked } }
    });
  });
}

// Save map to chrome.storage.local
function saveStoredMap(map) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: map }, () => resolve());
  });
}

// Main: fetch bookmarks, check visits, merge with stored map, update changed/new entries
async function updateVisitedMap(bookmarks) {
  const storedMap = await loadStoredMap();

  // Keep bookmark entries that still exist (we'll prune deleted ones)
  const newMap = {};

  await Promise.all(
    bookmarks.map(async (b) => {
      const visited = await wasVisited(b.url);
      const now = Date.now();
      const existing = storedMap[b.url];

      // If existing and already visited, keep visited=true and preserve any earlier timestamp
      const finalVisited = existing ? existing.visited || visited : visited;

      newMap[b.url] = {
        url: b.url,
        title: b.title,
        visited: finalVisited,
        // store lastChecked so you can know when it was last verified
        lastChecked: now,
      };
    }),
  );

  // Optionally keep any stored entries for bookmarks that are not currently in tree
  // (comment out if you want to remove deleted bookmarks from storage)
  for (const id of Object.keys(storedMap)) {
    if (!newMap[id]) {
      newMap[id] = storedMap[id]; // preserve deleted bookmark record
    }
  }

  await saveStoredMap(newMap);
  return newMap;
}

chrome.storage.onChanged.addListener(async ({ config }) => {
  await deleteRemovedFeedFolders(config);
  if (config?.newValue) {
    console.log("storage.onChanged - reload");
    await init();
  }
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const alarm = await chrome.alarms.get("poll");
  if (!alarm) {
    await chrome.alarms.create("poll", {
      delayInMinutes: 0.5, // min delay
      periodInMinutes: 20,
    });
  }
  chrome.alarms.onAlarm.addListener(async () => {
    console.log("Alarm - reload");
    await init();
  });
});

chrome.runtime.onMessage.addListener(
  async function (request, sender, sendResponse) {
    console.log("request.action", request.action);

    if (request.action === "loadFeeds") {
      // console.log("get sync");
      // // Extracting data stored in the extension's sync storage
      // chrome.storage.sync.get(null, (data) => {
      //     console.log("Extracted Sync Data:", data);
      // });
      console.log(chrome.bookmarks.getTree());

      console.log("loadFeeds - reload");
      await init();
    }
  },
);

chrome.idle.onStateChanged.addListener(async ({ newState }) => {
  if (newState === "active") {
    console.log("Active - reload");
    await init();
  }
});

(async () => {
  console.log("Init - reload");
  await init();
})();

// **** RUN WEBPACK TASK AFTER MAKING CHANGES
