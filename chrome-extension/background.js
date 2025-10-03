// Background service worker: sets up context menus and action
const CONTEXT_MENU_ID_OPEN = "bv-open";
const CONTEXT_MENU_ID_TOGGLE = "bv-toggle";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID_OPEN,
    title: "Open in Borderless Viewer",
    contexts: ["image", "video", "page", "link"]
  });

  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID_TOGGLE,
    title: "Toggle Borderless Viewer",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === CONTEXT_MENU_ID_OPEN) {
    await ensureContentInjected(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "BV_OPEN", src: info.srcUrl || info.linkUrl || null });
  }
  if (info.menuItemId === CONTEXT_MENU_ID_TOGGLE) {
    await ensureContentInjected(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "BV_TOGGLE" });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  await ensureContentInjected(tab.id);
  chrome.tabs.sendMessage(tab.id, { type: "BV_TOGGLE" });
});

async function ensureContentInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/index.js"],
      injectImmediately: true
    });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content/index.css"] });
  } catch (err) {
    // If already injected, ignore
  }
}
