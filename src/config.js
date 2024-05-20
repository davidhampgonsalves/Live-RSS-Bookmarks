const DEFAULT_CONFIG = { feeds: [] };

/**
 * Feed item 
 * @typedef {Object} FeedItem
 * @property {uuid} uuid - Feed ID
 * @property {string} name - Feed name
 * @property {string} rssURL - RSS feed URL
 * @property {string} url - Site URL
 */

/**
 * Feed config 
 * @typedef {Object} FeedConfig
 * @property {FeedItem[]} feeds
 */

/**
 * Loads feed config
 * @returns {Promise<FeedConfig>}
 */
export const loadConfig = async () => {
  const { config } = await chrome.storage.sync.get("config");
  return { ...DEFAULT_CONFIG, ...config };
}

/**
 * Saves feed config
 * @param {FeedConfig} config 
 * @returns {Promise<void>}
 */
export const saveConfig = async (config) => {
  console.log("saving Config", config)
  await chrome.storage.sync.set({ config: config });
};
