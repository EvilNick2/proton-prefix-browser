import {
  callable,
  definePlugin,
  findModule,
  sleep,
  Millennium,
} from "@steambrew/client";

declare const MainWindowBrowserManager: any;
declare const SteamClient: any;
declare const appStore: any;

const has_prefix = callable<[{ appid: number }], string>("has_prefix");

function unwrapStr(value: string): string {
  if (typeof value !== "string") return "";
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  return value;
}

const CTX_ITEM_ID = "proton-prefix-context-item";
const BROWSE_LOCAL_LABELS = ["Browse local files"];

const prefixCache = new Map<number, string>();

async function resolvePrefix(appid: number): Promise<string> {
  const cached = prefixCache.get(appid);
  if (cached !== undefined) return cached;
  const pfx = unwrapStr(await has_prefix({ appid }));
  prefixCache.set(appid, pfx);
  return pfx;
}

function warmPrefix(appid: number | null) {
  if (appid !== null && !prefixCache.has(appid)) resolvePrefix(appid).catch(() => {});
}

let lastCardAppId: number | null = null;
let lastCardName = "";

const WaitForElement = async (sel: string, parent: any = document) =>
  [...(await Millennium.findElement(parent, sel))][0];

function appIdFromPath(pathname: string): number | null {
  const m = pathname.match(/\/app\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function gearButtonSelector(): string {
  const InPage = findModule((e: any) => e.InPage).InPage;
  const AppButtonsContainer = findModule((e: any) => e.AppButtonsContainer).AppButtonsContainer;
  const MenuButtonContainer = findModule((e: any) => e.MenuButtonContainer).MenuButtonContainer;
  return `div.${InPage} div.${AppButtonsContainer} > div.${MenuButtonContainer}:not([role="button"])`;
}

async function addPrefixButton(popupDocument: any, appid: number) {
  const pfx = await resolvePrefix(appid);
  if (!pfx) return;

  let gearButton: any;
  try {
    gearButton = await WaitForElement(gearButtonSelector(), popupDocument);
  } catch (e) {
    return;
  }
  if (!gearButton) return;
  if (gearButton.parentNode.querySelector("div.proton-prefix-button")) return;

  const prefixButton = gearButton.cloneNode(true);
  prefixButton.classList.add("proton-prefix-button");
  const focusable = prefixButton.firstChild;
  if (focusable) {
    focusable.innerHTML = "PP";
    if (focusable.setAttribute) focusable.setAttribute("aria-label", "Browse Proton Prefix");
  }
  prefixButton.title = "Browse Proton Prefix";
  gearButton.parentNode.insertBefore(prefixButton, gearButton.nextSibling);

  prefixButton.addEventListener("click", () => {
    SteamClient.System.OpenLocalDirectoryInSystemExplorer(pfx);
  });
}

function resolveMenuAppId(): number | null {
  const path = MainWindowBrowserManager?.m_lastLocation?.pathname ?? "";
  const fromPath = appIdFromPath(path);
  if (fromPath !== null) return fromPath;
  if (lastCardAppId !== null) return lastCardAppId;
  if (lastCardName) {
    const hit = appStore?.allApps?.find((a: any) => a.display_name === lastCardName);
    if (hit) return hit.appid;
  }
  return null;
}

function findLeafWithText(root: any, labels: string[]): any {
  if (!root || root.nodeType !== 1) return null;
  let best: any = null;
  for (const el of [root, ...root.querySelectorAll("*")] as any) {
    const t = (el.textContent || "").trim();
    if (labels.some((l) => t === l)) {
      if (!best || el.childElementCount < best.childElementCount) best = el;
    }
  }
  return best;
}

function rowForLeaf(leaf: any): any {
  let row = leaf;
  while (row.parentElement && row.parentElement.childElementCount <= 1) {
    row = row.parentElement;
  }
  return row;
}

function dismissMenu(el: any) {
  try {
    const doc = el.ownerDocument;
    const view = doc?.defaultView;
    if (!doc || !view) return;
    const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    for (const target of [el, doc, view]) {
      target.dispatchEvent(new view.KeyboardEvent("keydown", opts));
      target.dispatchEvent(new view.KeyboardEvent("keyup", opts));
    }
  } catch {}
}

function buildAndInsert(row: any, pfx: string) {
  const list = row.parentElement;
  if (!list) return;
  if (list.querySelector?.("#" + CTX_ITEM_ID)) return;

  const clone = row.cloneNode(true);
  clone.id = CTX_ITEM_ID;
  const cloneLabel = findLeafWithText(clone, BROWSE_LOCAL_LABELS) || clone;
  cloneLabel.textContent = "Browse Proton Prefix";
  clone.addEventListener("click", () => {
    dismissMenu(clone);
    SteamClient.System.OpenLocalDirectoryInSystemExplorer(pfx);
  });
  list.insertBefore(clone, row.nextSibling);
}

function injectAfterBrowseLocal(node: any) {
  const leaf = findLeafWithText(node, BROWSE_LOCAL_LABELS);
  if (!leaf) return;
  const row = rowForLeaf(leaf);
  if (row.parentElement?.querySelector?.("#" + CTX_ITEM_ID)) return;

  const appid = resolveMenuAppId();
  if (appid === null) return;

  const cached = prefixCache.get(appid);
  if (cached !== undefined) {
    if (cached) buildAndInsert(row, cached);
    return;
  }
  resolvePrefix(appid).then((pfx) => { if (pfx) buildAndInsert(row, pfx); }).catch(() => {});
}

function watchForContextMenus(popup: any) {
  const container = popup.m_popup.document.getElementById("popup_target");
  if (!container) return;

  container.addEventListener("mousedown", (e: any) => {
    lastCardAppId = null;
    lastCardName = "";
    try {
      const x = e.clientX, y = e.clientY;
      const cards = container.querySelectorAll('[draggable="true"]');
      for (const el of cards as any) {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const src = el.querySelector("img")?.src ?? "";
          const am = src.match(/\/assets\/(\d+)\//);
          lastCardAppId = am ? parseInt(am[1], 10) : null;
          lastCardName = el.querySelector("span")?.innerText?.trim()
            || el.children?.[1]?.textContent?.trim() || "";
          break;
        }
      }
    } catch {}
    warmPrefix(resolveMenuAppId());
  });

  const observer = new MutationObserver((list) => {
    for (const mutation of list) {
      if (mutation.type !== "childList") continue;
      mutation.addedNodes.forEach((node: any) => {
        try {
          if (node.nodeType !== 1) return;
          const txt = node.textContent || "";
          if (BROWSE_LOCAL_LABELS.some((l) => txt.includes(l))) {
            injectAfterBrowseLocal(node);
          }
        } catch {}
      });
    }
  });
  observer.observe(container, { childList: true, subtree: true });
}

async function onPopupCreation(popup: any) {
  if (popup.m_strName !== "SP Desktop_uid0") return;

  await sleep(10000);

  let mwbm: any;
  while (!mwbm) {
    try { mwbm = MainWindowBrowserManager; } catch { await sleep(100); }
  }

  watchForContextMenus(popup);

  MainWindowBrowserManager.m_browser.on("finished-request", async () => {
    const pathname = MainWindowBrowserManager.m_lastLocation.pathname;
    const appid = appIdFromPath(pathname);
    if (appid === null || !pathname.startsWith("/library/app/")) return;
    warmPrefix(appid);
    try {
      await addPrefixButton(popup.m_popup.document, appid);
    } catch (err) {}
  });
}

export default definePlugin(async () => {
  Millennium.AddWindowCreateHook(onPopupCreation);
  return { title: "Proton Prefix Browser" };
});
