// Keep report sections compact, including content supplied by async research.
(() => {
  const root = document.querySelector("#report-content");
  const titles = {
    "album-overview": "Album biography",
    "album-tracks": "Songs",
    "album-personnel": "Credits",
    "album-neighbors": "Before & after",
    "album-artist-biography": "Artist biography",
    "missing-biography": "Album biography",
    "missing-tracks": "Songs",
    "missing-personnel": "Credits",
    "missing-identity": "Release identity & purchase links",
    "reference-panel": "Collection Coverage",
    "standalone-artist-biography": "Artist Biography",
    "artist-chronological-albums": "Chronological Albums",
    "drilldown": "Explore these holdings"
  };
  const selector = ".report-panel, .executive, .score-section, .insight-grid";
  function titleCase(value) {
    return value.toLowerCase().replace(/(^|[\s/&(.–—-])([a-z])/g, (_,prefix,letter) => prefix+letter.toUpperCase()).replace(/Musicbrainz/g,"MusicBrainz");
  }
  function titleFor(panel) {
    if (titles[panel.id]) return titles[panel.id];
    if (panel.matches(".executive")) return "What Miles sees";
    if (panel.matches(".score-section")) return "Miles score";
    if (panel.matches(".insight-grid")) return "Collection highlights";
    const label = panel.querySelector(":scope > .eyebrow");
    if (label) return label.textContent.trim().toLowerCase().replace(/^./, c => c.toUpperCase());
    return panel.querySelector("h3, h2")?.textContent.trim() || "Details";
  }
  const openStates = new Map();
  let anchor = null;
  let restoring = false;
  function sectionKey(fold) {
    const panel = fold.querySelector(":scope > .report-fold-body > *");
    return (panel?.id || fold.id || titleCase(panel ? titleFor(panel) : fold.querySelector(":scope > summary")?.textContent || "")).toLowerCase();
  }
  function rememberAnchor() {
    if (restoring) return;
    const folds = [...root.querySelectorAll("details.report-fold")].filter(fold => !fold.hidden);
    const visible=folds.map(fold=>{
      const box=fold.getBoundingClientRect();
      const summary=fold.querySelector(":scope > summary");
      const bodyTop=box.top+(summary?.getBoundingClientRect().height || 0);
      return {fold,box,readingArea:fold.open ? Math.max(0,Math.min(box.bottom,innerHeight)-Math.max(bodyTop,0)) : 0};
    }).filter(row=>row.box.bottom>0 && row.box.top<innerHeight);
    const fold=visible.filter(row=>row.readingArea>0).sort((a,b)=>b.readingArea-a.readingArea)[0]?.fold || visible[0]?.fold;
    anchor = fold ? {key:sectionKey(fold),top:fold.getBoundingClientRect().top} : null;
  }
  function prepareSections() {
    observer.disconnect();
    // The report's existing order is retained: story, music, releases, credits and notes.
    for (const panel of root.querySelectorAll(selector)) {
      if (panel.closest(".report-fold-body") || panel.parentElement.closest(".report-panel, .executive, .score-section, .insight-grid")) continue;
      if (panel.matches("details")) {
        if (panel.dataset.sectionReady) continue;
        const summary = panel.querySelector(":scope > summary");
        if (!summary) continue;
        const title = summary.querySelector("small")?.textContent.trim() ||
          summary.querySelector("strong")?.textContent.trim() || summary.textContent.trim();
        const original = document.createElement("div");
        original.className = "section-context";
        original.append(...summary.childNodes);
        summary.textContent = titleCase(title);
        summary.after(original);
        panel.open = openStates.get(titleCase(title).toLowerCase()) || false;
        panel.dataset.sectionReady = "true";
        panel.classList.add("report-fold");
      } else {
        const fold = document.createElement("details");
        fold.className = "report-fold";
        const summary = document.createElement("summary");
        summary.textContent = titleCase(titleFor(panel));
        const body = document.createElement("div");
        body.className = "report-fold-body";
        panel.before(fold);
        fold.append(summary, body);
        body.append(panel);
        fold.hidden = panel.hidden;
        fold.open = openStates.get(sectionKey(fold)) || false;
      }
    }
    // Async updates replace the inner content, never the disclosure control.
    for (const fold of root.querySelectorAll("details.report-fold")) {
      const panel = fold.querySelector(":scope > .report-fold-body > *");
      if (!panel) continue;
      fold.hidden = panel.hidden;
      const summary = fold.querySelector(":scope > summary");
      const title = titleCase(titleFor(panel));
      if (summary.textContent !== title) summary.textContent = title;
    }
    for (const fold of root.querySelectorAll("details.report-fold")) {
      const key = sectionKey(fold);
      if (openStates.has(key)) fold.open = openStates.get(key);
      else openStates.set(key, fold.open);
    }
    if (anchor) {
      const match = [...root.querySelectorAll("details.report-fold")].find(fold => sectionKey(fold) === anchor.key);
      if (match && !match.hidden) {
        const delta = match.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta)>1) {
          restoring = true;
          window.scrollBy({top:delta,behavior:"instant"});
          restoring = false;
        }
      }
    }
    rememberAnchor();
    observer.observe(root, {childList:true, subtree:true, attributes:true, attributeFilter:["hidden"]});
  }
  const observer = new MutationObserver(prepareSections);
  prepareSections();
  window.MilesSections = {
    begin() {openStates.clear();anchor=null;},
    update(target,html,outer=false) {
      if (!target?.isConnected) return;
      rememberAnchor();
      for (const fold of root.querySelectorAll("details.report-fold")) openStates.set(sectionKey(fold),fold.open);
      if (outer) target.outerHTML=html; else target.innerHTML=html;
      prepareSections();
    }
  };
  // Record the user's intent before the browser dispatches its delayed toggle event.
  root.addEventListener("click",event => {
    const summary=event.target.closest("summary");
    const fold=summary?.parentElement;
    if (!fold?.matches("details.report-fold")) return;
    openStates.set(sectionKey(fold),!fold.open);
    requestAnimationFrame(rememberAnchor);
  },true);
  root.addEventListener("toggle",event => {
    const fold=event.target;
    if (!fold.matches?.("details.report-fold") || !root.contains(fold)) return;
    openStates.set(sectionKey(fold),fold.open);
    rememberAnchor();
  },true);
  window.addEventListener("scroll",rememberAnchor,{passive:true});
  function setAllSections(open) {
    rememberAnchor();
    if (!open && anchor && anchor.top<16) anchor.top=16;
    observer.disconnect();
    for (const fold of root.querySelectorAll("details.report-fold")) {
      openStates.set(sectionKey(fold),open);
      fold.open=open;
    }
    prepareSections();
  }
  document.querySelector("#report-expand-all").addEventListener("click",()=>setAllSections(true));
  document.querySelector("#report-collapse-all").addEventListener("click",()=>setAllSections(false));
  document.addEventListener("click", event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor || !root.contains(anchor)) return;
    const target = document.getElementById(anchor.getAttribute("href").slice(1));
    for (let node = target; node && node !== root; node = node.parentElement) {
      if (node.matches("details")) node.open = true;
    }
  });
})();
