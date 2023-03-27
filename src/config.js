const DEFAULT_CONFIG = { feeds: [] };
export const loadConfig = () =>
  chrome.storage.sync
    .get("config")
    .then(({ config }) => ({ ...DEFAULT_CONFIG, ...config })); 

export const saveConfig = (config) => {
  console.log("saving Config", config)
  chrome.storage.sync.set({ config: config });
};
