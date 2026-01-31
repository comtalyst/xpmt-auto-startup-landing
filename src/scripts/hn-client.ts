import { fetchFeedItems, formatRelativeTime, hnCommentsUrl, hnItemUrl, removeCached } from "../lib/hn";

type Feed = "top" | "new" | "best";

type HNItem = {
  id: number;
  title?: string;
  by?: string;
  time?: number;
  score?: number;
  descendants?: number;
};

function main() {
  const listEl = document.getElementById("list") as HTMLElement | null;
  const footerEl = document.getElementById("list-footer") as HTMLElement | null;
  const readerEl = document.getElementById("reader") as HTMLElement | null;
  const refreshBtn = document.getElementById("refresh") as HTMLButtonElement | null;
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".feed-tab"));

  if (!listEl || !footerEl || !readerEl || !refreshBtn || !tabs.length) return;

  let feed: Feed = "top";
  let items: HNItem[] = [];
  let loading = false;
  let error: string | null = null;
  let selectedId: number | null = null;
  let controller: AbortController | null = null;

  function parseStateFromUrl() {
    const url = new URL(window.location.href);
    const f = url.searchParams.get("feed");
    if (f === "top" || f === "new" || f === "best") feed = f;
    const id = url.searchParams.get("id");
    selectedId = id ? Number(id) : null;
    if (Number.isNaN(selectedId)) selectedId = null;
  }

  function pushUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set("feed", feed);
    if (selectedId) url.searchParams.set("id", String(selectedId));
    else url.searchParams.delete("id");
    history.replaceState({}, "", url);
  }

  function setActiveTab() {
    for (const t of tabs) {
      const isActive = t.dataset.feed === feed;
      t.setAttribute("aria-selected", String(isActive));
      t.classList.toggle("bg-blue-500/20", isActive);
      t.classList.toggle("ring-1", isActive);
      t.classList.toggle("ring-blue-400/25", isActive);
    }
  }

  function clear(el: HTMLElement) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderList() {
    clear(listEl);
    footerEl.textContent = "";

    if (loading) {
      const wrap = el("div", "p-5");
      wrap.appendChild(el("div", "text-sm font-semibold text-neutral-200", "Loading stories…"));
      wrap.appendChild(el("div", "mt-2 text-xs text-neutral-400", "Fetching from the official Hacker News Firebase API."));
      listEl.appendChild(wrap);
      return;
    }

    if (error) {
      const wrap = el("div", "p-5");
      wrap.appendChild(el("div", "text-sm font-semibold text-rose-200", "Could not load stories"));
      wrap.appendChild(el("div", "mt-2 text-xs text-neutral-400", error));
      listEl.appendChild(wrap);
      return;
    }

    if (!items.length) {
      const wrap = el("div", "p-5 text-sm text-neutral-300", "No stories to show.");
      listEl.appendChild(wrap);
      return;
    }

    for (const item of items) {
      const row = el("div", "group flex gap-4 px-5 py-4 hover:bg-white/[0.04]");

      const metaCol = el("div", "w-14 shrink-0 text-right");
      metaCol.appendChild(el("div", "text-sm font-semibold text-neutral-100", String(item.score ?? 0)));
      metaCol.appendChild(el("div", "text-[11px] text-neutral-400", "points"));

      const mainCol = el("div", "min-w-0 flex-1");

      const titleBtn = el("button", "text-left text-sm font-semibold text-neutral-100 hover:text-blue-200") as HTMLButtonElement;
      titleBtn.type = "button";
      titleBtn.textContent = item.title ?? "(untitled)";
      titleBtn.addEventListener("click", () => {
        selectedId = item.id;
        pushUrl();
        renderReader();
        highlightSelected();
      });

      const sub = el("div", "mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400");
      const when = formatRelativeTime(item.time);
      if (when) sub.appendChild(el("span", "", when));
      sub.appendChild(el("span", "text-neutral-600", "·"));
      sub.appendChild(el("span", "", `${item.descendants ?? 0} comments`));
      sub.appendChild(el("span", "text-neutral-600", "·"));
      sub.appendChild(el("span", "", `by ${item.by ?? "unknown"}`));

      mainCol.appendChild(titleBtn);
      mainCol.appendChild(sub);

      const linkCol = el("div", "shrink-0");
      const open = el(
        "a",
        "inline-flex items-center rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-200 ring-1 ring-white/10 hover:bg-white/10",
        "Open"
      ) as HTMLAnchorElement;
      open.href = hnItemUrl(item as any);
      open.target = "_blank";
      open.rel = "noreferrer";
      linkCol.appendChild(open);

      row.appendChild(metaCol);
      row.appendChild(mainCol);
      row.appendChild(linkCol);

      row.dataset.id = String(item.id);
      listEl.appendChild(row);
    }

    footerEl.textContent = `Showing ${items.length} stories from “${feed}”. Cached for faster reloads.`;
  }

  function highlightSelected() {
    const rows = Array.from(listEl.querySelectorAll<HTMLElement>("[data-id]"));
    for (const r of rows) {
      const isSel = selectedId && r.dataset.id === String(selectedId);
      r.classList.toggle("bg-blue-500/10", Boolean(isSel));
      r.classList.toggle("ring-1", Boolean(isSel));
      r.classList.toggle("ring-blue-400/20", Boolean(isSel));
    }
  }

  function renderReader() {
    clear(readerEl);

    if (!selectedId) {
      const box = el("div", "rounded-xl bg-white/5 p-4 ring-1 ring-white/10");
      box.appendChild(el("div", "text-sm font-semibold text-neutral-100", "Select a story"));
      box.appendChild(el("div", "mt-2 text-xs text-neutral-400", "Click any title to open details here."));
      readerEl.appendChild(box);
      return;
    }

    const item = items.find((x) => x.id === selectedId);

    if (!item) {
      const box = el("div", "rounded-xl bg-white/5 p-4 ring-1 ring-white/10");
      box.appendChild(el("div", "text-sm font-semibold text-neutral-100", "Story not in current list"));
      box.appendChild(el("div", "mt-2 text-xs text-neutral-400", "Try switching feeds or refreshing."));
      readerEl.appendChild(box);
      return;
    }

    const header = el("div");
    header.appendChild(el("div", "text-sm font-semibold text-neutral-50", item.title ?? "(untitled)"));

    const meta = el("div", "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-400");
    const when = formatRelativeTime(item.time);
    if (when) meta.appendChild(el("span", "", when));
    meta.appendChild(el("span", "text-neutral-600", "·"));
    meta.appendChild(el("span", "", `${item.score ?? 0} points`));
    meta.appendChild(el("span", "text-neutral-600", "·"));
    meta.appendChild(el("span", "", `${item.descendants ?? 0} comments`));
    header.appendChild(meta);

    const actions = el("div", "mt-4 flex flex-wrap gap-2");
    const openOriginal = el(
      "a",
      "inline-flex items-center rounded-xl bg-blue-500 px-4 py-2 text-xs font-semibold text-neutral-950 hover:bg-blue-400",
      "Open original"
    ) as HTMLAnchorElement;
    openOriginal.href = hnItemUrl(item as any);
    openOriginal.target = "_blank";
    openOriginal.rel = "noreferrer";

    const openComments = el(
      "a",
      "inline-flex items-center rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-100 ring-1 ring-white/10 hover:bg-white/10",
      "HN comments"
    ) as HTMLAnchorElement;
    openComments.href = hnCommentsUrl(item.id);
    openComments.target = "_blank";
    openComments.rel = "noreferrer";

    const clearSel = el(
      "button",
      "inline-flex items-center rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-neutral-100 ring-1 ring-white/10 hover:bg-white/10",
      "Clear"
    ) as HTMLButtonElement;
    clearSel.type = "button";
    clearSel.addEventListener("click", () => {
      selectedId = null;
      pushUrl();
      renderReader();
      highlightSelected();
    });

    actions.appendChild(openOriginal);
    actions.appendChild(openComments);
    actions.appendChild(clearSel);

    const summary = el("div", "mt-5 rounded-xl bg-neutral-950/60 p-4 ring-1 ring-white/10");
    summary.appendChild(el("div", "text-xs font-semibold text-neutral-100", "Summary (placeholder)"));
    summary.appendChild(
      el(
        "div",
        "mt-2 text-xs leading-relaxed text-neutral-300",
        "MVP: article summarization is not yet enabled. This is where a generated summary, key bullets, and reading time estimate would appear."
      )
    );

    const urlBox = el("div", "mt-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10");
    urlBox.appendChild(el("div", "text-[11px] font-semibold text-neutral-200", "URL"));
    urlBox.appendChild(el("div", "mt-1 break-words text-xs text-neutral-300", hnItemUrl(item as any)));

    readerEl.appendChild(header);
    readerEl.appendChild(actions);
    readerEl.appendChild(summary);
    readerEl.appendChild(urlBox);
  }

  async function load(opts: { bustCache?: boolean } = {}) {
    if (controller) controller.abort();
    controller = new AbortController();

    loading = true;
    error = null;
    renderList();
    setActiveTab();

    try {
      if (opts.bustCache) {
        removeCached(`ids:${feed}`);
        removeCached(`items:${feed}:30`);
      }
      items = (await fetchFeedItems({ feed, limit: 30, concurrency: 10, ttlMs: 5 * 60 * 1000, abort: controller.signal })) as any;
      items = (items || []).filter(Boolean);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      error = e?.message ? String(e.message) : "Unknown error.";
    } finally {
      loading = false;
      renderList();
      renderReader();
      highlightSelected();
    }
  }

  for (const t of tabs) {
    t.addEventListener("click", () => {
      const next = t.dataset.feed;
      if (next !== "top" && next !== "new" && next !== "best") return;
      feed = next;
      selectedId = null;
      pushUrl();
      load();
    });
  }

  refreshBtn.addEventListener("click", () => load({ bustCache: true }));

  parseStateFromUrl();
  setActiveTab();
  renderList();
  renderReader();
  load();
}

main();
