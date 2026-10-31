function replaceReportHtml(target,html,outer=false) {
  MilesSections.update(target,html,outer);
}

const SCOPES = ["Artist", "Album", "Song", "Contributor", "Decade", "Composer", "Year", "Instrument"];
const DB_NAME = "miles-library";
const STORE_NAME = "snapshots";
const FUSION_STORE = "fusions";
const SNAPSHOT_KEY = "latest";

let library = [];
let libraryLoadGeneration = 0;
let activeScope = "Artist";
let reportHistory = [];
let recentReportEntries = [];
let reportHistoryIndex = -1;
let currentReportMatches = [];
let missingReleaseLookup = new Map();
let creditEvidence = [];
const songReportCache = new Map();
const songStoryCache = new Map();
const songTheoryCache = new Map();
// Verified MusicBrainz recording anchors for high-traffic songs where the
// first search page omits the original master or a documented cover.
const SONG_RECORDING_ANCHORS = {
  "sweet caroline": {
    primary:"9d0a89d7-72aa-4b60-bf0e-b8b8247ad805",
    primaryDate:"1969",
    covers:["40e68c1b-78f7-48a3-8da3-6c42c868f4a1"]
  },
  "baron saturday": {
    primary:"518e8ac9-1c23-4f63-977e-257d1c7a0a2c",
    primaryDate:"1968",
    covers:[]
  }
};
// Track-level observations supplied from Plex. The preloaded catalog contains
// albums only, so these are kept separate from MusicBrainz release inferences.
const SONG_PLEX_TRACK_EVIDENCE = {
  "sweet caroline": [
    {artist:"Neil Diamond",album:"Sweet Caroline",track:"Sweet Caroline"},
    {artist:"Neil Diamond",album:"Hot August Night [Live]",track:"Sweet Caroline"},
    {artist:"Neil Diamond",album:"Neil Diamond 50: 50th Anniversary Collection",track:"Sweet Caroline"},
    {artist:"Bobby Womack",album:"Understanding",track:"Sweet Caroline (Good Times Never Seemed So Good)"}
  ]
};

const $ = (selector) => document.querySelector(selector);
const els = {
  tabs: $("#scope-tabs"), scopeLabel: $("#scope-label"), query: $("#query"), form: $("#miles-form"),
  file: $("#library-file"), loadLast: $("#load-last"), forget: $("#forget-library"), message: $("#import-message"),
  status: $("#library-status"), stats: $("#stats"), report: $("#report"), reportContent: $("#report-content"),
  tangledToggle: $("#tangled-web-toggle"), tangledDialog: $("#tangled-web-dialog"), tangledPath: $("#tangled-web-path"), tangledClose: $("#tangled-web-close")
};

const WISHLIST_KEY = "miles-wishlist-v1";
let wishlist = [];
let wishlistFeedbackTimer;
try {
  const saved = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "[]");
  if (Array.isArray(saved)) wishlist = saved.filter((row) => row && typeof row.artist === "string" && typeof row.album === "string").slice(0,500);
} catch (_) {}

function wishlistKey(artist,album,type = "Album") { return `${type}|${String(artist).trim().toLocaleLowerCase()}|${String(album).trim().toLocaleLowerCase()}`; }
function wishlistButton(artist,album,year = "",type = "Album") {
  const saved = wishlist.some((row) => wishlistKey(row.artist,row.album,row.type) === wishlistKey(artist,album,type));
  return `<button type="button" class="wishlist-action" data-wishlist-toggle data-wishlist-type="${escapeHtml(type)}" data-wishlist-artist="${escapeHtml(artist)}" data-wishlist-album="${escapeHtml(album)}" data-wishlist-year="${escapeHtml(year)}" aria-pressed="${saved}">${saved ? "✓ On your wishlist" : "+ Add to wishlist"}</button>`;
}
function saveWishlist() {
  try { localStorage.setItem(WISHLIST_KEY,JSON.stringify(wishlist)); return true; }
  catch (_) { return false; }
}
function renderWishlist() {
  const mode = $("#wishlist-sort").value;
  const rows = [...wishlist].sort((a,b) => mode === "artist" ? sortKey(a.artist).localeCompare(sortKey(b.artist)) || sortKey(a.album).localeCompare(sortKey(b.album))
    : mode === "album" ? sortKey(a.album).localeCompare(sortKey(b.album)) || sortKey(a.artist).localeCompare(sortKey(b.artist))
    : mode === "type" ? String(a.type || "Album").localeCompare(b.type || "Album") || sortKey(a.album).localeCompare(sortKey(b.album))
    : mode === "year" ? String(a.year || "9999").localeCompare(String(b.year || "9999")) || sortKey(a.artist).localeCompare(sortKey(b.artist))
    : mode === "oldest" ? a.addedAt-b.addedAt : b.addedAt-a.addedAt);
  $("#wishlist-count").textContent = $("#menu-wishlist-count").textContent = `(${wishlist.length})`;
  $("#wishlist-items").innerHTML = rows.map((row) => {
    const type = row.type || "Album";
    const data = `data-wishlist-type="${escapeHtml(type)}" data-wishlist-artist="${escapeHtml(row.artist)}" data-wishlist-album="${escapeHtml(row.album)}" data-wishlist-year="${escapeHtml(row.year || "")}"`;
    return `<article class="wishlist-item"><div><strong>${escapeHtml(type === "Artist" ? row.artist : `${row.artist ? row.artist + " · " : ""}${row.album}`)}</strong><small>${escapeHtml(type)}${row.year ? ` · ${escapeHtml(row.year)}` : ""}</small></div><div class="wishlist-item-actions"><button type="button" data-wishlist-open ${data}>Miles ${type.toLowerCase()} page</button><button type="button" data-wishlist-remove ${data} aria-label="Remove ${escapeHtml(row.album || row.artist)} from wishlist">Remove</button></div></article>`;
  }).join("") || `<p class="muted">Your wishlist is empty. Add a song, album, or artist from its Miles page.</p>`;
  document.querySelectorAll("[data-wishlist-toggle]").forEach((button) => {
    const saved = wishlist.some((row) => wishlistKey(row.artist,row.album,row.type) === wishlistKey(button.dataset.wishlistArtist,button.dataset.wishlistAlbum,button.dataset.wishlistType));
    button.textContent = saved ? "✓ On your wishlist" : "+ Add to wishlist";
    button.setAttribute("aria-pressed",String(saved));
  });
}
function toggleWishlist(artist,album,year = "",type = "Album") {
  artist = String(artist || "").trim(); album = String(album || "").trim();
  if (!album || (type !== "Song" && !artist)) return;
  const key = wishlistKey(artist,album,type);
  const existing = wishlist.findIndex((row) => wishlistKey(row.artist,row.album,row.type) === key);
  const previous = [...wishlist];
  if (existing >= 0) wishlist.splice(existing,1);
  else wishlist.push({type,artist,album,year:String(year || "").match(/\b(?:18|19|20)\d{2}\b/)?.[0] || "",addedAt:Date.now()});
  if (!saveWishlist()) { wishlist = previous; $("#wishlist-feedback").textContent = "This browser could not save your wishlist. Please try again."; }
  else $("#wishlist-feedback").textContent = existing >= 0 ? "Removed from wishlist." : `Added ${type.toLowerCase()} to wishlist.`;
  clearTimeout(wishlistFeedbackTimer);
  wishlistFeedbackTimer = setTimeout(() => $("#wishlist-feedback").textContent = "",4000);
  renderWishlist();
}

function refreshCollectionControls() {
  $("#collection-stats").innerHTML = els.stats.innerHTML.replace(/ id="[^"]*"/g, "");
  $("#plex-state").textContent = library.length ? `${library.length.toLocaleString()} albums loaded from your Plex snapshot.` : "No Plex collection loaded.";
  $("#plex-disconnect").disabled = !library.length;
  $("#plex-connect").disabled = Boolean(library.length);
}
function initMilesMenu() {
  const menu = $("#miles-menu");
  $("#miles-menu-open").addEventListener("click", () => menu.showModal());
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-panel]");
    if (!button) return;
    menu.close(); refreshCollectionControls(); renderWishlist(); syncReportNavigation();
    $("#" + button.dataset.menuPanel).showModal();
  });
  document.querySelectorAll(".miles-panel").forEach((panel) => {
    panel.addEventListener("click", (event) => { if (event.target === panel || event.target.closest("[data-panel-close]")) panel.close(); });
  });
  $("#plex-connect").addEventListener("click", async () => {
    $("#plex-connect").disabled = true;
    try { const records = await readLibrary(); if (records.length) loadRecords(records,false); else await preloadLibrary(); }
    catch (_) { await preloadLibrary(); }
    refreshCollectionControls();
  });
  $("#plex-disconnect").addEventListener("click", () => {
    ++libraryLoadGeneration; ++reportRunId; library = []; currentReportMatches = []; creditEvidence = []; songReportCache.clear();
    ["album-count","artist-count","year-count","genre-count"].forEach((id) => $("#" + id).textContent = "0");
    els.stats.hidden = true; els.report.hidden = true;
    els.status.textContent = "Collection disconnected"; els.status.classList.remove("ready");
    localStorage.setItem("miles-collection-disconnected","true");
    renderDiscoveryControls(); refreshCollectionControls(); setMessage("Collection disconnected. Your saved snapshot is available to reconnect.");
  });
  $("#wishlist-type").addEventListener("change", () => {
    const artist = $("#wishlist-type").value === "Artist";
    $("#wishlist-title").disabled = artist; $("#wishlist-title").required = !artist;
    $("#wishlist-title-label").textContent = $("#wishlist-type").value === "Song" ? "Song" : "Album";
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
}

function sortKey(value = "") { return String(value).replace(/^(the|a)\s+/i, "").trim().toLocaleLowerCase(); }
function firstValue(object, names) {
  for (const name of names) {
    const key = Object.keys(object).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return "";
}

function normalizeRow(row) {
  const artist = firstValue(row, ["artist", "grandparentTitle", "albumArtist", "Artist"]);
  const album = firstValue(row, ["album", "title", "parentTitle", "Album"]);
  const yearRaw = firstValue(row, ["year", "originallyAvailableAt", "Year"]);
  const genresRaw = firstValue(row, ["genres", "genre", "Genres"]);
  const tracks = firstValue(row, ["tracks", "trackCount", "Tracks"]);
  const studio = firstValue(row, ["studio", "label", "Studio"]);
  const dateAdded = firstValue(row, ["date added", "addedAt", "Date Added"]);
  const ratingKey = firstValue(row, ["plex rating key", "ratingKey", "Plex Rating Key"]);
  const year = String(yearRaw || "").match(/\b(18|19|20)\d{2}\b/)?.[0] || "";
  const genres = Array.isArray(genresRaw) ? genresRaw.map((g) => typeof g === "string" ? g : g.tag).filter(Boolean) : String(genresRaw || "").split(/[;,|]/).map((g) => g.trim()).filter(Boolean);
  return {
    artist: String(artist || "Unknown Artist").trim(), album: String(album || "Untitled").trim(), year,
    genres, tracks: Number(tracks) || 0, studio: String(studio || "").trim(),
    dateAdded: String(dateAdded || "").trim(), ratingKey: String(ratingKey || "").trim(), raw: row
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function extractJsonRecords(data) {
  if (Array.isArray(data)) return data;
  const candidates = [data.albums, data.items, data.Metadata, data.library, data.data];
  const found = candidates.find(Array.isArray);
  if (found) return found;
  for (const value of Object.values(data || {})) if (Array.isArray(value)) return value;
  return [];
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(FUSION_STORE)) request.result.createObjectStore(FUSION_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeFusion(key,value) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(FUSION_STORE,"readwrite");
    tx.objectStore(FUSION_STORE).put(value,key);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

async function readFusion(key) {
  const db = await openDb();
  return new Promise((resolve,reject) => {
    const request = db.transaction(FUSION_STORE).objectStore(FUSION_STORE).get(key);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
}

async function saveLibrary(records) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(records, SNAPSHOT_KEY);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}

async function readLibrary() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(SNAPSHOT_KEY);
    request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
  });
}

async function forgetLibrary() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
    request.onsuccess = resolve; request.onerror = () => reject(request.error);
  });
}

function setMessage(message, error = false) { els.message.textContent = message; els.message.classList.toggle("error", error); }

function renderStats() {
  const artists = new Set(library.map((item) => item.artist.toLocaleLowerCase()));
  const years = new Set(library.map((item) => item.year).filter(Boolean));
  const genres = new Set(library.flatMap((item) => item.genres.map((genre) => genre.toLocaleLowerCase())));
  $("#album-count").textContent = library.length.toLocaleString();
  $("#artist-count").textContent = artists.size.toLocaleString();
  $("#year-count").textContent = years.size.toLocaleString();
  $("#genre-count").textContent = genres.size.toLocaleString();
  els.stats.hidden = false;
  refreshCollectionControls();
  els.status.textContent = `${library.length.toLocaleString()} albums ready`;
  els.status.classList.add("ready");
}

function loadRecords(records, persist = true) {
  library = records.map(normalizeRow).filter((item) => item.artist || item.album);
  if (!library.length) throw new Error("No album records were found in that file.");
  localStorage.removeItem("miles-collection-disconnected");
  songReportCache.clear();
  renderStats();
  renderDiscoveryControls();
  setMessage(`Loaded ${library.length.toLocaleString()} albums. Your library is ready to explore.`);
  if (persist) saveLibrary(library).catch(() => setMessage("The library loaded, but this browser could not save a reusable copy.", true));
}

function renderTabs() {
  els.tabs.innerHTML = SCOPES.map((scope) => `<button class="scope-tab" type="button" role="tab" aria-selected="${scope === activeScope}" data-scope="${scope}">${scope}</button>`).join("");
  els.scopeLabel.textContent = activeScope;
  els.query.placeholder = ({Artist:"e.g. The Beatles",Year:"e.g. 1967",Decade:"e.g. 1970s",Album:"e.g. Revolver"})[activeScope] || `Search by ${activeScope.toLowerCase()}`;
}

function reportEntryLabel(entry) {
  if (entry.scope === "Album") return entry.detail ? entry.query : `Album: ${entry.query}`;
  if (entry.scope === "Missing") return `Missing: ${entry.query}`;
  if (entry.scope === "Song" && entry.context?.artist) return `Song: ${entry.context.artist} · ${entry.query}`;
  return `${entry.scope}: ${entry.query}`;
}

function reportVisitKey(entry) {
  return [entry.scope,canonicalTitle(entry.query),songArtistKey(entry.artist || entry.context?.artist || ""),entry.detail ? "detail" : "",entry.context?.recordingId || ""].join("|");
}
function touchReportVisit(entry) {
  const key=reportVisitKey(entry);
  recentReportEntries=recentReportEntries.filter(previous=>reportVisitKey(previous)!==key);
  recentReportEntries.push(entry);
}
function reportHistoryMarkup() {
  return recentReportEntries.map(entry => {
    const index=reportHistory.indexOf(entry);
    return `<button type="button" data-history-index="${index}" ${index === reportHistoryIndex ? 'aria-current="page"' : ""}><span>${escapeHtml(reportEntryLabel(entry))}</span></button>`;
  }).join(`<span class="history-separator" aria-hidden="true">›</span>`);
}

function syncReportNavigation() {
  els.tangledToggle.hidden = !reportHistory.length;
  document.querySelectorAll("[data-history-back], #back-button").forEach((button) => button.disabled = reportHistoryIndex <= 0);
  document.querySelectorAll("[data-history-forward]").forEach((button) => button.disabled = reportHistoryIndex < 0 || reportHistoryIndex >= reportHistory.length - 1);
  $("#history-position").textContent = reportHistory.length ? `${reportHistoryIndex + 1} of ${reportHistory.length}` : "No stops yet";
  const markup = reportHistoryMarkup();
  els.tangledPath.innerHTML = markup || `<p class="muted">Your journey starts with your first Miles search.</p>`;
}

function addReportHistory(entry) {
  cacheCurrentReportState();
  const current = reportHistory[reportHistoryIndex];
  if (!current || current.scope !== entry.scope || current.query !== entry.query || current.artist !== entry.artist ||
      (entry.scope === "Song" && (current.context?.artist !== entry.context?.artist || current.context?.recordingId !== entry.context?.recordingId || current.context?.album !== entry.context?.album))) {
    reportHistory.push(entry);
    reportHistoryIndex = reportHistory.length - 1;
  }
  touchReportVisit(reportHistory[reportHistoryIndex]);
  syncReportNavigation();
}

function cacheCurrentReportState() {
  const entry = reportHistory[reportHistoryIndex];
  if (!entry || !els.reportContent.innerHTML) return;
  // Incomplete research is rerun when revisited rather than restoring a frozen spinner.
  const progress=document.querySelector("#research-status progress");
  const pending = (progress && !document.querySelector("#research-status").hidden && progress.value<progress.max) || els.reportContent.querySelector(".song-release-loading") ||
    [...els.reportContent.querySelectorAll("h3, .report-header .verdict")].some((node) => /^(Finding |Checking |Fusing |Researching |Sourcing )/.test(node.textContent.trim()));
  if (pending) { delete entry.html; return; }
  entry.html = els.reportContent.innerHTML;
  entry.scrollY = window.scrollY;
  entry.matches = currentReportMatches;
}

function restoreCachedReport(entry) {
  reportRunId++;
  MilesSections.begin();
  MilesResearch.reset();
  syncReportNavigation();
  els.report.hidden = false;
  els.reportContent.innerHTML = entry.html;
  currentReportMatches = entry.matches || [];
  renderWishlist();
  hydrateListeningTools();
  requestAnimationFrame(() => window.scrollTo({top:entry.scrollY ?? els.report.offsetTop,behavior:"auto"}));
}

function openReportHistory(index,keepDialogOpen = false) {
  const entry = reportHistory[index];
  if (!entry) return;
  cacheCurrentReportState();
  if (els.tangledDialog.open && !keepDialogOpen) els.tangledDialog.close();
  reportHistoryIndex = index;
  touchReportVisit(entry);
  activeScope = entry.scope === "Missing" ? "Album" : entry.scope;
  renderTabs(); els.query.value = entry.query;
  if (entry.html) { restoreCachedReport(entry); return; }
  if (entry.scope === "Album") {
    activeScope = "Album"; renderTabs(); els.query.value = entry.query;
    if (!entry.detail) { renderReport("Album",entry.query,false); return; }
    if (entry.html) { restoreCachedReport(entry); return; }
    const item = entry.context?.item || library.find((row) => row.album === entry.query && row.artist === entry.artist) || library.find((row) => row.album === entry.query);
    if (item) renderAlbumDetail(item,false,Boolean(entry.context?.unowned));
  } else if (entry.scope === "Missing") {
    if (entry.html) { restoreCachedReport(entry); return; }
    const context = entry.context || missingReleaseLookup.get(entry.mbid);
    if (context) renderMissingReleaseDetail(context,false);
  } else if (entry.scope === "Song") {
    activeScope = "Song"; renderTabs(); els.query.value = entry.query;
    if (entry.html) restoreCachedReport(entry); else renderSongReport(entry.query,false,entry.context);
  } else if (entry.scope === "Instrument") {
    activeScope = "Instrument"; renderTabs(); els.query.value = entry.query; renderRoleReport(entry.query,false);
  } else {
    activeScope = entry.scope; renderTabs(); els.query.value = entry.query; renderReport(entry.scope,entry.query,false);
  }
}

function matchesScope(item, query, scope = activeScope) {
  const q = query.toLocaleLowerCase().trim();
  if (scope === "Artist" || scope === "Contributor" || scope === "Composer") return [item.artist,referenceArtistName(item.artist)].some((name) => name.toLocaleLowerCase().includes(q));
  if (scope === "Album" || scope === "Song") return item.album.toLocaleLowerCase().includes(q);
  if (scope === "Year") return item.year === q;
  if (scope === "Decade") return item.year && item.year.startsWith(q.replace(/s$/, "").slice(0, 3));
  if (scope === "Instrument") return item.genres.some((genre) => genre.toLocaleLowerCase().includes(q));
  return [item.artist, item.album, item.year, ...item.genres].some((value) => String(value).toLocaleLowerCase().includes(q));
}

function genreBreakdown(matches) {
  const counts = new Map();
  matches.flatMap((item) => item.genres.length ? item.genres : ["Unclassified"]).forEach((genre) => counts.set(genre, (counts.get(genre) || 0) + 1));
  return [...counts].sort((a,b) => b[1]-a[1]).slice(0, 12);
}

const ERA_CONTEXT = {
  1950: "The LP became the serious listening format while rhythm & blues, bebop, cool jazz, country and early rock ’n’ roll remade the postwar record business.",
  1960: "Albums overtook singles as artistic statements. Soul labels, the British Invasion, folk revival, free jazz, psychedelia and studio experimentation rapidly widened popular music’s vocabulary.",
  1970: "Rock fragmented into progressive, glam, metal, punk and arena forms while funk, reggae, fusion, singer-songwriters, disco and electronic music claimed distinct worlds.",
  1980: "MTV and the compact disc changed discovery and consumption. Hip-hop, synth-pop, post-punk, indie, metal and dance music built new audiences and production languages.",
  1990: "Alternative rock, grunge, Britpop and electronic scenes moved into the mainstream while hip-hop became a dominant album art and independent labels gained leverage.",
  2000: "Downloads and then streaming broke the old release economy. Rap, R&B, indie rock, electronic hybrids and globally networked scenes reshaped both the album and the audience.",
  2010: "Streaming became the default. Genre borders weakened as hip-hop, pop, electronic production, revived vinyl culture and direct-to-fan releases coexisted.",
  2020: "Pandemic-era listening, short-form discovery, catalog revival and increasingly global pop accelerated a shift from fixed genre lanes toward fluid scenes and perpetual rediscovery."
};

const YEAR_CONTEXT = {
  1955: "Rock ’n’ roll broke into the mass market while hard bop gathered force and the LP was becoming central to adult listening.",
  1959: "A landmark jazz year: modal jazz, hard bop and large-ensemble experimentation produced an extraordinary concentration of enduring albums.",
  1964: "The British Invasion transformed the American market as Motown, soul, surf, folk and jazz remained commercially and artistically potent.",
  1965: "Folk-rock and soul surged; studio craft and album ambition accelerated as rock musicians moved beyond the dance single.",
  1966: "The studio became an instrument. Psychedelia, soul, garage rock, free jazz and sophisticated pop all pushed recording and songwriting forward.",
  1967: "The album era announced itself at full volume: psychedelia, soul, jazz, folk-rock and studio experimentation converged during the Summer of Love and its darker aftermath.",
  1968: "Popular music grew heavier, rootsier and more politically charged as psychedelia splintered into hard rock, country rock, progressive forms and radical soul.",
  1969: "Woodstock-era rock, heavy music, fusion, funk and singer-songwriters pointed toward the 1970s while the counterculture reached both its peak and fracture point.",
  1971: "Singer-songwriters, progressive rock, soul, funk and hard rock produced a famously deep album year as post-1960s introspection replaced utopian confidence.",
  1977: "Punk and disco simultaneously reset energy, style and audience while electronic production and arena rock expanded in opposite directions.",
  1982: "Thriller-era pop scale, early hip-hop, post-punk, synth-pop and new wave converged as MTV made image inseparable from the record.",
  1991: "Grunge and alternative rock broke nationally, landmark hip-hop albums expanded the form, and electronic scenes signaled the decade’s next movements.",
  1994: "Hip-hop’s regional golden age, Britpop, punk revival and post-grunge made the mainstream unusually plural.",
  2001: "The industry entered the post-Napster era while indie rock revival, electronic music, neo-soul and ambitious rap complicated the pop center.",
  2016: "Streaming-era albums became culturally dominant across hip-hop, R&B and pop, with surprise releases and visual albums changing how major work arrived.",
  2020: "Lockdowns halted touring and changed release strategies; home listening, livestreams and catalog exploration rose while artists documented isolation in real time."
};

let reportRunId = 0;

function musicBrainzUrl(path) { return `/api/musicbrainz?path=${encodeURIComponent(path)}`; }

const referenceJsonCache = new Map();
const referenceRequests = new Map();
const REFERENCE_CACHE_TTL = 60 * 60 * 1000;
function fetchJson(url, timeout = 60000) {
  const cached = referenceJsonCache.get(url);
  if (cached && Date.now()-cached.savedAt < REFERENCE_CACHE_TTL) return Promise.resolve(structuredClone(cached.data));
  if (referenceRequests.has(url)) return referenceRequests.get(url).then((data) => structuredClone(data));
  const request = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),timeout);
    try {
      const response = await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal});
      if (!response.ok) throw new Error(`Reference request returned ${response.status}`);
      const data = await response.json();
      referenceJsonCache.set(url,{data:structuredClone(data),savedAt:Date.now()});
      if (referenceJsonCache.size > 200) referenceJsonCache.delete(referenceJsonCache.keys().next().value);
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Reference request timed out");
      throw error;
    } finally {clearTimeout(timer);referenceRequests.delete(url);}
  })();
  referenceRequests.set(url,request);
  return request.then((data) => structuredClone(data));
}

const EDITION_DESCRIPTOR = /\b(?:\d{1,3}(?:st|nd|rd|th)\s+anniversary|anniversary|deluxe|expanded|remaster(?:ed)?|\d{4}\s+master(?:ed|ing)?|master(?:ed|ing)?|edition|mono|stereo|mfsl|sacd|bonus|box\s*set|sessions?|mix|(?:the\s+)?capitol\s+albums|(?:the\s+)?u\.?\s*s\.?\s+albums)\b/i;

function referenceAlbumTitle(value = "") {
  let title = String(value).trim();
  let previous;
  do {
    previous = title;
    title = title.replace(/\s*[\[(]([^\])]+)[\])]\s*$/, (match, detail) => EDITION_DESCRIPTOR.test(detail) || /^live(?: recording| album)?$/i.test(detail.trim()) ? "" : match).trim();
  } while (title !== previous);
  const divided = title.match(/^(.*?)(?:\s*[:–—-]\s*)([^:–—]+)$/);
  if (divided && EDITION_DESCRIPTOR.test(divided[2])) title = divided[1].trim();
  return title || String(value).trim();
}

function canonicalTitle(value = "") {
  return referenceAlbumTitle(value).normalize("NFKD").replace(/\p{M}+/gu, "").toLocaleLowerCase()
    .replace(/\([^)]*(deluxe|remaster|master|expanded|anniversary|edition|mono|stereo|mfsl|sacd|bonus)[^)]*\)/gi, " ")
    .replace(/\[[^\]]*(deluxe|remaster|master|expanded|anniversary|edition|mono|stereo|bonus)[^\]]*\]/gi, " ")
    .replace(/\b(deluxe|remastered?|master(?:ed|ing)?|expanded|anniversary|special|legacy|super deluxe)\b/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function referenceArtistName(value = "") {
  const name = String(value).trim();
  const parts = name.split(",").map((part) => part.trim());
  return parts.length === 2 && !/[&+]/.test(name) ? `${parts[1]} ${parts[0]}` : name;
}

const AMAZON_ASSOCIATE_TAG = "guyavocadomil-20";
const EBAY_CAMPAIGN_ID = "5339211373";

function commerceAlbumQuery(title, artist = "") {
  return [referenceArtistName(artist),title].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function amazonAlbumUrl(title, artist = "") {
  const params = new URLSearchParams({k:commerceAlbumQuery(title,artist),tag:AMAZON_ASSOCIATE_TAG});
  return `https://www.amazon.com/s?${params}`;
}

function ebayAlbumUrl(title, artist = "") {
  const params = new URLSearchParams({
    _nkw:commerceAlbumQuery(title,artist),
    mkcid:"1",
    mkrid:"711-53200-19255-0",
    siteid:"0",
    campid:EBAY_CAMPAIGN_ID,
    customid:"miles-album-search",
    toolid:"10001",
    mkevt:"1",
  });
  return `https://www.ebay.com/sch/i.html?${params}`;
}

function discogsAlbumUrl(title, artist = "") {
  const params = new URLSearchParams({q:[artist,title].filter(Boolean).join(" "),type:"release"});
  return `https://www.discogs.com/search/?${params}`;
}

function youtubeSongUrl(title, artist = "") {
  const params = new URLSearchParams({search_query:[referenceArtistName(artist),title].map((value) => String(value || "").trim()).filter(Boolean).join(" ")});
  return `https://www.youtube.com/results?${params}`;
}

function youtubeSongLink(title, artist = "", label = "YouTube") {
  return `<a class="youtube-song-link" href="${escapeHtml(youtubeSongUrl(title,artist))}" target="_blank" rel="noreferrer" aria-label="Search YouTube for ${escapeHtml([referenceArtistName(artist),title].filter(Boolean).join(" "))}">${escapeHtml(label)}</a>`;
}

function geniusLyricsLink(title, artist = "") {
  const query = [referenceArtistName(artist),title].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  const url = `https://genius.com/search?${new URLSearchParams({q:query})}`;
  return `<a class="youtube-song-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="Search Genius lyrics for ${escapeHtml(query)}">Genius Lyrics</a>`;
}

function guitarChordsLink(title, artist = "") {
  const query = [referenceArtistName(artist),title].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
  const url = `https://www.ultimate-guitar.com/search.php?${new URLSearchParams({search_type:"title",value:query})}`;
  return `<a class="youtube-song-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="Search Ultimate Guitar for chords to ${escapeHtml(query)}">Guitar Chords</a>`;
}

function songResourceLinks(title, artist = "") {
  return `<div class="song-resource-links" aria-label="Song resources">${youtubeSongLink(title,artist,"YouTube")}${geniusLyricsLink(title,artist)}${guitarChordsLink(title,artist)}</div>`;
}

function applePreviewTrigger(title,artist = "",album = "") {
  return `<button type="button" class="youtube-song-link apple-preview-trigger" data-apple-preview data-song-title="${escapeHtml(title)}" data-song-artist="${escapeHtml(artist)}" data-song-album="${escapeHtml(album)}" aria-expanded="false">Play Preview</button>`;
}

function trackSongActions(title,artist = "",album = "") {
  return `<div class="track-actions">${youtubeSongLink(title,artist)}${geniusLyricsLink(title,artist)}${applePreviewTrigger(title,artist,album)}</div><div class="inline-song-preview" hidden></div>`;
}

function fetchItunesSearch(parameters) {
  return new Promise((resolve,reject) => {
    const callbackName = `__milesItunes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = setTimeout(() => finish(new Error("Apple preview lookup timed out")),8000);
    const finish = (error,data) => {
      clearTimeout(timeout);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      error ? reject(error) : resolve(data);
    };
    window[callbackName] = (data) => finish(null,data);
    script.onerror = () => finish(new Error("Apple preview lookup was unavailable"));
    const params = new URLSearchParams({...parameters,callback:callbackName});
    script.src = `https://itunes.apple.com/search?${params}`;
    document.head.append(script);
  });
}

const applePreviewCache = new Map();

function applePreviewKey(title,artist,album = "") {
  return [referenceArtistName(artist),title,album].map(canonicalTitle).join("|");
}

function fetchAppleSongPreview(title,artist,album = "") {
  const key = applePreviewKey(title,artist,album);
  if (applePreviewCache.has(key)) return applePreviewCache.get(key);
  const request = (async () => {
    try {
    const data = await fetchItunesSearch({term:[referenceArtistName(artist),title].filter(Boolean).join(" "),country:"US",media:"music",entity:"song",limit:"10",explicit:"Yes"});
    const titleKey = canonicalTitle(title);
    const artistKey = canonicalTitle(referenceArtistName(artist)).replace(/^the\s+/,"");
    const albumKey = canonicalTitle(album);
    const matches = (data.results || []).filter((result) => result.kind === "song" && result.previewUrl && result.trackViewUrl && canonicalTitle(result.trackName) === titleKey).map((result) => {
      const resultArtist = canonicalTitle(result.artistName).replace(/^the\s+/,"");
      const artistMatch = resultArtist === artistKey || resultArtist.includes(artistKey) || artistKey.includes(resultArtist);
      const score = (artistMatch ? 10 : 0) + (albumKey && canonicalTitle(result.collectionName) === albumKey ? 4 : 0);
      return {result,score,artistMatch};
    }).filter((entry) => entry.artistMatch).sort((a,b) => b.score-a.score);
      return matches[0]?.result || null;
    } catch (_) { return null; }
  })();
  applePreviewCache.set(key,request);
  return request;
}

function storeApplePreview(button,preview) {
  button.dataset.appleReady = preview ? "true" : "unavailable";
  if (!preview) return;
  button.dataset.previewUrl = preview.previewUrl;
  button.dataset.trackViewUrl = preview.trackViewUrl;
  button.dataset.previewArtist = preview.artistName;
  button.dataset.previewTitle = preview.trackName;
}

function storedApplePreview(button) {
  if (button.dataset.appleReady !== "true") return null;
  return {previewUrl:button.dataset.previewUrl,trackViewUrl:button.dataset.trackViewUrl,artistName:button.dataset.previewArtist,trackName:button.dataset.previewTitle};
}

async function primeApplePreviewButtons(container) {
  const buttons = [...container.querySelectorAll("[data-apple-preview]")].slice(0,20);
  await Promise.all(buttons.map(async (button) => {
    const preview = await fetchAppleSongPreview(button.dataset.songTitle || "",button.dataset.songArtist || "",button.dataset.songAlbum || "");
    if (button.isConnected) storeApplePreview(button,preview);
  }));
}

function renderAndPlayApplePreview(panel,button,preview) {
  panel.innerHTML = applePreviewHtml(preview);
  panel.dataset.loaded = "true";
  button.disabled = false;
  button.textContent = preview ? "Hide Preview" : "Preview Unavailable";
  panel.querySelector("audio")?.play().catch(() => {});
}

function applePreviewHtml(preview) {
  if (!preview) return `<div class="song-preview unavailable"><strong>30-second preview unavailable</strong><span>Apple did not return a confident artist-and-song match.</span></div>`;
  return `<div class="song-preview"><div class="song-preview-heading"><div><strong>30-second song preview</strong><span>${escapeHtml(preview.artistName)} · ${escapeHtml(preview.trackName)}</span></div><a class="apple-music-badge" href="${escapeHtml(preview.trackViewUrl)}" target="_blank" rel="noreferrer" aria-label="Listen to ${escapeHtml(preview.trackName)} on Apple Music"><span aria-hidden="true">♪</span> Listen on Apple Music ↗</a></div><audio controls controlsList="nodownload" preload="none" src="${escapeHtml(preview.previewUrl)}">Your browser does not support the audio preview.</audio><p class="fine-print">Preview provided courtesy of iTunes. Audio streams directly from Apple and is not stored by Miles.</p></div>`;
}

function albumPurchaseLinks(title, artist = "") {
  return `<div class="affiliate-links"><div class="affiliate-marketplaces"><a href="${escapeHtml(amazonAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">Search Amazon for artist + exact edition ↗</a><a href="${escapeHtml(ebayAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">Search eBay for artist + exact edition ↗</a></div><p class="fine-print">As an Amazon Associate and eBay Partner Network Affiliate, I earn from qualifying purchases.</p></div>`;
}

function songReleaseAlbum(context = {},groups = [],artist = "") {
  if (context.album) return context.album;
  const albums = groups.filter((group) => group["primary-type"] === "Album" &&
    (!group["artist-credit"]?.length || songArtistMatches(artistCreditName(group),artist)));
  const studio = albums.filter((group) => !(group["secondary-types"] || []).some((type) => /compilation|live|remix/i.test(type)));
  return [...(studio.length ? studio : albums)].sort((a,b) =>
    String(a["first-release-date"] || "9999").localeCompare(String(b["first-release-date"] || "9999")) || String(a.title).localeCompare(String(b.title)))[0]?.title || "";
}
function songPurchaseLinks(title, artist = "",album = "") {
  artist = artist || sourcedSongContext(title,artist)?.artist || "";
  const amazon = `<a href="${escapeHtml(amazonAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">Amazon ↗</a>`;
  return `<div class="affiliate-links song-purchase-links"><div class="affiliate-marketplaces">${amazon}<a href="${escapeHtml(ebayAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">Find ${escapeHtml(referenceArtistName(artist))} · ${escapeHtml(title)} on eBay ↗</a></div><p class="fine-print">As an Amazon Associate and eBay Partner Network Affiliate, I earn from qualifying purchases.</p></div>`;
}

function compactStoreLinks(title,artist = "") {
  return `<div class="compact-store-links" aria-label="Find ${escapeHtml(title)} for sale"><a href="${escapeHtml(amazonAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">Amazon ↗</a><a href="${escapeHtml(ebayAlbumUrl(title,artist))}" target="_blank" rel="sponsored noreferrer">eBay ↗</a></div>`;
}

function isEdition(album = "") { return /(deluxe|remaster|expanded|anniversary|edition|mono|stereo|mfsl|sacd|bonus)/i.test(album); }
function decadeOf(year) { return year ? `${String(year).slice(0,3)}0s` : "Unknown"; }

function metadataFindings(matches) {
  const findings = [];
  const missingYears = matches.filter((item) => !item.year).length;
  const titleYears = new Map();
  matches.forEach((item) => {
    const key = `${sortKey(item.artist)}|${canonicalTitle(item.album)}`;
    if (!titleYears.has(key)) titleYears.set(key,new Set());
    if (item.year) titleYears.get(key).add(item.year);
  });
  const conflictKeys = new Set([...titleYears].filter(([,years]) => years.size > 1).map(([key]) => key));
  if (missingYears) findings.push({key:"missing_year",level:"warn",title:`${missingYears.toLocaleString()} missing year${missingYears === 1 ? "" : "s"}`,detail:"These records cannot appear reliably in era or chronology analysis."});
  if (conflictKeys.size) findings.push({key:"conflicting_year",level:"bad",title:`${conflictKeys.size.toLocaleString()} title${conflictKeys.size === 1 ? "" : "s"} carrying conflicting Plex years`,detail:"Copies of the same artist/title have different years. Open them to compare each Plex value with the verified original-release year."});
  return findings;
}

function holdingsSummary(matches, scope) {
  const years = matches.map((item) => Number(item.year)).filter(Boolean).sort((a,b) => a-b);
  const editions = matches.filter((item) => isEdition(item.album)).length;
  const decades = new Map();
  matches.forEach((item) => decades.set(decadeOf(item.year), (decades.get(decadeOf(item.year)) || 0) + 1));
  const decadeRows = [...decades].sort((a,b) => b[1]-a[1]);
  const topEra = decadeRows.find(([name]) => name !== "Unknown");
  const genres = genreBreakdown(matches);
  const artists = new Map();
  matches.forEach((item) => artists.set(item.artist, (artists.get(item.artist) || 0) + 1));
  const topArtists = [...artists].sort((a,b) => b[1]-a[1]).slice(0,6);
  return {years,editions,decadeRows,topEra,genres,topArtists,artistCount:artists.size,scope};
}

function collectionScore(matches, summary, scope) {
  const depth = Math.min(35, Math.round(Math.log2(matches.length + 1) / Math.log2(65) * 35));
  const spanYears = summary.years.length ? summary.years.at(-1) - summary.years[0] : 0;
  const span = scope === "Year" ? Math.min(20,Math.round(Math.log2(summary.artistCount + 1) / Math.log2(33) * 20)) : Math.min(20, Math.round(spanYears / 50 * 20));
  const yearComplete = matches.length ? matches.filter((item) => item.year).length / matches.length : 0;
  const metadata = Math.round(yearComplete * 25);
  const editions = Math.min(10, Math.round(summary.editions / 5 * 10));
  const breadth = Math.min(10, Math.round(summary.genres.length / 8 * 10));
  const total = Math.min(100, depth + span + metadata + editions + breadth);
  const label = total >= 85 ? "Exceptional" : total >= 70 ? "Deep" : total >= 50 ? "Established" : total >= 30 ? "Developing" : "Thin";
  return {total,label,depth,span,metadata,editions,breadth};
}

function genreScores(matches, summary) {
  const maxCount = summary.genres[0]?.[1] || 1;
  return summary.genres.slice(0,10).map(([genre,count]) => {
    const rows = matches.filter((item) => item.genres.includes(genre));
    const years = [...new Set(rows.map((item) => item.year).filter(Boolean))];
    const populated = rows.length ? rows.filter((item) => item.year && item.studio).length / rows.length : 0;
    const score = Math.min(100,Math.round((count/maxCount)*55 + Math.min(25,years.length/12*25) + populated*20));
    return {genre,count,score};
  }).sort((a,b) => b.score-a.score);
}

function renderScoreSection(matches,summary,scope) {
  const score = collectionScore(matches,summary,scope);
  const genres = genreScores(matches,summary);
  const genreRows = genres.map((item) => `<button type="button" class="score-row" data-drill="genre" data-value="${escapeHtml(item.genre)}"><strong>${escapeHtml(item.genre)}</strong><span class="score-track"><i style="width:${item.score}%"></i></span><b>${item.score}</b><small>${item.count} albums · open holdings</small></button>`).join("");
  const reachLabel = scope === "Year" ? "artist breadth" : "era span";
  return `<section class="score-section"><article class="score-card"><div class="score-ring" style="--score:${score.total}"><strong>${score.total}</strong><span>/100</span></div><div><p class="eyebrow">MILES SCORE</p><h3>${score.label} holdings</h3><p>Depth ${score.depth}/35 · ${reachLabel} ${score.span}/20 · year integrity ${score.metadata}/25 · editions ${score.editions}/10 · genre breadth ${score.breadth}/10.</p><p class="fine-print">A collection-strength score, not a judgment of musical taste. Reference-catalog coverage is reported separately.</p></div></article><article class="report-panel genre-score-card"><p class="eyebrow">SCORE BY GENRE</p><h3>Strength inside this result</h3><div class="genre-scores">${genreRows || "<p class='muted'>No scored genres available.</p>"}</div></article></section>`;
}

function executiveFindings(matches,summary,scope) {
  const findings = metadataFindings(matches);
  const topGenre = summary.genres[0];
  const span = summary.years.length ? summary.years.at(-1) - summary.years[0] : 0;
  const topArtist = summary.topArtists[0];
  const share = library.length ? (matches.length/library.length*100).toFixed(1) : "0";
  const rows = (scope === "Year" ? [
    `<li><button type="button" data-drill="all"><span>Library weight</span><strong>${matches.length} albums · ${share}% of the collection</strong></button></li>`,
    topGenre ? `<li><button type="button" data-drill="genre" data-value="${escapeHtml(topGenre[0])}"><span>Strongest genre signal</span><strong>${escapeHtml(topGenre[0])} · ${topGenre[1]} albums</strong></button></li>` : "",
    topArtist ? `<li><button type="button" data-report-scope="Artist" data-value="${escapeHtml(topArtist[0])}"><span>Artist breadth</span><strong>${summary.artistCount} artists · ${escapeHtml(topArtist[0])} leads with ${topArtist[1]}</strong></button></li>` : "",
    `<li><button type="button" data-drill="editions"><span>Edition collecting</span><strong>${summary.editions} explicitly identified editions</strong></button></li>`,
    findings[0] ? `<li class="attention"><button type="button" data-drill="metadata" data-value="${findings[0].key}"><span>First year-integrity priority</span><strong>${escapeHtml(findings[0].title)}</strong></button></li>` : `<li><button type="button" data-drill="all"><span>Year integrity</span><strong>No missing or locally conflicting years in this slice</strong></button></li>`
  ] : [
    summary.topEra ? `<li><button type="button" data-drill="decade" data-value="${summary.topEra[0]}"><span>Center of gravity</span><strong>${summary.topEra[0]} · ${summary.topEra[1]} albums</strong></button></li>` : "",
    topGenre ? `<li><button type="button" data-drill="genre" data-value="${escapeHtml(topGenre[0])}"><span>Strongest genre signal</span><strong>${escapeHtml(topGenre[0])} · ${topGenre[1]} albums</strong></button></li>` : "",
    `<li><button type="button" data-drill="all"><span>Chronological reach</span><strong>${summary.years.length ? `${summary.years[0]}–${summary.years.at(-1)} · ${span} years` : "Year data unavailable"}</strong></button></li>`,
    `<li><button type="button" data-drill="editions"><span>Edition collecting</span><strong>${summary.editions} explicitly identified editions</strong></button></li>`,
    findings[0] ? `<li class="attention"><button type="button" data-drill="metadata" data-value="${findings[0].key}"><span>First year-integrity priority</span><strong>${escapeHtml(findings[0].title)}</strong></button></li>` : `<li><button type="button" data-drill="all"><span>Year integrity</span><strong>No missing or locally conflicting years in this slice</strong></button></li>`
  ]).filter(Boolean).join("");
  return `<section class="executive"><div><p class="eyebrow">WHAT MILES SEES</p><h3>The five things to know first</h3></div><ol>${rows}</ol></section>`;
}

function renderEraMap(rows) {
  const usable = rows.filter(([name]) => name !== "Unknown").sort((a,b) => a[0].localeCompare(b[0]));
  const max = Math.max(1,...usable.map(([,count]) => count));
  return usable.map(([name,count]) => `<button type="button" class="era-row" data-drill="decade" data-value="${name}"><strong>${name}</strong><span class="era-bar"><i style="width:${Math.max(4,count/max*100)}%"></i></span><span>${count}</span></button>`).join("") || "<p class='muted'>No usable year metadata.</p>";
}

function renderHoldingCards(matches, summary, scope) {
  const earliest = [...matches].filter((item) => item.year).sort((a,b) => Number(a.year)-Number(b.year))[0];
  const latest = [...matches].filter((item) => item.year).sort((a,b) => Number(b.year)-Number(a.year))[0];
  const added = [...matches].filter((item) => item.dateAdded).sort((a,b) => a.dateAdded.localeCompare(b.dateAdded));
  const firstAdded = added[0], latestAdded = added.at(-1);
  const cards = [];
  if (scope === "Year") {
    const topArtist = summary.topArtists[0];
    if (topArtist) cards.push(`<button type="button" class="insight" data-report-scope="Artist" data-value="${escapeHtml(topArtist[0])}"><span>Deepest artist holding</span><strong>${escapeHtml(topArtist[0])}</strong><p>${topArtist[1]} albums from this year · open artist report.</p></button>`);
    if (firstAdded) cards.push(`<button type="button" class="insight" data-album="${escapeHtml(firstAdded.album)}" data-artist="${escapeHtml(firstAdded.artist)}"><span>First added to Plex</span><strong>${escapeHtml(firstAdded.album)}</strong><p>${escapeHtml(firstAdded.artist)} · ${escapeHtml(firstAdded.dateAdded)}</p></button>`);
    if (latestAdded) cards.push(`<button type="button" class="insight" data-album="${escapeHtml(latestAdded.album)}" data-artist="${escapeHtml(latestAdded.artist)}"><span>Latest added to Plex</span><strong>${escapeHtml(latestAdded.album)}</strong><p>${escapeHtml(latestAdded.artist)} · ${escapeHtml(latestAdded.dateAdded)}</p></button>`);
  } else {
    if (summary.topEra) cards.push(`<button type="button" class="insight" data-drill="decade" data-value="${summary.topEra[0]}"><span>Deepest era</span><strong>${summary.topEra[0]}</strong><p>${summary.topEra[1]} matched albums—open the era holdings.</p></button>`);
    if (earliest) cards.push(`<button type="button" class="insight" data-album="${escapeHtml(earliest.album)}" data-artist="${escapeHtml(earliest.artist)}"><span>Earliest holding</span><strong>${escapeHtml(earliest.album)}</strong><p>${escapeHtml(earliest.artist)} · ${earliest.year}</p></button>`);
    if (latest && latest !== earliest) cards.push(`<button type="button" class="insight" data-album="${escapeHtml(latest.album)}" data-artist="${escapeHtml(latest.artist)}"><span>Latest holding</span><strong>${escapeHtml(latest.album)}</strong><p>${escapeHtml(latest.artist)} · ${latest.year}</p></button>`);
  }
  cards.push(`<button type="button" class="insight" data-drill="editions"><span>Edition depth</span><strong>${summary.editions.toLocaleString()}</strong><p>Open deluxe, remastered, expanded, anniversary, mono/stereo, MFSL and SACD holdings.</p></button>`);
  return cards.join("");
}

function renderAlbumList(items, limit = 16) {
  return items.slice(0,limit).map((item) => `<button class="album" type="button" data-album="${escapeHtml(item.album)}" data-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(item.album)}</strong><span>${escapeHtml(item.artist)}${item.year ? ` · ${escapeHtml(item.year)}` : ""}${item.studio ? ` · ${escapeHtml(item.studio)}` : ""}</span></button>`).join("");
}

function collectionTitleKey(value) {
  return String(value).normalize("NFKD").replace(/[^a-z0-9]+/gi," ").trim().toLowerCase().replace(/^the /,"").replace(/\bu s\b/g,"us").replace(/\bvolume\b/g,"vol");
}
function collectionComponentHoldings(group,matches) {
  const key=collectionTitleKey(group.title);
  if(!/^(?:us albums|capitol albums(?: vol [12])?)$/.test(key)) return [];
  return matches.filter(item=>{
    const tags=[...item.album.matchAll(/[\[(]([^\])]+)[\])]/g)].map(match=>collectionTitleKey(match[1]));
    return tags.includes(key);
  });
}

function renderOwnedArtistChronology(reference, matches) {
  const albumGroups = reference.groups || reference.studio;
  const ownedByGroup = new Map(), byExactTitle=new Map();
  for (const item of matches) {
    const title=canonicalTitle(item.album);
    if(!byExactTitle.has(title)) byExactTitle.set(title,[]);
    byExactTitle.get(title).push(item);
    const id = bestReleaseGroupForItem(item,albumGroups)?.id;
    if (id) {
      if (!ownedByGroup.has(id)) ownedByGroup.set(id,[]);
      ownedByGroup.get(id).push(item);
    }
  }
  const mainAlbums = [...albumGroups]
    .sort((a,b) => String(a["first-release-date"] || "9999").localeCompare(String(b["first-release-date"] || "9999")) || sortKey(a.title).localeCompare(sortKey(b.title)))
    .map((group) => ({
      group,
      components: collectionComponentHoldings(group,matches),
      titleMatches: byExactTitle.get(canonicalTitle(group.title)) || [],
      releases: [...(ownedByGroup.get(group.id) || [])]
        .sort((a,b) => Number(isEdition(a.album)) - Number(isEdition(b.album)) || String(a.year || "9999").localeCompare(String(b.year || "9999")) || sortKey(a.album).localeCompare(sortKey(b.album)))
    }));

  const rows = mainAlbums.map(({group,releases,components,titleMatches},index) => {
    const owned = releases.length > 0;
    const date = String(group["first-release-date"] || releases.find((item) => item.year)?.year || "Date unknown");
    const shown=owned ? releases : components.length ? components : titleMatches;
    const releaseRows = shown.map((release) => `<button type="button" class="album artist-release-link" data-album="${escapeHtml(release.album)}" data-artist="${escapeHtml(release.artist)}"><strong>${escapeHtml(release.album)}</strong><span>${escapeHtml(release.year || "Year unknown")}${release.studio ? ` · ${escapeHtml(release.studio)}` : ""}${release.genres.length ? ` · ${escapeHtml(release.genres.join(", "))}` : ""}</span><small>Open this release’s album report →</small></button>`).join("");
    const plexSection = owned
      ? `<div class="artist-owned-releases"><h4>In your Plex library</h4><div class="artist-release-list">${releaseRows}</div></div>`
      : components.length ? `<div class="artist-owned-releases"><h4>Box-Set Albums In Your Plex Library</h4><p class="muted">These ${components.length} albums are tagged as part of ${escapeHtml(group.title)} in Plex. This confirms the listed components; it does not establish that the full box is complete.</p><div class="artist-release-list">${releaseRows}</div></div>`
      : titleMatches.length ? `<div class="artist-owned-releases"><h4>Same Album Title In Your Plex Library</h4><p class="muted">These Plex editions have the same title. They matched another reference album group, so Miles has not verified this particular edition’s identity.</p><div class="artist-release-list">${releaseRows}</div></div>`
      : `<div class="artist-owned-releases"><h4>No Match In Your Plex Snapshot</h4><p class="muted">No edition of this main release was matched in your current Plex snapshot.</p>${wishlistButton(reference.artist.name,group.title,date.slice(0,4))}${compactStoreLinks(group.title,reference.artist.name)}</div>`;
    return `<li><details class="artist-main-album ${owned ? "owned" : components.length || titleMatches.length ? "partial" : "missing"}" data-release-group-id="${escapeHtml(group.id)}" data-group-title="${escapeHtml(group.title)}" data-group-artist="${escapeHtml(reference.artist.name)}"><summary><span class="artist-album-number">${index + 1}</span><span class="artist-album-title"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(date.slice(0,10))}</small></span><b>${owned ? `${releases.length} owned` : components.length ? `${components.length} component albums` : titleMatches.length ? "Same Title In Plex" : "No Plex Match"}</b></summary>${plexSection}<div class="artist-reference-releases" data-reference-releases><p class="muted">Open this album to load documented versions from MusicBrainz.</p></div><div class="artist-edition-sources"><a href="https://musicbrainz.org/release-group/${encodeURIComponent(group.id)}" target="_blank" rel="noreferrer">All MusicBrainz releases ↗</a><a href="${escapeHtml(discogsAlbumUrl(group.title,reference.artist.name))}" target="_blank" rel="noreferrer">Browse Discogs versions ↗</a></div></details></li>`;
  }).join("");

  return `<section class="owned-artist-chronology"><div class="owned-artist-chronology-head"><div><p class="eyebrow">CHRONOLOGICAL ALBUMS</p><h3>Albums From Oldest to Newest</h3></div><strong>${mainAlbums.length} album${mainAlbums.length === 1 ? "" : "s"}</strong></div><p class="muted">Official studio, live, compilation and soundtrack album groups appear in first-release order, whether you own them or not. Editions stay together under each album; undated releases appear last.</p><ol>${rows || "<li class='muted'>No official album chronology was returned for this artist.</li>"}</ol></section>`;
}

async function loadArtistReleaseVersions(details) {
  const target = details.querySelector("[data-reference-releases]");
  if (!target || target.dataset.state === "loading" || target.dataset.state === "loaded") return;
  target.dataset.state = "loading";
  target.innerHTML = `<h4>Other documented releases</h4><p class="muted">Loading edition-level records from MusicBrainz…</p>`;
  try {
    const groupId = details.dataset.releaseGroupId;
    const data = await fetchJson(musicBrainzUrl(`/ws/2/release-group/${encodeURIComponent(groupId)}?inc=releases&fmt=json`));
    const releases = (data.releases || [])
      .filter((release) => !release.status || release.status === "Official")
      .sort((a,b) => String(a.date || "9999").localeCompare(String(b.date || "9999")) || String(a.country || "ZZ").localeCompare(String(b.country || "ZZ")) || sortKey(a.title).localeCompare(sortKey(b.title)));
    const rows = releases.slice(0,60).map((release) => {
      const description = [release.date || "Date unknown",release.country || "Country unknown",release.packaging,release.disambiguation,release.barcode ? `Barcode ${release.barcode}` : ""].filter(Boolean).join(" · ");
      const discogsQuery = [release.title || details.dataset.groupTitle,release.date,release.country,release.disambiguation,release.barcode].filter(Boolean).join(" ");
      const releaseTitle = release.title || details.dataset.groupTitle || "Untitled release";
      return `<li><button type="button" class="reference-release-copy reference-release-report" data-missing-id="${escapeHtml(groupId)}" aria-label="Open main album report for ${escapeHtml(details.dataset.groupTitle || releaseTitle)}"><strong>${escapeHtml(releaseTitle)}</strong><span>${escapeHtml(description)}</span><small>Open main release report →</small></button><div class="reference-release-actions"><a href="https://musicbrainz.org/release/${encodeURIComponent(release.id)}" target="_blank" rel="noreferrer">MusicBrainz ↗</a><a href="${escapeHtml(discogsAlbumUrl(discogsQuery,details.dataset.groupArtist || ""))}" target="_blank" rel="noreferrer">Discogs ↗</a></div></li>`;
    }).join("");
    target.dataset.state = "loaded";
    target.innerHTML = `<h4>Other documented releases</h4><p class="muted">${releases.length} official edition-level record${releases.length === 1 ? "" : "s"} found. These are reference versions beyond the named Plex entries above.</p><ul class="reference-release-list">${rows || "<li>No additional official releases were returned.</li>"}</ul>${releases.length > 60 ? `<p class="fine-print">Showing the first 60 of ${releases.length}. Use MusicBrainz or Discogs below for the complete pressing history.</p>` : ""}<p class="fine-print">Plex’s album export identifies named editions, not physical pressing IDs. Miles therefore keeps owned entries and external release records separate rather than guessing that a specific pressing is in your library.</p>`;
  } catch (error) {
    target.dataset.state = "error";
    target.innerHTML = `<h4>Other documented releases</h4><p class="muted">MusicBrainz did not return the edition list on this attempt. Use the MusicBrainz and Discogs links below to browse versions directly.</p>`;
  }
}

function showDrilldown(type, value = "") {
  const panel = els.report.querySelector("#drilldown");
  if (!panel) return;
  const titleYears = new Map();
  currentReportMatches.forEach((item) => {
    const key = `${sortKey(item.artist)}|${canonicalTitle(item.album)}`;
    if (!titleYears.has(key)) titleYears.set(key,new Set());
    if (item.year) titleYears.get(key).add(item.year);
  });
  const metadataPredicates = {
    missing_year: (item) => !item.year,
    conflicting_year: (item) => titleYears.get(`${sortKey(item.artist)}|${canonicalTitle(item.album)}`)?.size > 1
  };
  const predicates = {
    all: () => true,
    genre: (item) => item.genres.includes(value),
    artist: (item) => item.artist === value,
    editions: (item) => isEdition(item.album),
    metadata: metadataPredicates[value] || ((item) => !item.year || titleYears.get(`${sortKey(item.artist)}|${canonicalTitle(item.album)}`)?.size > 1),
    decade: (item) => decadeOf(item.year) === value
  };
  const labels = {
    all: "Holdings in this result",
    genre: `${value} holdings`,
    artist: `${value} holdings`,
    editions: "Explicitly identified editions",
    metadata: ({missing_year:"Albums missing a year",conflicting_year:"Albums carrying conflicting Plex years"}[value] || "Albums needing year verification"),
    decade: `${value} holdings`
  };
  const rows = currentReportMatches.filter(predicates[type] || predicates.all);
  panel.hidden = false;
  const artistAction = type === "artist" ? `<button type="button" class="button compact" data-report-scope="Artist" data-value="${escapeHtml(value)}">Open full artist report</button>` : "";
  panel.innerHTML = `<div class="drilldown-head"><div><p class="eyebrow">DRILLDOWN</p><h3>${escapeHtml(labels[type] || labels.all)}</h3><p class="muted">${rows.length.toLocaleString()} matching album${rows.length === 1 ? "" : "s"}. Select any title for its album report.</p>${artistAction}</div><button type="button" class="drilldown-close" data-close-drill aria-label="Close drilldown">Close</button></div><div class="album-list">${renderAlbumList(rows,60) || "<p class='muted'>No matching albums in this result.</p>"}</div>${rows.length > 60 ? `<p class="fine-print">Showing the first 60 of ${rows.length.toLocaleString()} albums.</p>` : ""}`;
  panel.scrollIntoView({behavior:"smooth",block:"start"});
}

function contextForYear(scope, query, matches) {
  if (scope !== "Year" && scope !== "Decade") return "";
  const year = Number(String(query).match(/\d{4}/)?.[0]);
  const decade = scope === "Decade" ? Number(String(query).replace(/s$/, "")) : Math.floor(year/10)*10;
  const narrative = (scope === "Year" && YEAR_CONTEXT[year]) || ERA_CONTEXT[decade] || "This period sits within overlapping changes in formats, production, scenes and listening habits; the library shape below shows which of those currents your collection captures.";
  const top = holdingsSummary(matches,scope).topArtists.map(([artist,count]) => `${escapeHtml(artist)} (${count})`).join(", ");
  return `<section class="report-panel context-panel"><p class="eyebrow">THE YEAR IN MUSIC</p><h3>${scope === "Year" ? year : `${decade}s`}: context, not trivia</h3><p>${escapeHtml(narrative)}</p><p class="muted">Your strongest represented artists here: ${top || "none identified"}.</p></section>`;
}

function titleConfidence(owned, reference) {
  const a = canonicalTitle(owned), b = canonicalTitle(reference);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const at = new Set(a.split(" ")), bt = new Set(b.split(" "));
  const overlap = [...at].filter((token) => bt.has(token)).length;
  return Math.round(overlap / Math.max(at.size,bt.size) * 100);
}

function titleMatch(owned, reference) { return titleConfidence(owned,reference) >= 72; }

function bestReleaseGroupForItem(item, groups = []) {
  return groups.map((group) => {
    const confidence = titleConfidence(item.album,group.title);
    const itemYear = Number(String(item.year || "").slice(0,4));
    const groupYear = Number(String(group["first-release-date"] || "").slice(0,4));
    const yearDistance = itemYear && groupYear ? Math.abs(itemYear-groupYear) : 50;
    return {group,confidence,yearDistance};
  }).filter((entry) => entry.confidence >= 72)
    .sort((a,b) => b.confidence-a.confidence || a.yearDistance-b.yearDistance || String(a.group["first-release-date"] || "9999").localeCompare(String(b.group["first-release-date"] || "9999")))[0]?.group || null;
}

async function fetchReferenceDiscography(query) {
  const referenceQuery = referenceArtistName(query);
  const searchPath = `/ws/2/artist/?query=${encodeURIComponent(`artist:\"${referenceQuery}\"`)}&limit=5&fmt=json`;
  const searchData = await fetchJson(musicBrainzUrl(searchPath));
  const artists = searchData.artists || [];
  if (!artists.length) throw new Error("No reference artist match was found");
  const exact = artists.find((artist) => artist.name.toLocaleLowerCase() === referenceQuery.toLocaleLowerCase()) || artists[0];
  await new Promise((resolve) => setTimeout(resolve,1100));
  const officialQuery = `arid:${exact.id} AND primarytype:album AND status:official`;
  // Equal-score search hits can change order between pages. Partition by stable
  // release-group ID ranges so every official album is returned exactly once.
  async function collect(minimum=0,maximum=0xffffffff,partitioned=false) {
    await new Promise(resolve => setTimeout(resolve,1100));
    const lower=minimum.toString(16).padStart(8,"0")+"-0000-0000-0000-000000000000";
    const upper=maximum.toString(16).padStart(8,"0")+"-ffff-ffff-ffff-ffffffffffff";
    const query=officialQuery+(partitioned ? ` AND rgid:[${lower} TO ${upper}]` : "");
    const data=await fetchJson(musicBrainzUrl(`/ws/2/release-group/?query=${encodeURIComponent(query)}&limit=100&fmt=json`));
    const page=data["release-groups"] || [];
    const total=Number(data.count ?? data["release-group-count"] ?? page.length);
    if (total>100 && maximum>minimum) {
      const middle=Math.floor((minimum+maximum)/2);
      return [...await collect(minimum,middle,true),...await collect(middle+1,maximum,true)];
    }
    if(page.length<total) throw new Error("The album catalog response was incomplete; please retry");
    return page;
  }
  const allGroups=await collect();
  const groups=[...new Map(allGroups.filter(group=>group["primary-type"]==="Album").map(group=>[group.id,group])).values()];
  const studio = groups.filter((group) => !(group["secondary-types"] || []).some((type) => /Compilation|Live|Remix|DJ-mix|Mixtape|Soundtrack|Spokenword|Interview/i.test(type)));
  return {artist:exact,groups,studio,total:groups.length,catalogVersion:3};
}

function buildFusion(reference,matches) {
  const decisions = matches.map((item) => {
    const ranked = reference.studio.map((group) => {
      const confidence = titleConfidence(item.album,group.title);
      const itemYear = Number(String(item.year || "").slice(0,4));
      const groupYear = Number(String(group["first-release-date"] || "").slice(0,4));
      return {group,confidence,yearDistance:itemYear && groupYear ? Math.abs(itemYear-groupYear) : 50};
    }).sort((a,b) => b.confidence-a.confidence || a.yearDistance-b.yearDistance);
    const best = ranked[0] || {group:null,confidence:0};
    return {album:item.album,year:item.year,ratingKey:item.ratingKey,mbid:best.group?.id || null,referenceTitle:best.group?.title || null,confidence:best.confidence,status:best.confidence >= 92 ? "fused" : best.confidence >= 72 ? "review" : "unresolved"};
  });
  return {reference,decisions,fusedAt:new Date().toISOString()};
}

function missingReleaseAssessment(group,reference,matches) {
  const year = Number(String(group["first-release-date"] || "").slice(0,4)) || 0;
  const ordered = [...reference.studio].sort((a,b) => String(a["first-release-date"] || "9999").localeCompare(String(b["first-release-date"] || "9999")));
  const position = Math.max(0,ordered.findIndex((item) => item.id === group.id));
  const ownedGroups = ordered.filter((item) => matches.some((owned) => bestReleaseGroupForItem(owned,ordered)?.id === item.id));
  const ownedYears = ownedGroups.map((item) => Number(String(item["first-release-date"] || "").slice(0,4))).filter(Boolean);
  const previous = ordered[position - 1], next = ordered[position + 1];
  const previousOwned = previous && matches.some((owned) => bestReleaseGroupForItem(owned,ordered)?.id === previous.id);
  const nextOwned = next && matches.some((owned) => bestReleaseGroupForItem(owned,ordered)?.id === next.id);
  const closesGap = year && ownedYears.length > 1 && year > Math.min(...ownedYears) && year < Math.max(...ownedYears);
  const yearDepth = year ? library.filter((item) => item.year === String(year)).length : 0;
  const foundational = position < Math.max(2,Math.ceil(ordered.length * .25));
  const breakdown = [
    {points:45,label:"official studio-album gap"},
    closesGap ? {points:20,label:"closes an internal career gap"} : null,
    previousOwned || nextOwned ? {points:15,label:"connects directly to an owned neighboring release"} : null,
    foundational ? {points:10,label:"belongs to the artist’s foundational catalog"} : null,
    yearDepth >= 20 ? {points:10,label:`fits a year where your library is already deep (${yearDepth} albums)`} : null
  ].filter(Boolean);
  const score = Math.min(99,breakdown.reduce((sum,item) => sum + item.points,0));
  let why = "It is an official studio-album chapter absent from the current Plex title match.";
  if (closesGap && (previousOwned || nextOwned)) why = "It closes a hole inside the career sequence and sits directly beside a release you already own.";
  else if (closesGap) why = "It closes a chronological hole between studio albums you already own.";
  else if (foundational) why = "It fills an early, foundational part of the artist’s official studio catalog.";
  else if (previousOwned || nextOwned) why = "It extends a run of the artist’s studio catalog that your collection already contains.";
  return {score,why,breakdown,year,position:position + 1,total:ordered.length,yearDepth};
}

function missingReleaseGenre(group,matches) {
  const referenceGenres = [...(group.genres || []),...(group.tags || [])]
    .sort((a,b) => (b.count || 0) - (a.count || 0))
    .map((entry) => entry.name).filter(Boolean);
  if (referenceGenres.length) return referenceGenres[0].replace(/\b\w/g,(letter) => letter.toUpperCase());
  const counts = new Map();
  matches.flatMap((item) => item.genres).forEach((genre) => counts.set(genre,(counts.get(genre) || 0) + 1));
  return [...counts].sort((a,b) => b[1]-a[1])[0]?.[0] || "Unclassified";
}

function renderMissingCard(context,rankLabel = "") {
  const {group,assessment,genre,artist} = context;
  return `<li class="gap-card"><button type="button" data-missing-id="${escapeHtml(group.id)}"><span class="gap-card-head"><strong>${rankLabel ? `${escapeHtml(rankLabel)} · ` : ""}${escapeHtml(group.title)}</strong><b>${assessment.score} Attainment</b></span><span class="gap-meta">${escapeHtml(genre)} · ${escapeHtml(String(group["first-release-date"]||"Date unknown").slice(0,4))} · studio album ${assessment.position} of ${assessment.total}</span><p>${escapeHtml(assessment.why)}</p><span class="open-evidence">Open full missing-album report →</span></button>${wishlistButton(artist,group.title,String(group["first-release-date"]||"").slice(0,4))}${compactStoreLinks(group.title,artist)}</li>`;
}

function curatedContributorCoverage(name = "") {
  if (entityKey(name) !== "mal evans") return null;
  return {
    heading:"Documented Beatles performances",
    introduction:"Mal Evans was the Beatles’ road manager and assistant, but his musical participation was not merely incidental. He also received documented performance credits on Beatles recordings.",
    entries:[
      {title:"Yellow Submarine",album:"Revolver",role:"bass drum and backing vocals",source:"https://en.wikipedia.org/wiki/Yellow_Submarine_(song)"},
      {title:"Maxwell’s Silver Hammer",album:"Abbey Road",role:"anvil in the Get Back sessions; released-master attribution is disputed with Ringo Starr",source:"https://en.wikipedia.org/wiki/Maxwell%27s_Silver_Hammer"}
    ]
  };
}

function contributorCoverageHtml(name = "") {
  const coverage = curatedContributorCoverage(name);
  if (!coverage) return "";
  const rows = coverage.entries.map((entry) => {
    const owned = library.find((item) => entityKey(referenceArtistName(item.artist)) === "beatles" && canonicalTitle(item.album) === canonicalTitle(entry.album));
    const albumAction = owned ? `<button type="button" data-album="${escapeHtml(owned.album)}" data-artist="${escapeHtml(owned.artist)}">${escapeHtml(entry.album)} · open album report</button>` : `<span>${escapeHtml(entry.album)}</span>`;
    return `<li><div><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.role)}</span></div>${albumAction}<a href="${escapeHtml(entry.source)}" target="_blank" rel="noreferrer">Source ↗</a></li>`;
  }).join("");
  return `<section class="report-panel contributor-coverage"><p class="eyebrow">CONTRIBUTOR CREDITS</p><h3>${escapeHtml(coverage.heading)}</h3><p>${escapeHtml(coverage.introduction)}</p><ul class="version-list">${rows}</ul><p class="fine-print">These sourced performance credits are shown separately from a primary-artist discography, so a contributor is not erased simply because the album is credited to another artist.</p></section>`;
}

function renderFusion(panel,fusion,matches,cached = false) {
    const reference = fusion.reference;
    const article = researchedArtistArticle(reference.artist.name) || (isWikipediaDisambiguation(fusion.artistArticle) ? null : fusion.artistArticle);
    const ownedGroupIds = new Set(matches.map((item) => bestReleaseGroupForItem(item,reference.studio)?.id).filter(Boolean));
    const matched = reference.studio.filter((group) => ownedGroupIds.has(group.id));
    const missing = reference.studio.filter((group) => !ownedGroupIds.has(group.id));
    const coverage = reference.studio.length ? Math.round(matched.length/reference.studio.length*100) : 0;
    const currentDecisions=buildFusion(reference,matches).decisions;
    const fused = currentDecisions.filter((decision) => decision.status === "fused");
    const review = currentDecisions.filter((decision) => decision.status === "review");
    const unresolved = currentDecisions.filter((decision) => decision.status === "unresolved");
    const missingContexts = missing.map((group) => ({group,artist:reference.artist.name,matches,reference,assessment:missingReleaseAssessment(group,reference,matches),genre:missingReleaseGenre(group,matches)}))
      .sort((a,b) => b.assessment.score-a.assessment.score || a.assessment.position-b.assessment.position || sortKey(a.group.title).localeCompare(sortKey(b.group.title)));
    missingContexts.forEach((context,index) => context.overallRank = index + 1);
    missingReleaseLookup = new Map(missingContexts.map((context) => [context.group.id,context]));
    const missingRows = missingContexts.slice(0,40).map((context) => renderMissingCard(context,`#${context.overallRank}`)).join("");
    const byGenre = new Map();
    missingContexts.forEach((context) => { if (!byGenre.has(context.genre)) byGenre.set(context.genre,[]); byGenre.get(context.genre).push(context); });
    const genreMissingRows = [...byGenre].sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0])).map(([genre,contexts]) => `<details class="missing-genre-group" ${byGenre.size === 1 ? "open" : ""}><summary><strong>${escapeHtml(genre)}</strong><span>${contexts.length} missing · top score ${contexts[0].assessment.score}</span></summary><ul class="gap-list missing-gap-list">${contexts.map((context,index) => renderMissingCard(context,`#${index+1} in ${genre}`)).join("")}</ul></details>`).join("");
    const matchedRows = matched.slice(0,30).map((group) => { const owned = matches.find((item) => bestReleaseGroupForItem(item,reference.studio)?.id === group.id); return `<li><button type="button" data-album="${escapeHtml(owned?.album || group.title)}" data-artist="${escapeHtml(owned?.artist || matches[0]?.artist || reference.artist.name)}"><strong>${escapeHtml(group.title)}</strong><span>${escapeHtml(String(group["first-release-date"]||"Date unknown").slice(0,4))} · open owned album report</span></button></li>`; }).join("");
    const reviewRows = [...review,...unresolved].slice(0,30).map((decision) => `<li><strong>${escapeHtml(decision.album)}</strong><span>${decision.confidence}% · ${decision.status}</span></li>`).join("");
    const verifiedYearIssues = matched.flatMap((group) => {
      const referenceYear = String(group["first-release-date"] || "").slice(0,4);
      if (!referenceYear) return [];
      return matches.filter((item) => bestReleaseGroupForItem(item,reference.studio)?.id === group.id && item.year && item.year !== referenceYear).map((item) => ({item,referenceYear,referenceTitle:group.title}));
    });
    const verifiedYearRows = verifiedYearIssues.slice(0,40).map(({item,referenceYear,referenceTitle}) => `<button type="button" class="year-audit-row" data-album="${escapeHtml(item.album)}" data-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(item.album)}</strong><span>Plex ${escapeHtml(item.year)} → original release ${escapeHtml(referenceYear)}</span><small>Matched to ${escapeHtml(referenceTitle)} · open album audit</small></button>`).join("");
    const artistFacts = [reference.artist.type,reference.artist.area?.name,reference.artist["life-span"]?.begin ? `Active from ${reference.artist["life-span"].begin}` : ""].filter(Boolean);
    const artistBiography = article?.extract ? `<div class="artist-reference-bio">${article.thumbnail?.source || article.original?.source ? `<img src="${escapeHtml(article.thumbnail?.source || article.original?.source)}" alt="${escapeHtml(reference.artist.name)}" loading="lazy">` : ""}<div><p class="eyebrow">ARTIST BIOGRAPHY & CONTEXT</p><h3>${escapeHtml(article.title || reference.artist.name)}</h3>${biographyParagraphs(article.extract)}${artistFacts.length ? `<p class="artist-facts">${escapeHtml(artistFacts.join(" · "))}</p>` : ""}${article.fullurl ? `<a href="${escapeHtml(article.fullurl)}" target="_blank" rel="noreferrer">Read the biography source ↗</a>` : ""}</div></div>` : `<div class="artist-reference-bio"><div><p class="eyebrow">ARTIST IDENTITY</p><h3>${escapeHtml(reference.artist.name)}</h3>${artistFacts.length ? `<p class="artist-facts">${escapeHtml(artistFacts.join(" · "))}</p>` : ""}<p class="muted">No reliable biography article was returned, so Miles is showing the verified identity and discography without inventing a narrative.</p></div></div>`;
    const biographyPanel = $("#standalone-artist-biography");
    if (biographyPanel) biographyPanel.innerHTML = artistBiography;
    const albumsPanel = $("#artist-chronological-albums");
    if (albumsPanel) albumsPanel.innerHTML = renderOwnedArtistChronology(reference,matches);
    // Keep all album groups available to unowned-album and edition drilldowns.
    for (const group of reference.groups || reference.studio) {
      if (!missingReleaseLookup.has(group.id)) missingReleaseLookup.set(group.id,{group,artist:reference.artist.name,matches,reference,genre:missingReleaseGenre(group,matches)});
    }
    panel.innerHTML = `${contributorCoverageHtml(reference.artist.name)}<div class="coverage-head"><div><p class="eyebrow">REFERENCE CATALOG</p><h3>Studio-album coverage</h3></div><strong class="coverage-score">${coverage}%</strong></div>
      <p class="muted">${matched.length} matched · ${missing.length} possible gaps · ${reference.studio.length} studio album groups evaluated. Editions are collapsed by title.</p>
      <div class="coverage-meter"><i style="width:${coverage}%"></i></div>
      <div class="fusion-summary"><div><span>Auto-fused</span><strong>${fused.length}</strong></div><div><span>Review</span><strong>${review.length}</strong></div><div><span>Unresolved</span><strong>${unresolved.length}</strong></div><button type="button" class="button secondary" data-fuse-refresh="${escapeHtml(referenceArtistName(matches[0]?.artist || reference.artist.name))}">${cached ? "Refresh fusion" : "Re-fuse"}</button></div>
      <p class="fine-print">Fusion index ${cached ? "loaded instantly from this browser" : "saved in this browser"} · ${new Date(fusion.fusedAt).toLocaleString()}.</p>
      <div class="result-tabs"><button type="button" class="result-tab active" data-result-tab="missing">Missing (${missing.length})</button><button type="button" class="result-tab" data-result-tab="matched">Matched (${matched.length})</button><button type="button" class="result-tab" data-result-tab="review">Review (${review.length + unresolved.length})</button></div>
      <div data-result-panel="missing"><p class="fine-print">Attainment Score ranks how strongly a missing title would complete the shape of your existing collection. The overall list and every genre list use importance order, not chronology.</p><section class="missing-ranking"><p class="eyebrow">OVERALL ACQUISITION RANK</p><h4>Most important gaps first</h4><ul class="gap-list missing-gap-list">${missingRows || "<li>No missing studio albums identified.</li>"}</ul></section>${missingContexts.length ? `<section class="missing-ranking"><p class="eyebrow">BY GENRE</p><h4>Priority within each musical lane</h4>${genreMissingRows}</section>` : ""}</div>
      <div data-result-panel="matched" hidden><ul class="gap-list">${matchedRows || "<li>No canonical title matches found.</li>"}</ul></div>
      <div data-result-panel="review" hidden><ul class="gap-list">${reviewRows || "<li>No ambiguous Plex titles require review.</li>"}</ul></div>

      <details class="report-panel collapsible year-audit-panel" ${verifiedYearIssues.length ? "open" : ""}><summary><span><small>YEAR INTEGRITY</small><strong>Verified original-release mismatches</strong></span><b>${verifiedYearIssues.length}</b></summary>${verifiedYearRows || `<p class="muted">No matched studio albums in this artist report carry a Plex year different from MusicBrainz’s original release year.</p>`}<p class="fine-print">A later pressing can legitimately carry a reissue date. Miles flags the difference for review rather than silently changing Plex.</p></details>
      <div class="identity"><strong>Identity used</strong><span>${escapeHtml(reference.artist.name)}${reference.artist.disambiguation ? ` — ${escapeHtml(reference.artist.disambiguation)}` : ""}</span><a href="https://musicbrainz.org/artist/${encodeURIComponent(reference.artist.id)}" target="_blank" rel="noreferrer">Open MusicBrainz identity ↗</a></div>
      <p class="fine-print">Reference status: MusicBrainz responded successfully. “Missing” means no title match in this Plex snapshot; box sets, aliases and unusual editions can create false gaps and should be reviewed.</p>`;
}

function artistSectionsHtml(query) {
  return `<section id="standalone-artist-biography" class="report-panel">${artistBiographyHtml(query,null)}</section><section id="artist-chronological-albums" class="report-panel"><p class="eyebrow">CHRONOLOGICAL ALBUMS</p><h3>Loading Official Albums…</h3><p class="muted">Finding the complete album catalog in first-release order.</p></section>`;
}

async function loadArtistCoverage(query, matches, runId, force = false) {
  MilesResearch.start(runId,"Artist",{biography:"Artist Biography",albums:"Chronological Albums & Collection Matches"});
  let bioPanel = $("#standalone-artist-biography");
  if (!bioPanel) {
    $("#reference-panel")?.insertAdjacentHTML("beforebegin",`<section id="standalone-artist-biography" class="report-panel">${artistBiographyHtml(query,null)}</section>`);
    bioPanel = $("#standalone-artist-biography");
  }
  MilesResearch.track(runId,"biography",fetchArtistWikipediaSummary(query)).then((article) => {
    if (runId === reportRunId && bioPanel && article) bioPanel.innerHTML = artistBiographyHtml(query,article);
  }).catch(() => {});
  const panel = $("#reference-panel");
  if (!panel) return;
  const fusionKey = `artist:${referenceArtistName(query).toLocaleLowerCase()}`;
  let staleFusion = null;
  try {
    staleFusion = await readFusion(fusionKey);
    if (staleFusion?.reference?.catalogVersion === 3 && !force && runId === reportRunId) {
      if (!staleFusion.artistArticle || isWikipediaDisambiguation(staleFusion.artistArticle) || (researchedArtistArticle(query) && staleFusion.artistArticle.biographyVersion !== 1)) {
        staleFusion.artistArticle = await fetchArtistArticle(staleFusion.reference);
        await writeFusion(fusionKey,staleFusion);
      }
      if (runId === reportRunId) { renderFusion(panel,staleFusion,matches,true); MilesResearch.done(runId,"albums"); }
      return;
    }
    panel.innerHTML = `<p class="eyebrow">FUSION INDEX</p><h3>Fusing Plex with official MusicBrainz releases…</h3><p class="muted">Exact matches are accepted automatically; only ambiguous titles will be left for review.</p>`;
    const reference = await MilesResearch.track(runId,"albums",fetchReferenceDiscography(query));
    if (runId !== reportRunId) return;
    const fusion = buildFusion(reference,matches);
    fusion.artistArticle = await fetchArtistArticle(reference);
    await writeFusion(fusionKey,fusion);
    if (runId !== reportRunId) return;
    renderFusion(panel,fusion,matches,false);
  } catch (error) {
    if (runId !== reportRunId || !panel) return;
    MilesResearch.unavailable(runId,"albums");
    if (staleFusion) {
      renderFusion(panel,staleFusion,matches,true);
      panel.innerHTML = `<div class="scope-note"><strong>Showing saved fusion</strong><p>MusicBrainz is temporarily unavailable, so Miles kept the last successful mapping instead of discarding it.</p></div>${panel.innerHTML}`;
      return;
    }
    const albumsPanel = $("#artist-chronological-albums");
    if (albumsPanel) albumsPanel.innerHTML = `<p class="eyebrow">CHRONOLOGICAL ALBUMS</p><h3>Album Catalog Temporarily Unavailable</h3><p class="muted">The discography service did not respond. Run this artist again to retry.</p>`;
    panel.innerHTML = `<p class="eyebrow">REFERENCE CATALOG</p><h3>Studio-album gaps unavailable</h3><p>The local intelligence report is complete, but the external discography service did not respond: ${escapeHtml(error.message)}.</p><p class="fine-print">No gap claim is being invented from the Plex CSV alone.</p>`;
  }
}

function isWikipediaDisambiguation(article) {
  return Boolean(article && (Object.prototype.hasOwnProperty.call(article.pageprops || {},"disambiguation") ||
    /\bmay refer to\s*:/i.test(article.extract || "")));
}

function researchedArtistArticle(value) {
  if (sortKey(referenceArtistName(value)) === "paul mccartney") return {
    title:"Paul McCartney",biographyVersion:1,fullurl:"https://en.wikipedia.org/wiki/Paul_McCartney",extract:[
      "Paul McCartney is an English singer, songwriter and multi-instrumentalist born in Liverpool in 1942. He became the Beatles’ bassist and, with John Lennon, formed their central songwriting partnership. His melodic bass playing, vocal range and interest in varied musical styles helped shape the group’s recordings.",
      "His Beatles work spans the intimate Yesterday, the character portraits of Eleanor Rigby and Penny Lane, and the ambitious arrangements of Sgt. Pepper’s Lonely Hearts Club Band. He moved between rock, ballads and orchestral pop, often playing piano and guitar as well as bass.",
      "After the Beatles, he released McCartney in 1970 and formed Wings with Linda McCartney and Denny Laine in 1971. Band on the Run, Venus and Mars and Wings over America established a substantial second chapter, followed by a continuing solo career, collaborations and work in classical and electronic music."
    ].join("\n\n")
  };
  if (sortKey(referenceArtistName(value)) !== "uriah heep") return null;
  return {title:"Uriah Heep",biographyVersion:1,fullurl:"https://en.wikipedia.org/wiki/Uriah_Heep_(band)",extract:[
    "Uriah Heep are an English rock band formed in London in 1969. They helped shape the meeting point of hard rock and progressive rock, combining Mick Box’s guitar with prominent keyboards, ambitious arrangements and layered vocal harmonies.",
    "Their early sound took shape around singer David Byron and keyboardist and songwriter Ken Hensley. The 1970 debut, …Very ’Eavy …Very ’Umble, introduced their heavy organ-and-guitar approach; Salisbury and Look at Yourself followed in 1971, showing the range between expansive progressive pieces and direct hard rock.",
    "The classic lineup of Byron, Box, Hensley, bassist Gary Thain and drummer Lee Kerslake made Demons and Wizards and The Magician’s Birthday in 1972. Songs such as The Wizard, Easy Livin’ and July Morning remain central to understanding the band: melodic and theatrical, with room for both compact hooks and extended performances.",
    "Numerous lineup changes followed, but Box remained the band’s original-member anchor. Keyboardist Phil Lanzon joined in 1986 and vocalist Bernie Shaw in 1987, establishing a long-running later era. The band’s history extends well beyond its early-seventies landmarks through continued recording and international touring."
  ].join("\n\n")};
}

async function fetchArtistArticle(reference) {
  if (!reference?.artist?.name) return null;
  return fetchArtistWikipediaSummary(reference.artist.name);
}

async function fetchWikipediaSummary(term) {
  const params = new URLSearchParams({action:"query",generator:"search",gsrsearch:term,gsrlimit:"1",prop:"extracts|info|pageimages|pageprops",exintro:"1",exlimit:"max",explaintext:"1",inprop:"url",piprop:"thumbnail|original",pithumbsize:"900",format:"json",origin:"*"});
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`,10000);
  return Object.values(data.query?.pages || {})[0] || null;
}

async function fetchWikipediaTitleSummary(title) {
  const params = new URLSearchParams({action:"query",titles:title,redirects:"1",prop:"extracts|info|pageimages|pageprops",exintro:"1",exlimit:"max",explaintext:"1",inprop:"url",piprop:"thumbnail|original",pithumbsize:"900",format:"json",origin:"*"});
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`,10000);
  return Object.values(data.query?.pages || {})[0] || null;
}

function matchesSongArticle(article,title,artist = "") {
  if (!article?.extract || isWikipediaDisambiguation(article)) return false;
  const articleTitle = String(article.title || "").replace(/\s*\([^)]*\bsong\)\s*$/i,"");
  if (canonicalTitle(articleTitle) !== canonicalTitle(title) || !/\b(song|composition|instrumental)\b/i.test(article.extract)) return false;
  const intro = ` ${songArtistKey(article.extract)} `;
  const performer = songArtistKey(artist);
  return !performer || intro.includes(` ${performer} `);
}
function songStoryDetailsHtml(article) {
  if (!article?.storySections?.length) return "";
  return `<div class="song-history-details">${article.storySections.map((section) => `<h4>${escapeHtml(section.title)}</h4>${biographyParagraphs(section.text)}`).join("")}<p class="fine-print">Selected excerpts from <a href="${escapeHtml(article.fullurl)}" target="_blank" rel="noreferrer">Wikipedia</a> (CC BY-SA); see the article for citations and revision history.</p></div>`;
}

function songReferenceDate(article,fallback) {
  return article?.originalReleaseYear || fallback;
}

function enrichSongStory(article,fullExtract) {
  const sections = [];
  let heading = "", rootHeading = "", paragraphs = [];
  const relevant = /background|inspiration|writ(?:ing|ten)|composition|music|lyrics|recording|production|session|mix(?:es|ing)|arrangement|release|personnel|credit|promotional|video|development/i;
  const excluded = /references|notes|bibliography|external links|see also|charts|certifications|cover versions|other versions/i;
  const save = () => {
    if (!paragraphs.length || excluded.test(rootHeading) || excluded.test(heading) ||
        !(relevant.test(rootHeading) || relevant.test(heading))) return;
    const text = paragraphs.filter((line) => !/^Main article:|^See also:/i.test(line)).join("\n\n");
    if (text) sections.push({title:heading,text});
  };
  for (const line of String(fullExtract || "").split("\n")) {
    const match = line.match(/^(={2,})\s*(.*?)\s*\1$/);
    if (match) {
      save();
      heading = match[2];
      if (match[1].length === 2) rootHeading = heading;
      paragraphs = [];
    } else if (line.trim()) paragraphs.push(line.trim());
  }
  save();
  const releaseSentence = String(article.extract).split(/(?<=[.!?])\s+/).find((line) => /\b(?:was|is|originally) released\b/i.test(line));
  const released = releaseSentence?.match(/\breleased\b[^.!?]*?\b((?:18|19|20)\d{2})\b/i)?.[1];
  return {...article,fullExtract,originalReleaseYear:article.originalReleaseYear || released || "",storySections:sections};
}

function fetchSongStory(title,artist = "") {
  const key = `${canonicalTitle(title)}|${songArtistKey(artist)}`;
  if (!songStoryCache.has(key)) songStoryCache.set(key,(async () => {
    const curated = sourcedSongContext(title,artist);
    let article = await fetchWikipediaTitleSummary(title).catch(() => null);
    if (!matchesSongArticle(article,title,artist)) article = await fetchWikipediaSummary(`intitle:"${title}" song ${artist ? `"${referenceArtistName(artist)}"` : ""}`).catch(() => null);
    if (!matchesSongArticle(article,title,artist)) return curated;
    const fullExtract = await fetchWikipediaArticleText(article.pageid);
    return enrichSongStory({...article,originalReleaseYear:curated?.originalReleaseYear || ""},fullExtract);
  })());
  return songStoryCache.get(key);
}

const SONG_THEORY_TOPICS = [
  {label:"Form & structure", pattern:/\b(verse[– -]chorus|verse|chorus|refrain|bridge|coda|outro|intro|ternary|strophic|twelve.bar|12.bar|AABA)\b/i},
  {label:"Harmony & melody", pattern:/\b(key of|major key|minor key|chord|chords|chord progression|harmonic|harmony|modulation|modal|pentatonic|mixolydian|dorian|melody|melodic)\b/i},
  {label:"Rhythm & meter", pattern:/\b(time signature|meter|metre|tempo|beats per minute|bpm|syncopat\w*|polyrhythm\w*|compound time|common time|\d+\/\d+)\b/i},
  {label:"Arrangement & texture", pattern:/\b(arpeggio\w*|riff|riffs|ostinato|counterpoint|drone|orchestrat\w*|arrangement|acoustic guitar|synthesizer|synthesiser|vocal harmon\w*|string section)\b/i}
];

function songTheoryHtml(theory = null, loading = false) {
  const rows = SONG_THEORY_TOPICS.map((topic,index) => `<div><h4>${topic.label}</h4>${theory?.points?.[index] ? `<p>${escapeHtml(theory.points[index])}</p>${theory.pointSources?.[index] ? `<a class="fine-print" href="${escapeHtml(theory.pointSources[index])}" target="_blank" rel="noreferrer">Section source ↗</a>` : ""}` : `<p class="muted">${loading ? "Finding documented musical details…" : "No sourced detail available yet."}</p>`}</div>`).join("");
  return `<section class="report-panel song-theory-panel"><p class="eyebrow">HOW THE MUSIC WORKS</p><h3>Music theory &amp; structure</h3>${rows}${theory?.sourceUrl ? `<p class="fine-print">${escapeHtml(theory.note)} <a href="${escapeHtml(theory.sourceUrl)}" target="_blank" rel="noreferrer">Read the analysis source ↗</a></p>` : (!loading ? `<p class="fine-print">A song-specific musical analysis has not been verified for this recording.</p>` : "")}</section>`;
}

function songTheoryFromArticle(article,title,artist) {
  const expectedTitle = canonicalTitle(title);
  const actualTitle = canonicalTitle(String(article?.title || "").replace(/\s*\([^)]*\bsong\)\s*$/i,""));
  const intro = songArtistKey(article?.extract || "");
  const expectedArtist = songArtistKey(artist);
  // Same-title songs and another artist's covers must not inherit this analysis.
  if (!article?.pageid || isWikipediaDisambiguation(article) || actualTitle !== expectedTitle ||
      !expectedArtist || !intro.includes(expectedArtist)) return null;
  const text = String(article.fullExtract || "").split(/\n==\s*(?:Personnel|Charts|Chart performance|Release history|Cover versions|Other versions|References|External links)\s*==/i)[0];
  const sentences = text.split(/\n+/).filter((line) => !/^\s*=/.test(line)).flatMap((line) => {
    try { return [...new Intl.Segmenter("en",{granularity:"sentence"}).segment(line)].map((entry) => entry.segment.trim()); }
    catch (_) { return line.match(/[^.!?]+(?:[.!?]+|$)/g) || []; }
  });
  const used = new Set();
  const points = SONG_THEORY_TOPICS.map((topic) => {
    const sentence = sentences.find((candidate) => topic.pattern.test(candidate) && !used.has(candidate) &&
      candidate.length >= 35 && candidate.split(/\s+/).length <= 45 &&
      !/\b(cover version|covered by|performed by|recorded by another|chart|critic|review|ranked|album review)\b/i.test(candidate));
    if (sentence) used.add(sentence);
    return sentence || "";
  });
  return points.some(Boolean) ? {points,sourceUrl:article.fullurl || `https://en.wikipedia.org/?curid=${article.pageid}`,
    note:"Brief source excerpts from the matched song article. Keys, tempos and arrangements can differ between recordings."} : null;
}

function fetchSongTheory(title,artist) {
  const key = `${canonicalTitle(title)}|${songArtistKey(artist)}`;
  if (!songTheoryCache.has(key)) songTheoryCache.set(key,(async () => {
    if (canonicalTitle(title) === "strawberry fields forever" && songArtistKey(artist) === "beatles") {
      const analysis="https://www.recmusicbeatles.com/public/files/awp/sff.html";
      const recording="https://www.columbia.edu/~brennan/beatles/strawberry-fields.html";
      const score="https://www.producingthebeatles.com/new-episodes/2020/4/12/011-nothing-is-real-strawberry-fields-forever-take-26";
      const composition="https://en.wikipedia.org/wiki/Strawberry_Fields_Forever#Composition";
      return {points:[
        "The Mellotron introduction leads straight into the refrain, then three verses alternate with returns of that refrain. There is no conventional bridge or instrumental solo. Each verse brings new words, while the refrain supplies the familiar destination. The final refrain extends into an outro that fades away, returns and fades again: an apparent ending becomes another part of the form.",
        "The released master sits around B-flat, with tape-speed changes placing its tuning outside an ordinary concert-pitch reference. The harmony repeatedly postpones a decisive arrival: dominant-to-minor movement and diminished chords unsettle the route home, while IV–I endings offer gentler closure than a firm V–I. The tune mixes recognizable shapes with chromatic notes, so its apparent simplicity carries harmonic uncertainty.",
        "A mostly 4/4 framework contains shortened bars and passages Pollack counts in 6/8. The refrain’s vocal pickup can disguise the downbeat, while the verses have a more regular eight-bar shape. This makes the invitation seem to stretch and hesitate, then recover its footing. Count the refrain and verse separately rather than forcing the entire recording into equal four-beat blocks.",
        "The recording changes its instrumental world about a minute in, at the join between takes 7 and 26. Mellotron, guitar and drums give way to a heavier backing with George Martin’s score for four trumpets and three cellos. Listen to their weight and attacks against the percussion. The Indian swarmandal supplies the descending, harp-like flourishes; reversed sounds and the returning coda make the studio itself part of the arrangement."
      ],pointSources:[analysis,analysis,analysis,score],sourceUrl:analysis,
      note:"Song-specific synthesis of Pollack’s musical analysis, Brennan’s recording study and Kruppa’s orchestration reconstruction. Describes the assembled studio recording; other takes and mixes differ.",
      listeningPrompts:[
        {title:"The Opening: A Keyboard Masquerading As Flutes",text:"At the start, follow McCartney’s flute-like Mellotron figure before the voice enters. This is a keyboard using recorded sounds. Notice how its repeating shape establishes the dreamlike setting before the first refrain, rather than simply decorating a verse.",sourceUrl:composition},
        {title:"Around 1:00: The Recording Changes Under You",text:"Compare the first minute with the passage just after it. The master crosses from take 7 into take 26; the vocal color and backing change together. Follow the shift in instrumental density rather than searching only for a click at the splice.",sourceUrl:recording},
        {title:"After The Join: Hear The Seven-Piece Orchestra",text:"Pick out the brass attacks and the low string sound in the later backing. Martin’s dramatic weight comes from four trumpets and three cellos. Kruppa’s reconstruction isolates that score, making it a useful comparison with the finished record’s layered percussion and voice.",sourceUrl:score},
        {title:"Before The Later Verses: The Swarmandal",text:"Listen for the quick descending, harp-like runs leading into the second and third verses. They come from a swarmandal. Their brief entrances mark changes of section, offering a bright contrast to the sustained brass and cello texture.",sourceUrl:composition},
        {title:"The Ending That Comes Back",text:"Keep listening after the apparent fade. The return brings scattered percussion, strange keyboard color and murmured vocal sound into the foreground. With the regular song receding, this coda feels like a glimpse behind the finished performance. Exact timing and stereo placement vary by mix.",sourceUrl:composition}
      ]};
    }
    if (canonicalTitle(title) === "here comes the sun" && songArtistKey(artist) === "beatles") {
      return {points:[
        "An acoustic introduction leads to the refrain, followed by alternating verses and refrains. A contrasting bridge breaks that pattern; the final verse, repeated refrain and outro bring back familiar material.",
        "Much of the melody uses a five-note pentatonic collection. The harmony often revolves around the home chord, the fourth and the fifth (I, IV and V); changes beneath recurring melodic phrases keep them varied.",
        "The main pulse is 4/4, but the bridge cycles through 11/8, 4/4 and 7/8. Those uneven groups make the phrase feel as though it stretches and contracts before settling back into the main pulse.",
        "Acoustic guitar establishes the texture, with synthesizer, bass and drums entering in stages. The synth suggests orchestral colors, while the ending returns toward the sparse opening sound."
      ],sourceUrl:"https://www.recmusicbeatles.com/public/files/awp/hcts.html",note:"Summary of Alan W. Pollack’s analysis of the Beatles recording."};
    }
    let article = await fetchSongStory(title,artist).catch(() => null);
    if (article && !article.pageid) {
      const sourceArticle = await fetchWikipediaTitleSummary(title).catch(() => null);
      if (matchesSongArticle(sourceArticle,title,artist)) article = sourceArticle;
    }
    if (!article?.pageid) return null;
    const fullExtract = article.fullExtract || await fetchWikipediaArticleText(article.pageid);
    return songTheoryFromArticle({...article,fullExtract},title,artist);
  })().catch(() => null));
  if (songTheoryCache.size > 100) songTheoryCache.delete(songTheoryCache.keys().next().value);
  return songTheoryCache.get(key);
}

function sourcedSongContext(title,artist) {
  if (canonicalTitle(title) === "penny lane" && (!artist || songArtistKey(artist) === "beatles")) return {
    title:"Penny Lane",artist:"The Beatles",originalReleaseYear:"1967",fullurl:"https://en.wikipedia.org/wiki/Penny_Lane",extract:[
      "Penny Lane draws on Paul McCartney’s memories of Liverpool, turning familiar street scenes into a vivid musical portrait. Credited to Lennon–McCartney, it was released with Strawberry Fields Forever as a double A-side in February 1967.",
      "The Beatles recorded it at EMI Studios in London from December 29, 1966 to January 17, 1967, with George Martin producing. David Mason’s piccolo trumpet solo became one of its defining sounds. The arrangement and changing keys give the everyday scenes an unusually bright, shifting atmosphere.",
      "It began during the sessions for Sgt. Pepper, but was issued as a single and omitted from the original album. Magical Mystery Tour included it on the US album in November 1967."
    ].join("\n\n")
  };
  if (canonicalTitle(title) === "baron saturday" && songArtistKey(artist) === "pretty things") {
    return {
      title:"Baron Saturday · S.F. Sorrow",
      extract:"The Pretty Things recorded “Baron Saturday” for their 1968 narrative album S.F. Sorrow. In an interview about the album, singer Phil May described Baron Saturday as a character created to fill a gap in the developing story: the music and the story shaped each other during recording. The song sits between “Death” and “The Journey” on the album, so its meaning belongs to the larger sequence rather than to a standalone single.",
      fullurl:"https://www.loudersound.com/features/pretty-things-s-f-sorrow"
    };
  }
  return null;
}

function biographyParagraphs(value = "") {
  const blocks = String(value).trim().split(/\n\s*\n/).filter(Boolean);
  if (blocks.length > 1) return `<div class="biography-copy">${blocks.map((block) => `<p>${escapeHtml(block.replace(/\s+/g," ").trim())}</p>`).join("")}</div>`;
  const text = String(value).replace(/\s+/g," ").trim();
  if (!text) return "";
  let sentences;
  try {
    sentences = [...new Intl.Segmenter("en",{granularity:"sentence"}).segment(text)].map((entry) => entry.segment.trim()).filter(Boolean);
  } catch (_) {
    sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [text];
  }
  const paragraphs = [];
  let paragraph = "";
  let sentenceCount = 0;
  sentences.forEach((sentence) => {
    if (paragraph && (sentenceCount >= 3 || paragraph.length + sentence.length > 460)) {
      paragraphs.push(paragraph);
      paragraph = "";
      sentenceCount = 0;
    }
    paragraph += `${paragraph ? " " : ""}${sentence}`;
    sentenceCount += 1;
  });
  if (paragraph) paragraphs.push(paragraph);
  return `<div class="biography-copy">${paragraphs.map((entry) => `<p>${escapeHtml(entry)}</p>`).join("")}</div>`;
}

function artistBiographyHtml(artist,article) {
  article = researchedArtistArticle(artist) || (isWikipediaDisambiguation(article) ? null : article);
  return `<p class="eyebrow">ARTIST BIOGRAPHY</p><h3>${escapeHtml(referenceArtistName(artist))}</h3>${article?.extract ? `${biographyParagraphs(article.extract)}<a href="${escapeHtml(article.fullurl)}" target="_blank" rel="noreferrer">Read artist source ↗</a>` : `<p class="muted">A sourced artist biography is unavailable right now.</p>`}`;
}

async function fetchReleaseGroupCover(groupId) {
  if (!groupId) return null;
  try {
    const response = await fetch(`https://coverartarchive.org/release-group/${encodeURIComponent(groupId)}`,{headers:{Accept:"application/json"}});
    if (!response.ok) return null;
    const data = await response.json();
    const art = (data.images || []).find((image) => image.front) || (data.images || [])[0];
    return art ? art.thumbnails?.large || art.thumbnails?.small || art.image || null : null;
  } catch (_) { return null; }
}

function albumArtwork(url,title) {
  return url ? `<figure class="album-cover"><img src="${escapeHtml(url)}" alt="Cover art for ${escapeHtml(title)}" loading="lazy"><figcaption>Reference cover art</figcaption></figure>` : "";
}

function earliestCountryRelease(group, country) {
  return (group?.releases || []).filter((release) => release.country === country && release.date && (!release.status || release.status === "Official"))
    .sort((a,b) => String(a.date).localeCompare(String(b.date)))[0]?.date || "";
}

function displayReleaseDate(value) {
  const parts = String(value || "").split("-");
  if (parts.length === 3) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date);
  }
  if (parts.length === 2) {
    const date = new Date(`${value}-01T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en",{month:"long",year:"numeric",timeZone:"UTC"}).format(date);
  }
  return value || "Not documented";
}

function regionalReleaseDates(group) {
  const uk = earliestCountryRelease(group,"GB");
  const us = earliestCountryRelease(group,"US");
  return `<div class="release-date-grid"><div><span>UK release</span><strong>${escapeHtml(displayReleaseDate(uk))}</strong></div><div><span>US release</span><strong>${escapeHtml(displayReleaseDate(us))}</strong></div></div>`;
}

function sentenceList(value = "") {
  const lines = String(value).split(/\n+/).map((line) => line.replace(/^\s*[*#;:]+\s*/,"").replace(/\s+/g," ").trim()).filter(Boolean);
  return lines.flatMap((line) => {
    try { return [...new Intl.Segmenter("en",{granularity:"sentence"}).segment(line)].map((entry) => entry.segment.trim()); }
    catch (_) { return line.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()) || [line]; }
  }).filter(Boolean);
}

function normalizedFact(value = "") {
  return String(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function wikipediaTrivia(article) {
  if (!article?.fullExtract || !isAlbumArticle(article)) return [];
  const intro = new Set(sentenceList(article.extract).map(normalizedFact));
  const weights = [
    [/inspired by|based on|adapted from|borrowed from|sampled|interpolat/i,12],
    [/banned|censor|controvers|confiscat|prohibit/i,11],
    [/cover (?:art|artwork|image|picture)|album cover|sleeve|photograph/i,10],
    [/first album|first time|debut|pioneer|landmark/i,9],
    [/title (?:came|comes|was taken|refers)|named after|dedicat/i,9],
    [/recorded (?:at|in|during|with)|recording took|recorded and mixed/i,7],
    [/featur(?:e|ed|ing)|guest appearance|uncredited/i,6],
    [/moog|mellotron|theremin|sitar|tabla|harpsichord|celesta|ondes martenot|orchestra|choir/i,6],
    [/grammy|award|number one|chart|platinum|gold certification/i,4],
    [/remix|remaster|re-?issue|expanded edition/i,3]
  ];
  return sentenceList(article.fullExtract).map((text,index) => {
    const score = weights.reduce((total,[pattern,weight]) => total + (pattern.test(text) ? weight : 0),0);
    return {text,index,score};
  }).filter(({text,score}) => {
    const key = normalizedFact(text);
    return score >= 6 && text.length >= 55 && text.length <= 360 && !intro.has(key) &&
      !/^(track listing|personnel|credits|charts|references|external links|release history)$/i.test(text) &&
      !/catalog(?:ue)? number|musicbrainz|release group|chart positions|weekly charts|year-end charts/i.test(text) &&
      !/^\d+\.?\s*[“\"]/.test(text);
  }).sort((a,b) => b.score-a.score || a.index-b.index)
    .filter((entry,index,array) => array.findIndex((other) => normalizedFact(other.text) === normalizedFact(entry.text)) === index)
    .slice(0,3).map(({text}) => text);
}

function albumFacts(article,tracks,personnel) {
  const facts = wikipediaTrivia(article);
  const known = new Set(facts.map(normalizedFact));
  personnel.filter((person) => /moog|anvil|mellotron|theremin|sitar|tabla|harpsichord|celesta|ondes|vibraphone|marimba/i.test(person.role)).slice(0,3)
    .forEach((person) => {
      const fact = `${person.name} is credited with ${person.role}.`;
      if (!known.has(normalizedFact(fact))) facts.push(fact);
    });
  const longest = tracks.filter((track) => track.length >= 1200000).sort((a,b) => b.length-a.length)[0];
  if (longest && facts.length < 3) facts.push(`“${longest.title}” runs ${formatDuration(longest.length)}, making it an album-side-scale performance.`);
  return facts.slice(0,3);
}

function isWhiteAlbum(item) {
  return songArtistKey(item?.artist || "") === "beatles" &&
    /^(?:the beatles|white album|the white album)$/.test(canonicalTitle(item?.album || ""));
}

function albumFactsHtml(article,tracks,personnel,item) {
  const official = "https://www.thebeatles.com/beatles-celebrate-beatles-white-album-special-anniversary-releases";
  const recording = "https://www.thebeatles.com/beatles-white-album-anniversary-editions-recording";
  const facts = isWhiteAlbum(item) ? [
    {text:"In May 1968, the Beatles made 27 acoustic demos at George Harrison’s home in Esher; 19 of those songs reached the finished White Album.",url:recording},
    {text:"Richard Hamilton designed the minimalist white sleeve. Early copies had an embossed band name and an individual serial number.",url:official},
    {text:"“Don’t Pass Me By” gave Ringo Starr his first solo songwriting credit on a Beatles album.",url:official}
  ] : albumFacts(item && matchesAlbumArticle(article,item) ? article : null,tracks,personnel)
    .map(text => ({text,url:article?.fullurl || ""}));
  return facts.length ? `<section class="album-trivia"><h4>DETAILS YOU MIGHT HAVE MISSED</h4><ul>${facts.map(fact => `<li>${escapeHtml(fact.text)}${fact.url ? ` <a href="${escapeHtml(fact.url)}" target="_blank" rel="noreferrer">Source ↗</a>` : ""}</li>`).join("")}</ul><p class="fine-print">Album-specific facts from the linked sources and verified performance credits.</p></section>` : "";
}

// Match the subject of the introduction, not incidental mentions later in a biography.
function isAlbumArticle(article) {
  const lead = String(article?.extract || "").split(/\n/)[0];
  const subject = lead.match(/\b(?:is|was)\s+((?:(?![.!?]\s).){0,180}?)\b(?:album|soundtrack|EP|extended play)\b/i);
  return Boolean(subject && !/\b(?:band|singer|songwriter|musician|rock group)\b/i.test(subject[1]));
}

function matchesAlbumArticle(article, item) {
  if (!article?.extract || isWikipediaDisambiguation(article) || !isAlbumArticle(article)) return false;
  const title = canonicalTitle(referenceAlbumTitle(item.album));
  const artist = referenceArtistName(item.artist);
  const articleTitle = canonicalTitle(String(article.title || "").replace(/\s*\([^)]*\balbum\)\s*$/i,""));
  const whiteAlbum = /^(?:the beatles|white album|the white album)$/.test(title) && canonicalTitle(artist) === "the beatles";
  if (articleTitle !== title && !(whiteAlbum && /^(?:the beatles|white album|the white album)$/.test(articleTitle))) return false;
  return new RegExp(artist.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"i").test(article.extract);
}

async function fetchAlbumWikipediaSummary(item) {
  const title = referenceAlbumTitle(item.album);
  const artist = referenceArtistName(item.artist);
  const whiteAlbum = canonicalTitle(artist) === "the beatles" && /^(?:the beatles|white album|the white album)$/.test(canonicalTitle(title));
  // Resolve album disambiguations before the bare title, especially for eponymous releases.
  const directTitles = [...new Set([...(whiteAlbum ? ["The Beatles (album)"] : []), `${title} (${artist} album)`, `${title} (album)`, title])];
  for (const candidate of directTitles) {
    try {
      const article = await fetchWikipediaTitleSummary(candidate);
      if (matchesAlbumArticle(article,item)) {
        article.fullExtract = await fetchWikipediaArticleText(article.pageid);
        return article;
      }
    } catch (_) {}
  }
  for (const query of [`intitle:"${title}" album "${artist}"`, `"${title}" "${artist}" album`]) {
    try {
      const article = await fetchWikipediaSummary(query);
      if (matchesAlbumArticle(article,item)) {
        article.fullExtract = await fetchWikipediaArticleText(article.pageid);
        return article;
      }
    } catch (_) {}
  }
  return sourcedAlbumFallback(item)?.article || null;
}

async function fetchWikipediaArticleText(pageId) {
  if (!pageId) return "";
  try {
    const params = new URLSearchParams({action:"query",pageids:String(pageId),prop:"extracts",explaintext:"1",format:"json",origin:"*"});
    const data = await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`,10000);
    return data.query?.pages?.[pageId]?.extract || "";
  } catch (_) { return ""; }
}

async function fetchArtistWikipediaSummary(value) {
  const artist = referenceArtistName(value);
  const researched = researchedArtistArticle(artist);
  if (researched) return researched;
  const matches = (article) => article?.extract && !isWikipediaDisambiguation(article) &&
    !isAlbumArticle(article) &&
    sortKey(String(article.title || "").replace(/\s*\((?:musician|band|singer|rapper|drummer|guitarist|musical group|rock band|record producer|audio engineer|conductor)\)$/i,"")) === sortKey(artist) &&
    /\b(musician|music|singer|songwriter|band|rock|pop|hip.hop|rapper|drummer|guitarist|recording artist|vocalist|composer|producer|engineer|conductor|road manager)\b/i.test(article.extract.slice(0,500));
  for (const title of [artist,`${artist} (musician)`,`${artist} (band)`,`${artist} (record producer)`,`${artist} (audio engineer)`]) {
    const article = await fetchWikipediaTitleSummary(title).catch(() => null);
    if (matches(article)) return article;
  }
  const queries = [`intitle:"${artist}"`, `"${artist}" musician OR band`];
  for (const query of queries) {
    try {
      const article = await fetchWikipediaSummary(query);
      if (matches(article)) return article;
    } catch (_) {}
  }
  return null;
}

function artistCreditName(entity) {
  return (entity["artist-credit"] || []).map((credit) => credit.name || credit.artist?.name).filter(Boolean).join("") || "Unknown artist";
}

function songArtistKey(value = "") {
  return canonicalTitle(referenceArtistName(value)).replace(/^the\s+/,"");
}

function recordingYear(recording) {
  return Number(String(recording?.["first-release-date"] || "").slice(0,4)) || 9999;
}

function songArtistMatches(left,right) {
  const a = songArtistKey(left), b = songArtistKey(right);
  return Boolean(a && b && (a === b || (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a)))));
}

function songTitleMatches(left,right) {
  const a = canonicalTitle(left), b = canonicalTitle(right);
  if (a === b) return true;
  if (Math.abs(a.length-b.length) > 1 || Math.min(a.length,b.length) < 5) return false;
  const longer = a.length >= b.length ? a : b, shorter = a.length >= b.length ? b : a;
  let i = 0, j = 0, edits = 0;
  while (i < longer.length && j < shorter.length) {
    if (longer[i] === shorter[j]) { i += 1; j += 1; continue; }
    if (++edits > 1) return false;
    if (longer.length === shorter.length) { i += 1; j += 1; } else i += 1;
  }
  return edits + (i < longer.length ? 1 : 0) <= 1;
}

function plexTrackEvidence(query) {
  return (SONG_PLEX_TRACK_EVIDENCE[canonicalTitle(query)] || []).map((entry) => ({
    ...entry,
    item:library.find((item) => canonicalTitle(item.album) === canonicalTitle(entry.album) && songArtistMatches(item.artist,entry.artist))
  })).filter((entry) => entry.item);
}

function plexTrackEvidenceHtml(query) {
  const tracks = plexTrackEvidence(query);
  if (!tracks.length) return "";
  const artists = [...new Set(tracks.map((entry) => entry.artist))];
  const breakdown = artists.map((artist) => `${tracks.filter((entry) => entry.artist === artist).length} ${artist}`).join(" · ");
  return `<section class="report-panel plex-track-evidence"><p class="eyebrow">IN YOUR PLEX</p><h3>${tracks.length} confirmed track${tracks.length === 1 ? "" : "s"} on ${tracks.length} albums</h3><p class="muted">${escapeHtml(breakdown)} · observed in your Plex track list</p><div class="album-list">${tracks.map(({item,track}) => `<button type="button" class="album song-instance" data-album="${escapeHtml(item.album)}" data-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(item.album)}</strong><span>${escapeHtml(item.artist)} · ${escapeHtml(track)}</span><small>Open your album report</small></button>`).join("")}</div><p class="fine-print">Track evidence from your Plex screenshot; album names are matched to your loaded catalog. Recording mixes are not identified by that screenshot.</p></section>`;
}

function songOwnedAlbumsHtml(query,owned = [],artist = "") {
  const rows = new Map();
  plexTrackEvidence(query).forEach(({item,track}) => rows.set(item.ratingKey || `${item.artist}|${item.album}|${item.year}`,{item,note:`Plex track: ${track}`,confirmed:true}));
  owned.forEach(({item}) => {
    const key = item.ratingKey || `${item.artist}|${item.album}|${item.year}`;
    if (!rows.has(key)) rows.set(key,{item,note:"MusicBrainz release match · track inferred",confirmed:false});
  });
  const releases = [...rows.values()].sort((a,b) => String(a.item.year || "9999").localeCompare(String(b.item.year || "9999")) || referenceArtistName(a.item.artist).localeCompare(referenceArtistName(b.item.artist)) || a.item.album.localeCompare(b.item.album));
  const confirmed = releases.filter((row) => row.confirmed).length;
  return `<section class="report-panel plex-track-evidence"><p class="eyebrow">ALBUM RELEASES OWNED</p><h3>${releases.length} ${releases.length === 1 ? "album" : "albums"} in your Plex</h3><p class="muted">${confirmed ? `${confirmed} confirmed from your Plex track list` : "Release matches inferred from MusicBrainz"}${confirmed && releases.length > confirmed ? ` · ${releases.length-confirmed} additional release matches` : ""}</p><div class="album-list">${releases.map(({item,note}) => `<button type="button" class="album song-instance" data-album="${escapeHtml(item.album)}" data-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(referenceArtistName(item.artist))} · ${escapeHtml(item.album)}</strong><span>${escapeHtml(item.year || "Year unknown")} · ${escapeHtml(note)}</span><small>Open Miles album page →</small></button>`).join("") || `<p class="muted">No album matched this song in the loaded Plex catalog.</p>`}</div><p class="fine-print">Plex track observations are distinct from MusicBrainz release inferences; neither identifies the exact mix or master.</p></section>`;
}

function formatDuration(milliseconds) {
  if (!milliseconds) return "Length unknown";
  return `${Math.floor(milliseconds/60000)}:${String(Math.floor(milliseconds/1000)%60).padStart(2,"0")}`;
}

function researchedSongBiography(title,artist,firstDate,versions,groups,owned) {
  const year = String(firstDate || "").match(/\b(18|19|20)\d{2}\b/)?.[0] || "an uncertain date";
  const firstGroup = groups[0]?.title;
  const labels = [...new Set(versions.map((recording) => recording.disambiguation).filter(Boolean))];
  const identityText = versions.length > 1 ? `MusicBrainz distinguishes ${versions.length} recording identities` : "MusicBrainz documents one recording identity";
  const versionText = labels.length ? `, including ${labels.slice(0,4).join(", ")}` : "";
  const appearance = firstGroup ? ` Its earliest mapped release-group appearance is ${firstGroup}.` : "";
  const holding = owned.length ? ` Your Plex library contains ${owned.length === 1 ? "one mapped appearance" : `${owned.length} mapped appearances`}, on ${owned.slice(0,3).map(({item}) => item.album).join(", ")}.` : " No matching Plex album was found for the mapped release groups.";
  return `MusicBrainz catalogs ${title} by ${artist} with a first release date of ${year}.${appearance} ${identityText}${versionText}.${holding}`.replace(/\s+/g," ").trim();
}

function releaseGroupFromRelease(release) {
  return release["release-group"] || {id:release.id,title:release.title,"first-release-date":release.date || ""};
}

async function fetchRecordingReleaseGroups(recordings,status,runId) {
  const groups = new Map();
  let nextIndex = 0, partial = false;
  async function worker() {
    while (nextIndex < recordings.length) {
      const recording = recordings[nextIndex++];
      let offset = 0, total = 1;
      while (offset < total && offset < 200) {
        if (runId !== reportRunId) return;
        const label = recording.disambiguation || "standard recording";
        const verdict = status?.querySelector(".verdict");
        if (verdict) verdict.textContent = `Cross-checking Plex against ${label} releases…`;
        const path = `/ws/2/release/?recording=${encodeURIComponent(recording.id)}&limit=100&offset=${offset}&inc=release-groups+artist-credits&fmt=json`;
        let page;
        try { page = await fetchJson(musicBrainzUrl(path)); }
        catch (_) { partial=true;break; }
        total = page["release-count"] || (page.releases || []).length;
        for (const release of page.releases || []) {
          const group = releaseGroupFromRelease(release);
          if (!group.id) continue;
          const existing = groups.get(group.id) || {...group,versions:new Set(),releaseDates:new Set()};
          existing.versions.add(label);
          if (release.date) existing.releaseDates.add(release.date);
          groups.set(group.id,existing);
        }
        offset += 100;
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(3,recordings.length)},() => worker()));
  if (partial) MilesResearch.unavailable(runId,"releases");
  return [...groups.values()];
}

function songOwnedMatches(query,primaryArtist,releaseGroups) {
    const ownedMap = new Map();
    releaseGroups.forEach((group) => {
      const matchedItems = library.filter((album) => canonicalTitle(album.album) === canonicalTitle(group.title) && [album.artist,referenceArtistName(album.artist)].some((name) => name.toLocaleLowerCase() === primaryArtist.toLocaleLowerCase()));
      for (const item of matchedItems) {
        const key = item.ratingKey || `${item.artist}|${item.album}|${item.year}`;
        const existing = ownedMap.get(key) || {item,groups:[],versions:new Set()};
        existing.groups.push(group);
        group.versions.forEach((version) => existing.versions.add(version));
        ownedMap.set(key,existing);
      }
    });
    // A same-title album is a useful likely match even when the recording-to-release
    // browse misses that edition; keep its evidence label distinct from a mapped release.
    library.filter((item) => songArtistMatches(item.artist,primaryArtist) && canonicalTitle(item.album) === canonicalTitle(query)).forEach((item) => {
      const key = item.ratingKey || `${item.artist}|${item.album}|${item.year}`;
      if (!ownedMap.has(key)) ownedMap.set(key,{item,groups:[],versions:new Set(["likely title track"])});
    });
    plexTrackEvidence(query).filter((entry) => songArtistMatches(entry.artist,primaryArtist)).forEach(({item}) => {
      const key = item.ratingKey || `${item.artist}|${item.album}|${item.year}`;
      const existing = ownedMap.get(key);
      if (existing) existing.versions.add("confirmed in Plex track list");
      else ownedMap.set(key,{item,groups:[],versions:new Set(["confirmed in Plex track list"])});
    });
    return [...ownedMap.values()].sort((a,b) => sortKey(a.item.album).localeCompare(sortKey(b.item.album)) || String(a.item.year).localeCompare(String(b.item.year)));
}

async function loadSongIntelligence(query,runId,context = {}) {
  const status = $("#song-status");
  try {
    let workIdentity = null, seedRecording = null, exact = [];
    const anchor = SONG_RECORDING_ANCHORS[canonicalTitle(query)];
    if (context.recordingId || anchor) {
      seedRecording = await fetchJson(musicBrainzUrl(`/ws/2/recording/${encodeURIComponent(context.recordingId || anchor.primary)}?inc=artists+artist-credits+releases+release-groups+artist-rels+recording-rels+work-rels+work-level-rels+url-rels+isrcs&fmt=json`));
      workIdentity = (seedRecording.relations || []).find((relation) => relation.work)?.work || null;
      exact = [seedRecording];
    }
    if (!workIdentity && !seedRecording) {
      const [workSearch, recordingSearch] = await Promise.all([
        fetchJson(musicBrainzUrl(`/ws/2/work/?query=${encodeURIComponent(`work:"${query}"`)}&limit=10&fmt=json`)),
        fetchJson(musicBrainzUrl(`/ws/2/recording/?query=${encodeURIComponent(`recording:"${query}"`)}&limit=50&fmt=json`))
      ]);
      workIdentity = (workSearch.works || []).find((work) => canonicalTitle(work.title) === canonicalTitle(query) && (!work.type || work.type === "Song")) || null;
      exact.push(...(recordingSearch.recordings || []).filter((recording) => songTitleMatches(recording.title,query)));
    }
    let workDetail = null;
    if (workIdentity) {
      if (runId === reportRunId) status.querySelector(".verdict").textContent = "Recording identity found; resolving original recording and alternate versions…";
      const [browse,detailResult] = await Promise.all([
        fetchJson(musicBrainzUrl(`/ws/2/recording/?work=${encodeURIComponent(workIdentity.id)}&limit=100&inc=artist-credits&fmt=json`)),
        fetchJson(musicBrainzUrl(`/ws/2/work/${encodeURIComponent(workIdentity.id)}?inc=artist-rels+recording-rels&fmt=json`)).catch(() => null)
      ]);
      exact.push(...(browse.recordings || []).filter((recording) => songTitleMatches(recording.title,query)));
      workDetail = detailResult;
      const writerNames = [...new Set((workDetail?.relations || []).filter((relation) => relation.artist && /composer|writer|lyricist/i.test(relation.type || "")).map((relation) => relation.artist.name))].slice(0,3);
      for (const writerName of (anchor ? [] : writerNames)) {
        try {
          const writerRecordings = await fetchJson(musicBrainzUrl(`/ws/2/recording/?query=${encodeURIComponent(`recording:"${query}" AND artist:"${writerName}"`)}&limit=20&fmt=json`));
          exact.push(...(writerRecordings.recordings || []).filter((recording) => songTitleMatches(recording.title,query)));
        } catch (_) {}
      }
    }
    if (!exact.length || !workIdentity) {
      if (runId === reportRunId) status.querySelector(".verdict").textContent = "No separate work entry found; resolving the exact recording and artist…";
      const artistClause = context.artist ? ` AND artist:"${referenceArtistName(context.artist)}"` : "";
      const recordingSearch = await fetchJson(musicBrainzUrl(`/ws/2/recording/?query=${encodeURIComponent(`recording:"${query}"${artistClause}`)}&limit=50&fmt=json`));
      exact.push(...(recordingSearch.recordings || []).filter((recording) => songTitleMatches(recording.title,query)));
    }
    if (anchor) {
      const missingIds = [anchor.primary,...anchor.covers].filter((id) => !exact.some((recording) => recording.id === id));
      const anchored = await Promise.all(missingIds.map((id) =>
        fetchJson(musicBrainzUrl(`/ws/2/recording/${id}?inc=artist-credits+work-rels&fmt=json`)).catch(() => null)));
      exact.push(...anchored.filter((recording) => recording?.id &&
        canonicalTitle(recording.title.replace(/\s*\(original studio master\)$/i,"")) === canonicalTitle(query) &&
        (!workIdentity || (recording.relations || []).some((relation) => relation.work?.id === workIdentity.id))));
    }
    exact = [...new Map(exact.filter((recording) => recording?.id).map((recording) => [recording.id,recording])).values()];
    if (!exact.length) throw new Error("No exact MusicBrainz recording identity was found");
    const libraryArtistDepth = (recording) => {
      const name = artistCreditName(recording).toLocaleLowerCase();
      return library.filter((item) => [item.artist,referenceArtistName(item.artist)].some((candidate) => candidate.toLocaleLowerCase() === name)).length;
    };
    const performanceKinds = new Map((workDetail?.relations || []).filter((relation) => relation.recording?.id)
      .map((relation) => [relation.recording.id,(relation.attributes || []).map((attribute) => String(attribute).toLowerCase())]));
    const primaryRank = (recording) => {
      const note = recording.disambiguation || "";
      const artist = artistCreditName(recording);
      // An explicitly selected cover performer takes precedence over the original-song anchor.
      const requestedArtist = context.artist && songArtistMatches(artist,context.artist) ? 3000000 : 0;
      const verifiedOriginal = recording.id === anchor?.primary ? 2000000 : 0;
      const performance = performanceKinds.get(recording.id);
      const documentedOriginal = performance && !performance.includes("cover") && !performance.includes("live") ? 150000 : 0;
      const originalLabel = /original.*studio|original mono/i.test(note) ? 50000 : 0;
      const datePriority = recordingYear(recording) === 9999 ? 0 : Math.max(0,(3000-recordingYear(recording))*100);
      const explicitlySelected = recording.id === context.recordingId ? 4000000 : 0;
      return explicitlySelected + requestedArtist + verifiedOriginal + documentedOriginal + originalLabel + datePriority + (!/live/i.test(note) ? 100 : 0) + Math.min(libraryArtistDepth(recording),99);
    };
    exact.sort((a,b) => primaryRank(b)-primaryRank(a) || recordingYear(a)-recordingYear(b));
    MilesResearch.done(runId,"identity");
    const primary = exact[0];
    const primaryArtist = artistCreditName(primary);
    const artistVersions = exact.filter((recording) => artistCreditName(recording) === primaryArtist);
    let firstDate = primary.id === anchor?.primary ? anchor.primaryDate : primary["first-release-date"] || artistVersions.map((recording) => recording["first-release-date"]).filter(Boolean).sort()[0] || "Unknown";
    firstDate = songReferenceDate(sourcedSongContext(primary.title,primaryArtist),firstDate);
    const sourceUrl = `https://musicbrainz.org/recording/${encodeURIComponent(primary.id)}`;
    const overviewPromise = MilesResearch.track(runId,"story",fetchSongStory(primary.title,primaryArtist));
    const theoryPromise = MilesResearch.track(runId,"music",fetchSongTheory(primary.title,primaryArtist));
    const previewPromise = MilesResearch.track(runId,"preview",fetchAppleSongPreview(primary.title,primaryArtist,context.album || ""));
    if (runId === reportRunId) {
      replaceReportHtml(status,`<div class="report-header song-hero"><p class="eyebrow">A SONG INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(primary.title)}</h2><span class="verdict">${escapeHtml(primaryArtist)} · earliest reference appearance ${escapeHtml(firstDate)}</span>${wishlistButton(primaryArtist,primary.title,firstDate,"Song")}</div><section class="report-panel context-panel"><p class="eyebrow">THE SONG STORY</p><h3>${escapeHtml(primary.title)}</h3><p>MusicBrainz identifies a recording of ${escapeHtml(primary.title)} by ${escapeHtml(primaryArtist)}, with a first listed release date of ${escapeHtml(firstDate)}. The full song story is being sourced now.</p><a href="${sourceUrl}" target="_blank" rel="noreferrer">View recording source ↗</a>${songPurchaseLinks(primary.title,primaryArtist,songReleaseAlbum(context,(primary.releases || []).map(releaseGroupFromRelease),primaryArtist))}<div id="early-song-preview"><p class="muted">Finding a 30-second preview…</p></div>${songResourceLinks(primary.title,primaryArtist)}</section>${songTheoryHtml(null,true)}${songOwnedAlbumsHtml(query)}<section class="report-panel"><h3>Explore the recordings</h3><p class="muted">Matching releases, credits and your Plex library in the background…</p></section>`);
    }
    theoryPromise.then((theory) => {
      const panel = runId === reportRunId ? status.querySelector(".song-theory-panel") : null;
      if (panel) replaceReportHtml(panel,songTheoryHtml(theory),true);
    });
    const biographyPromise = overviewPromise.then((article) => {
      const panel = runId === reportRunId ? status.querySelector(".context-panel") : null;
      if (panel && article?.extract && (canonicalTitle(article.title).startsWith(canonicalTitle(primary.title)))) {
        panel.querySelector("h3").textContent = article.title;
        (panel.querySelector(".biography-copy") || panel.querySelector("p:not(.eyebrow)")).outerHTML = biographyParagraphs(article.extract) + songStoryDetailsHtml(article);
        const sourceLink = panel.querySelector('a[href*="musicbrainz.org/recording/"]');
        if (sourceLink) { sourceLink.href = article.fullurl; sourceLink.textContent = "Read song story source ↗"; }
      }
      if (article) {
        firstDate = songReferenceDate(article,firstDate);
        const verdict = runId === reportRunId ? status.querySelector(".song-hero .verdict") : null;
        if (verdict) verdict.textContent = `${primaryArtist} · earliest reference appearance ${firstDate}`;
      }
      return article;
    });
    previewPromise.then((preview) => {
      const panel = runId === reportRunId ? status.querySelector("#early-song-preview") : null;
      if (panel) panel.innerHTML = applePreviewHtml(preview);
    });
    let detail = seedRecording?.id === primary.id ? seedRecording : primary;
    if (detail !== seedRecording) {
      try { detail = await fetchJson(musicBrainzUrl(`/ws/2/recording/${encodeURIComponent(primary.id)}?inc=artists+releases+release-groups+artist-rels+recording-rels+work-rels+work-level-rels+url-rels+isrcs&fmt=json`)); } catch (_) {}
    }
    if (runId !== reportRunId) return;

    const mappedVersions = [primary,...artistVersions.filter((recording) => recording.id !== primary.id)].slice(0,14);
    // Render the main report from already available evidence; exhaustive releases follow independently.
    const immediateGroups = new Map();
    (detail.releases || []).forEach((release) => {
      const group = releaseGroupFromRelease(release);
      if (!group.id) return;
      const entry = immediateGroups.get(group.id) || {...group,versions:new Set(),releaseDates:new Set()};
      entry.versions.add(primary.disambiguation || "standard recording");
      if (release.date) entry.releaseDates.add(release.date);
      immediateGroups.set(group.id,entry);
    });
    const releaseGroups = [...immediateGroups.values()];
    const releaseResearchPromise = MilesResearch.track(runId,"releases",fetchRecordingReleaseGroups(mappedVersions,null,runId));
    releaseResearchPromise.catch(() => {});
    if (runId !== reportRunId) return;
    const owned = songOwnedMatches(query,primaryArtist,releaseGroups);
    MilesResearch.done(runId,"credits");
    const relations = detail.relations || [];
    const workRelation = relations.find((relation) => relation.work);
    const work = workRelation?.work;
    const writerRelations = (work?.relations?.length ? work.relations : workDetail?.relations || []).filter((relation) => relation.artist && /composer|writer|lyricist/i.test(relation.type || ""));
    const writers = writerRelations.map((relation) => `${relation.artist.name} — ${relation.type}`);
    const performers = personnelFromRelations(relations);
    owned.forEach(({item}) => rememberPersonnel(item,performers));
    const versionRows = artistVersions.slice(0,30).map((recording) => `<li><div><strong>${escapeHtml(recording.title)}</strong><span>${escapeHtml(recording.disambiguation || "Standard recording identity")}</span></div><b>${escapeHtml(recording["first-release-date"] ? String(recording["first-release-date"]).slice(0,10) : "Date unknown")} · ${formatDuration(recording.length)}</b></li>`).join("");
    const anchoredCoverArtists = new Set(exact.filter((recording) => anchor?.covers.includes(recording.id)).map((recording) => songArtistKey(artistCreditName(recording))));
    const otherArtists = [...new Map(exact.filter((recording) => artistCreditName(recording) !== primaryArtist).map((recording) => {
      const artist = artistCreditName(recording);
      return [songArtistKey(artist),{artist,firstDate:recording["first-release-date"] || "",count:exact.filter((item) => artistCreditName(item) === artist).length}];
    })).values()].sort((a,b) => Number(anchoredCoverArtists.has(songArtistKey(b.artist))) - Number(anchoredCoverArtists.has(songArtistKey(a.artist))) || String(a.firstDate || "9999").localeCompare(String(b.firstDate || "9999")) || a.artist.localeCompare(b.artist));
    const otherArtistRows = otherArtists.slice(0,40).map((entry) => `<li><button type="button" class="credit-person" data-report-scope="Song" data-value="${escapeHtml(query)}" data-song-artist="${escapeHtml(entry.artist)}" data-recording-id="${escapeHtml(exact.find((recording) => songArtistMatches(artistCreditName(recording),entry.artist))?.id || "")}">${escapeHtml(entry.artist)}<span>${escapeHtml(entry.firstDate ? String(entry.firstDate).slice(0,10) : "Date unknown")} · ${entry.count} recording identit${entry.count === 1 ? "y" : "ies"} · open song report</span></button></li>`).join("");
    const [overview,applePreview,artistArticle,theory] = await Promise.all([biographyPromise,previewPromise,MilesResearch.track(runId,"artist",fetchArtistWikipediaSummary(primaryArtist)),theoryPromise]);
    if (runId !== reportRunId) return;
    const sourcedOverview = overview?.extract && canonicalTitle(overview.title).startsWith(canonicalTitle(primary.title)) ? overview : null;
    const biography = sourcedOverview?.extract || researchedSongBiography(primary.title,primaryArtist,firstDate,artistVersions,releaseGroups,owned);
    registerExploredSong({primary,artist:primaryArtist,theory,performers,versions:[primary,...artistVersions.filter((row) => row.id !== primary.id)],relations});
    replaceReportHtml(status,`<div class="report-header song-hero"><p class="eyebrow">A SONG INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(primary.title)}</h2><span class="verdict">${escapeHtml(primaryArtist)} · earliest reference appearance ${escapeHtml(firstDate)}</span>${wishlistButton(primaryArtist,primary.title,firstDate,"Song")}</div>
      <section class="report-panel context-panel"><p class="eyebrow">THE SONG STORY</p><h3>${escapeHtml(sourcedOverview?.title || primary.title)}</h3>${biographyParagraphs(biography)}${songStoryDetailsHtml(sourcedOverview)}${sourcedOverview?.fullurl ? `<a href="${escapeHtml(sourcedOverview.fullurl)}" target="_blank" rel="noreferrer">Read song story source ↗</a>` : `<a href="${sourceUrl}" target="_blank" rel="noreferrer">View recording source ↗</a>`}${songPurchaseLinks(primary.title,primaryArtist,songReleaseAlbum(context,releaseGroups,primaryArtist))}${applePreviewHtml(applePreview)}${songResourceLinks(primary.title,primaryArtist)}</section>
      ${songTheoryHtml(theory)}
      ${listeningGuideHtml(theory,performers)}
      ${songConnectionsHtml(primary.id)}
      ${personalNotesHtml("Song",primary.title,primaryArtist)}
      ${sourceConfidenceHtml({sourceUrl,story:sourcedOverview,theory,performers,owned})}
      <div class="song-owned-releases">${songOwnedAlbumsHtml(query,owned,primaryArtist)}</div>
      ${songUnownedReleasesHtml(releaseGroups,owned,primaryArtist,true)}
      <details class="report-panel collapsible"><summary><span><small>THE PERFORMANCE</small><strong>Credits and recording identity</strong></span><b>${performers.length} performer credits</b></summary><dl class="identity-grid"><div><dt>Artist</dt><dd>${escapeHtml(primaryArtist)}</dd></div><div><dt>Recording identities</dt><dd>${artistVersions.length}</dd></div><div><dt>Release groups</dt><dd class="song-release-count">${releaseGroups.length} · checking more…</dd></div><div><dt>ISRCs</dt><dd>${(detail.isrcs || []).length || "None listed"}</dd></div></dl>${writers.length ? `<h4>Songwriting</h4><ul class="credit-list">${writers.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>` : ""}<h4>Who played what</h4>${personnelListHtml(performers,"No structured performer relationships were attached to this recording identity.")}<p class="fine-print">Select a contributor for their artist report or a role to search the collection.</p><a href="${sourceUrl}" target="_blank" rel="noreferrer">Open MusicBrainz recording ↗</a></details>
      <details class="report-panel collapsible"><summary><span><small>ALTERNATE RECORDINGS</small><strong>Live takes, mixes and versions</strong></span><b>${artistVersions.length} identities</b></summary><ul class="version-list">${versionRows}</ul><p class="fine-print">MusicBrainz labels distinguish documented recordings; an unlabeled entry does not establish a unique mix or master.</p></details>
      ${otherArtists.length ? `<details class="report-panel collapsible"><summary><span><small>OTHER INTERPRETATIONS</small><strong>Hear it by another artist</strong></span><b>${otherArtists.length} artists</b></summary><ul class="version-list">${otherArtistRows}</ul><p class="fine-print">Choose an artist to open that performer’s song report and preview.</p></details>` : ""}
      <section class="report-panel">${artistBiographyHtml(primaryArtist,artistArticle)}</section>
      `);
    hydrateListeningTools();
    const cacheKey = [canonicalTitle(query),songArtistKey(context.artist || ""),context.recordingId || "",canonicalTitle(context.album || "")].join("|");
    releaseResearchPromise.then((researchedGroups) => {
      if (runId !== reportRunId || !status.isConnected) return;
      const merged = new Map(releaseGroups.map((group) => [group.id,group]));
      researchedGroups.forEach((group) => {
        const previous = merged.get(group.id);
        if (previous) { previous.versions.forEach((value) => group.versions.add(value));previous.releaseDates.forEach((value) => group.releaseDates.add(value)); }
        merged.set(group.id,group);
      });
      const completeGroups = [...merged.values()].sort((a,b) => String(a["first-release-date"] || "9999").localeCompare(String(b["first-release-date"] || "9999")));
      const completeOwned = songOwnedMatches(query,primaryArtist,completeGroups);
      const purchasePanel = status.querySelector(".song-purchase-links");
      if (purchasePanel) purchasePanel.outerHTML = songPurchaseLinks(primary.title,primaryArtist,songReleaseAlbum(context,completeGroups,primaryArtist));
      completeOwned.forEach(({item}) => rememberPersonnel(item,performers));
      const ownedPanel = status.querySelector(".song-owned-releases");
      if (ownedPanel) replaceReportHtml(ownedPanel,songOwnedAlbumsHtml(query,completeOwned,primaryArtist));
      const unownedPanel = status.querySelector(".song-unowned-releases");
      if (unownedPanel) {const wasOpen = unownedPanel.open;replaceReportHtml(unownedPanel,songUnownedReleasesHtml(completeGroups,completeOwned,primaryArtist),true);status.querySelector(".song-unowned-releases").open = wasOpen;}
      const count = status.querySelector(".song-release-count");if (count) count.textContent = String(completeGroups.length);
      const confidence = status.querySelector(".source-confidence");
      if (confidence) {const wasOpen = confidence.open;replaceReportHtml(confidence,sourceConfidenceHtml({sourceUrl,story:sourcedOverview,theory,performers,owned:completeOwned}),true);status.querySelector(".source-confidence").open = wasOpen;}
      if (!sourcedOverview) status.querySelector(".context-panel p:not(.eyebrow)").textContent = researchedSongBiography(primary.title,primaryArtist,firstDate,artistVersions,completeGroups,completeOwned);
      songReportCache.set(cacheKey,status.innerHTML);
      if (songReportCache.size > 20) songReportCache.delete(songReportCache.keys().next().value);
      const currentEntry = reportHistory[reportHistoryIndex];
      if (currentEntry?.scope === "Song") currentEntry.html = els.reportContent.innerHTML;
    }).catch(() => {
      const panel = runId === reportRunId ? status.querySelector(".song-release-loading") : null;
      if (panel) panel.textContent = "Additional release research is unavailable. The song report remains usable.";
      MilesResearch.unavailable(runId,"releases");
    });
  } catch (error) {
    MilesResearch.fail(runId);
    if (runId === reportRunId && status) replaceReportHtml(status,`<div class="report-header"><p class="eyebrow">SONG</p><h2 class="report-title">${escapeHtml(query)}</h2></div><section class="report-panel"><h3>Song reference lookup unavailable</h3><p>${escapeHtml(error.message)}. Miles did not substitute an album-title search or invent a result.</p><button type="button" class="button secondary" data-song-refresh>Retry song lookup</button></section>${songTheoryHtml()}`);
  }
}

function renderSongReport(query,addHistory = true,context = {}) {
  const runId = ++reportRunId;
  MilesSections.begin();
  MilesResearch.reset();
  if (addHistory) addReportHistory({scope:"Song",query,context}); else syncReportNavigation();
  els.report.hidden = false;
  const cacheKey = [canonicalTitle(query),songArtistKey(context.artist || ""),context.recordingId || "",canonicalTitle(context.album || "")].join("|");
  const cached = songReportCache.get(cacheKey);
  if (cached) {
    els.reportContent.innerHTML = `<div id="song-status">${cached}</div>`;
    hydrateListeningTools();
    els.report.scrollIntoView({behavior:"smooth",block:"start"});
    return;
  }
  MilesResearch.start(runId,"Song",{story:"Song Story",identity:"Recording Identity",music:"Musical Analysis",preview:"Audio Preview",credits:"Credits",artist:"Artist Biography",releases:"Album Releases & Collection Matches"});
  els.reportContent.innerHTML = `<div id="song-status"><div class="report-header"><p class="eyebrow">A SONG INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">Sourcing the story and matching recordings…</span></div><section class="report-panel context-panel"><p class="eyebrow">THE SONG STORY</p><h3>${escapeHtml(query)}</h3><p>Finding the sourced song biography…</p>${songPurchaseLinks(query,context.artist || "",context.album || "")}<p class="muted">Matching the artist for the Apple preview…</p>${songResourceLinks(query,context.artist || "")}</section>${songTheoryHtml(null,true)}${songOwnedAlbumsHtml(query)}<section class="report-panel"><h3>Album releases not owned</h3><p class="muted">Checking dated release groups…</p></section></div>`;
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  fetchSongStory(query,context.artist || "").then((article) => {
    const story = runId === reportRunId ? $("#song-status .context-panel") : null;
    if (story && article) {
      story.querySelector("h3").textContent = article.title;
      const verdict = $("#song-status .verdict");
      if (verdict && article.originalReleaseYear) verdict.textContent = `${context.artist || (songArtistKey(query) === "penny lane" ? "The Beatles" : "Song")} · earliest reference appearance ${article.originalReleaseYear}`;
      (story.querySelector(".biography-copy") || story.querySelector("p:not(.eyebrow)")).outerHTML = biographyParagraphs(article.extract) + songStoryDetailsHtml(article);
      story.insertAdjacentHTML("beforeend",`<a href="${escapeHtml(article.fullurl)}" target="_blank" rel="noreferrer">Read song story source ↗</a>`);
    }
  });
  loadSongIntelligence(query,runId,context);
}

async function loadMissingReleaseEnrichment(context,runId) {
  MilesResearch.start(runId,"Album",{album:"Album Story, Artwork, Tracks & Credits"});
  const biographyPanel = $("#missing-biography"), tracksPanel = $("#missing-tracks"), peoplePanel = $("#missing-personnel"), identityPanel = $("#missing-identity");
  if (!biographyPanel) return;
  try {
    const [group,article,artistArticle] = await Promise.all([
      fetchJson(musicBrainzUrl(`/ws/2/release-group/${encodeURIComponent(context.group.id)}?inc=releases+artist-credits+genres+annotation+url-rels&fmt=json`)),
      fetchAlbumWikipediaSummary({album:context.group.title,artist:context.artist}),
      fetchArtistWikipediaSummary(context.artist)
    ]);
    if (runId !== reportRunId) return;
    if (article?.pageid) article.fullExtract = await fetchWikipediaArticleText(article.pageid);
    if (runId !== reportRunId) return;
    const releaseIdentity = (group.releases || []).find((release) => release.status === "Official") || (group.releases || [])[0];
    let release = null;
    if (releaseIdentity) {
      await new Promise((resolve) => setTimeout(resolve,1100));
      release = await fetchJson(musicBrainzUrl(`/ws/2/release/${encodeURIComponent(releaseIdentity.id)}?inc=recordings+artist-credits+labels+artist-rels+recording-level-rels&fmt=json`));
    }
    if (runId !== reportRunId) return;
    let tracks = (release?.media || []).flatMap((medium) => (medium.tracks || []).map((track) => ({number:track.number,title:track.title || track.recording?.title,length:track.length,recordingId:track.recording?.id})));
    const pseudoItem = {album:context.group.title,artist:context.artist,year:String(context.assessment.year || ""),genres:[context.genre].filter(Boolean),studio:(release?.["label-info"] || [])[0]?.label?.name || ""};
    const personnel = mergePersonnel(personnelFromRelease(release),pseudoItem);
    rememberPersonnel(pseudoItem,personnel);
    const biography = article?.extract || group.annotation || researchedAlbumBiography(pseudoItem,group,release,tracks,personnel);
    const cover = await fetchReleaseGroupCover(group.id) || article?.original?.source || article?.thumbnail?.source || "";
    if (runId !== reportRunId) return;
    biographyPanel.innerHTML = `<p class="eyebrow">ALBUM BIOGRAPHY & CONTEXT</p><div class="album-story-layout">${albumArtwork(cover,article?.title || group.title)}<div class="album-story-copy"><h3>${escapeHtml(article?.title || group.title)}</h3>${biographyParagraphs(biography)}${article?.fullurl ? `<a href="${escapeHtml(article.fullurl)}" target="_blank" rel="noreferrer">Read source article ↗</a>` : `<p class="fine-print">Fact-based fallback assembled from the matched MusicBrainz album, release, track and personnel records.</p>`}</div></div>${regionalReleaseDates(group)}${albumFactsHtml(article,tracks,personnel,pseudoItem)}`;
    tracksPanel.innerHTML = `<p class="eyebrow">TRACK LIST</p><h3>${tracks.length ? `${tracks.length} tracks on the selected official edition` : "Track list unavailable"}</h3>${tracks.length ? `<ol class="track-list">${tracks.map((track) => `<li><button type="button" class="track-drill" data-report-scope="Song" data-value="${escapeHtml(track.title || "Untitled")}" data-song-artist="${escapeHtml(context.artist)}" data-song-album="${escapeHtml(group.title)}" data-recording-id="${escapeHtml(track.recordingId || "")}" aria-label="Open song report for ${escapeHtml(track.title || "Untitled")}"><span>${escapeHtml(track.number || "")}</span><strong>${escapeHtml(track.title || "Untitled")}</strong>${track.length ? `<time>${formatDuration(track.length)}</time>` : `<time>Open</time>`}<b aria-hidden="true">›</b></button>${trackSongActions(track.title || "Untitled",context.artist,group.title)}</li>`).join("")}</ol><p class="fine-print">Every track opens its own song intelligence report; YouTube searches for artist + song, and Apple Preview streams a 30-second sample in place. Back restores this missing-album report.</p>` : `<p class="muted">No track-bearing official edition was returned.</p>`}`;
    void primeApplePreviewButtons(tracksPanel);
    peoplePanel.innerHTML = `<p class="eyebrow">WHO PLAYED WHAT</p><h3>Personnel, performances and sampled sources</h3>${personnelListHtml(personnel,"The selected edition has no structured performer/instrument relationships.")}<div class="bio"><strong>Artist biography</strong>${biographyParagraphs(artistArticle?.extract || "No reliable artist biography was returned for this identity.")}</div>`;
    identityPanel.innerHTML = `<p class="eyebrow">IDENTITY & ACQUISITION TARGET</p><h3>${escapeHtml(group.title)}</h3><dl class="identity-grid"><div><dt>Original release</dt><dd>${escapeHtml(group["first-release-date"] || "Unknown")}</dd></div><div><dt>Primary type</dt><dd>${escapeHtml(group["primary-type"] || "Album")}</dd></div><div><dt>Reference editions</dt><dd>${(group.releases || []).length}</dd></div><div><dt>Genre lane</dt><dd>${escapeHtml(context.genre || "Unclassified")}</dd></div></dl><a href="https://musicbrainz.org/release-group/${encodeURIComponent(group.id)}" target="_blank" rel="noreferrer">Open MusicBrainz release group ↗</a>${albumPurchaseLinks(group.title,context.artist)}<p class="fine-print">This is the reference release-group identity Miles used for the missing-title claim.</p>`;
    hydrateListeningTools();
    const historyEntry = reportHistory[reportHistoryIndex];
    if (historyEntry?.scope === "Missing" && historyEntry.mbid === context.group.id) historyEntry.html = els.reportContent.innerHTML;
  } catch (error) {
    if (runId !== reportRunId) return;
    biographyPanel.innerHTML = `<p class="eyebrow">ALBUM BIOGRAPHY</p><h3>${escapeHtml(context.group.title)}</h3><p>${escapeHtml(error.message)}. The verified catalog position and Attainment Score remain available.</p>`;
    tracksPanel.innerHTML = `<p class="eyebrow">TRACK LIST</p><h3>Reference edition unavailable</h3>`;
    peoplePanel.innerHTML = `<p class="eyebrow">WHO PLAYED WHAT</p><h3>Reference credits unavailable</h3>`;
    identityPanel.innerHTML = `<p class="eyebrow">REFERENCE IDENTITY</p><a href="https://musicbrainz.org/release-group/${encodeURIComponent(context.group.id)}" target="_blank" rel="noreferrer">Open MusicBrainz release group ↗</a>`;
  }
}

function renderMissingReleaseDetail(context,addHistory = true) {
  if (!context.assessment) {
    renderAlbumDetail({album:context.group.title,artist:context.artist,year:String(context.group["first-release-date"] || "").slice(0,4),genres:[context.genre].filter(Boolean),studio:""},addHistory,true);
    return;
  }
  const runId = ++reportRunId;
  MilesSections.begin();
  MilesResearch.reset();
  const {group,artist,assessment} = context;
  if (addHistory) addReportHistory({scope:"Missing",query:group.title,artist,mbid:group.id,context}); else syncReportNavigation();
  els.report.hidden = false;
  const reasons = assessment.breakdown.map((item) => `<li><strong>+${item.points}</strong><span>${escapeHtml(item.label)}</span></li>`).join("");
  els.reportContent.innerHTML = `<div class="report-header missing-hero"><p class="eyebrow">A MISSING RELEASE INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(group.title)}</h2><span class="verdict">${escapeHtml(artist)} · ${assessment.year || "Date unknown"}</span><div class="album-wishlist-action">${wishlistButton(artist,group.title,assessment.year)}</div></div>
    <section class="missing-score-card"><div class="attainment-score"><strong>${assessment.score}</strong><span>/100</span></div><div><p class="eyebrow">ATTAINMENT SCORE</p><h3>Why this belongs on the acquisition radar</h3><p>${escapeHtml(assessment.why)}</p><p class="fine-print">This score measures how strongly the title completes your existing holdings—not its market price or an absolute critical ranking.</p></div></section>
    <section id="missing-biography" class="report-panel"><p class="eyebrow">ALBUM BIOGRAPHY</p><h3>Researching why the release matters…</h3></section>
    <div class="report-grid missing-detail-grid"><section class="report-panel"><p class="eyebrow">COLLECTION FIT</p><h3>Why Miles prioritized it</h3><ul class="score-breakdown">${reasons}</ul>${assessment.yearDepth ? `<p class="muted">Your Plex library contains ${assessment.yearDepth.toLocaleString()} albums from ${assessment.year}, so this release also connects to a well-represented musical year.</p>` : ""}</section>
    <section class="report-panel"><p class="eyebrow">CATALOG POSITION</p><h3>Official studio album ${assessment.position} of ${assessment.total}</h3><p>Overall acquisition rank #${context.overallRank || "—"} · ${escapeHtml(context.genre || "Unclassified")} priority.</p><div class="button-row detail-actions"><button type="button" class="button secondary" data-report-scope="Artist" data-value="${escapeHtml(artist)}">Open ${escapeHtml(artist)} report</button></div></section></div>
    <div class="report-grid missing-detail-grid"><section id="missing-tracks" class="report-panel"><p class="eyebrow">TRACK LIST</p><h3>Loading the selected official edition…</h3></section><section id="missing-personnel" class="report-panel"><p class="eyebrow">WHO PLAYED WHAT</p><h3>Loading personnel credits…</h3></section></div>
    <section id="missing-identity" class="report-panel"><p class="eyebrow">IDENTITY & ACQUISITION TARGET</p><h3>Resolving the exact release…</h3></section>${personalNotesHtml("Album",group.title,artist)}`;
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  loadMissingReleaseEnrichment(context,runId).finally(() => MilesResearch.finish(runId));
}

function albumReferenceArtist(item) {
  return sourcedAlbumFallback(item)?.artist || referenceArtistName(item.artist);
}

function sourcedAlbumFallback(item) {
  if (canonicalTitle(referenceAlbumTitle(item?.album || "")) !== "electric arguments" ||
      !["paul mccartney","fireman","the fireman"].includes(sortKey(referenceArtistName(item?.artist || "")))) return null;
  const sourceUrl = "https://www.paulmccartney.com/discography/albums/electric-arguments";
  const tracks = ["Nothing Too Much Just Out of Sight","Two Magpies","Sing the Changes","Travelling Light","Highway","Light from Your Lighthouse","Sun Is Shining","Dance 'Til We're High","Lifelong Passion","Is This Love?","Lovers in a Dream","Universal Here, Everlasting Now","Don't Stop Running"].map((title,index) => ({number:String(index+1),title,artist:"The Fireman",recordingId:""}));
  const credits = [
    ["Paul McCartney",["lead vocals","backing vocals","electric guitar","acoustic guitar","lap steel guitar","mandolin","bass","double bass","piano","electric piano","harpsichord","organ","harmonium","Mellotron","keyboards","synthesizer","flute","harmonica","vibraphone","cello","tambourine","percussion","drums","songwriting","producer"]],
    ["Youth",["producer"]],
    ["Clive Goddard",["recording engineer","mixing"]],
    ["Tim Bran",["programming"]],
    ["David Nock",["additional programming"]],
    ["Steve Rooke",["mastering"]],
    ["Keith Smith",["sound assistance"]],["John Hammel",["sound assistance"]],
    ["Eddie Klein",["sound assistance"]],["Jamie Kirkham",["sound assistance"]],
    ["Norman Hathaway",["design"]],["Ruth Ward",["photography"]]
  ].map(([name,roles]) => ({id:"",name,roles,role:roles.join(", "),creditCount:roles.length}));
  return {artist:"The Fireman",tracks,personnel:credits,sourceUrl,creditSourceUrl:"https://en.wikipedia.org/wiki/Electric_Arguments",
    note:"Original 13-track album. Road Trip is a hidden piece within the final track; bonus tracks and later editions differ.",
    take:"Electric Arguments brings McCartney’s experimental Fireman partnership with Youth into song form. Each track began as a day’s writing and recording, giving the album a spontaneous range from heavy rock to acoustic and ambient textures. It is the duo’s first album with regular lead vocals—a distinct creative chapter alongside McCartney’s solo releases.",
    article:{title:"Electric Arguments",fullurl:sourceUrl,extract:"Electric Arguments is a 2008 album by The Fireman, Paul McCartney’s collaboration with Youth. Its thirteen songs were recorded in thirteen days spread across nearly a year. It was the duo’s first album to feature regular vocals. McCartney and Youth produced it, with recording and mixing by Clive Goddard at Hog Hill Mill."}
  };
}

function sourcedAlbumTracksHtml(item,source) {
  return `<p class="eyebrow">TRACK LIST</p><h3>${source.tracks.length} tracks · original album</h3><ol class="track-list">${source.tracks.map((track) => `<li><button type="button" class="track-drill" data-report-scope="Song" data-value="${escapeHtml(track.title)}" data-song-artist="${escapeHtml(source.artist)}" data-song-album="${escapeHtml(item.album)}"><span>${track.number}</span><strong>${escapeHtml(track.title)}</strong><time>Open</time><b aria-hidden="true">›</b></button>${trackSongActions(track.title,source.artist,item.album)}</li>`).join("")}</ol><p class="fine-print">${escapeHtml(source.note)} <a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">Official track list and album credits ↗</a></p>`;
}

function sourcedAlbumCreditsHtml(source,personnel = source.personnel) {
  return `<p class="eyebrow">CREDITS</p><h3>Musicians, producers and other contributors</h3>${personnelListHtml(personnel,"")}<p class="fine-print"><a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">Official production credits ↗</a> · <a href="${escapeHtml(source.creditSourceUrl)}" target="_blank" rel="noreferrer">Performance credits ↗</a></p>`;
}

async function fetchAlbumReference(item) {
  const artistName = albumReferenceArtist(item);
  const albumTitle = referenceAlbumTitle(item.album);
  const search = new URLSearchParams({query:`releasegroup:\"${albumTitle}\" AND artist:\"${artistName}\"`,limit:"25",fmt:"json"});
  const searchData = await fetchJson(musicBrainzUrl(`/ws/2/release-group?${search}`));
  const candidates = searchData["release-groups"] || [];
  if (!candidates.length) throw new Error("No reference album match was found");
  const targetTitle = canonicalTitle(item.album);
  const targetArtist = entityKey(artistName);
  const targetYear = Number(item.year) || 0;
  const plexLive = /[\[(]\s*live(?: recording| album)?\s*[\])]/i.test(item.album);
  const ranked = candidates.map((entry) => {
    const titleExact = canonicalTitle(entry.title) === targetTitle;
    const creditedArtists = (entry["artist-credit"] || []).map((credit) => entityKey(credit.artist?.name || credit.name || ""));
    const artistExact = creditedArtists.includes(targetArtist);
    const candidateYear = Number(String(entry["first-release-date"] || "").slice(0,4)) || 0;
    const yearDistance = targetYear && candidateYear ? Math.abs(targetYear-candidateYear) : null;
    const secondary = entry["secondary-types"] || [];
    const score = (titleExact ? 200 : 0) + (artistExact ? 120 : 0) + (entry["primary-type"] === "Album" ? 35 : 0)
      + (plexLive ? (secondary.includes("Live") ? 75 : -75) : 0)
      + (!secondary.some((type) => /Compilation|DJ-mix|Mixtape|Remix/i.test(type)) ? 35 : -180)
      + (yearDistance === 0 ? 100 : yearDistance === 1 ? 55 : yearDistance !== null && yearDistance <= 3 ? 20 : yearDistance !== null ? -Math.min(yearDistance,40) : 0)
      + Math.min(Number(entry.score) || 0,100)/10;
    return {entry,score,titleExact,artistExact};
  }).sort((a,b) => b.score-a.score);
  const best = ranked[0];
  if (!best?.titleExact || !best.artistExact) throw new Error("No exact artist-and-album identity was found");
  const group = best.entry;
  await new Promise((resolve) => setTimeout(resolve,1100));
  const detail = await fetchJson(musicBrainzUrl(`/ws/2/release-group/${encodeURIComponent(group.id)}?inc=releases+artist-credits+genres+annotation+url-rels&fmt=json`));
  const releases = detail.releases || [];
  const releaseScore = (entry) => {
    const year = String(entry.date || "").slice(0,4);
    return (entry.status === "Official" ? 100 : 0) + (year && year === item.year ? 60 : 0) + (entry.country === "GB" ? 25 : entry.country === "US" ? 20 : 0) + (entry.date ? 10 : 0);
  };
  const release = [...releases].sort((a,b) => releaseScore(b)-releaseScore(a) || String(a.date || "9999").localeCompare(String(b.date || "9999")))[0];
  let releaseDetail = null;
  if (release) {
    await new Promise((resolve) => setTimeout(resolve,1100));
    try { releaseDetail = await fetchJson(musicBrainzUrl(`/ws/2/release/${encodeURIComponent(release.id)}?inc=recordings+artist-credits+labels+artist-rels+recording-level-rels&fmt=json`)); }
    catch (_) { releaseDetail = null; }
  }
  return {group:detail,release:releaseDetail};
}

function personnelFromRelease(release) {
  const credits = new Map();
  const collect = (relations = []) => relations.filter((rel) => rel.artist).forEach((rel) => {
    const key = rel.artist.id || rel.artist.name;
    if (!credits.has(key)) credits.set(key,{id:rel.artist.id || "",name:rel.artist.name,roles:new Set(),creditCount:0});
    const roles = (rel.attributes || []).length ? rel.attributes : [rel.type || "performance credit"];
    roles.filter(Boolean).forEach((role) => credits.get(key).roles.add(role));
    credits.get(key).creditCount += Math.max(roles.filter(Boolean).length,1);
  });
  collect(release?.relations);
  (release?.media || []).flatMap((medium) => medium.tracks || []).forEach((track) => collect(track.recording?.relations));
  return [...credits.values()].map((person) => {
    const roles = [...person.roles].sort((a,b) => a.localeCompare(b));
    return {...person,roles,role:roles.join(", ")};
  }).sort((a,b) => b.creditCount-a.creditCount || b.roles.length-a.roles.length || a.name.localeCompare(b.name)).slice(0,50);
}

function personnelFromRelations(relations = []) {
  const credits = new Map();
  relations.filter((relation) => relation.artist).forEach((relation) => {
    const key = relation.artist.id || sortKey(relation.artist.name);
    if (!credits.has(key)) credits.set(key,{id:relation.artist.id || "",name:relation.artist.name,roles:new Set(),creditCount:0});
    const roles = (relation.attributes || []).length ? relation.attributes : [relation.type || "performance credit"];
    roles.filter(Boolean).forEach((role) => credits.get(key).roles.add(role));
    credits.get(key).creditCount += Math.max(roles.filter(Boolean).length,1);
  });
  return [...credits.values()].map((person) => {
    const roles = [...person.roles].sort((a,b) => a.localeCompare(b));
    return {...person,roles,role:roles.join(", ")};
  }).sort((a,b) => b.creditCount-a.creditCount || b.roles.length-a.roles.length || a.name.localeCompare(b.name)).slice(0,50);
}

function curatedAlbumPersonnel(item) {
  const artist = sortKey(referenceArtistName(item?.artist || ""));
  const album = canonicalTitle(item?.album || "");
  if (artist === "laibach" && album === "nova akropola") {
    return [
      {id:"",name:"Milan Fras",roles:["Laibach member and performer during the 1985 sessions"],role:"Laibach member and performer during the 1985 sessions",sourceType:"period-lineup"},
      {id:"",name:"Dejan Knez",roles:["Laibach member and performer during the 1985 sessions"],role:"Laibach member and performer during the 1985 sessions",sourceType:"period-lineup"},
      {id:"",name:"Ervin Markošek",roles:["Laibach member and performer during the 1985 sessions"],role:"Laibach member and performer during the 1985 sessions",sourceType:"period-lineup"},
      {id:"",name:"Ivan (Jani) Novak",roles:["Laibach member and performer during the 1985 sessions"],role:"Laibach member and performer during the 1985 sessions",sourceType:"period-lineup"}
    ];
  }
  return [];
}

function mergePersonnel(personnel,item) {
  const merged = new Map();
  [...curatedAlbumPersonnel(item),...personnel].forEach((person) => {
    const key = sortKey(person.name).replace(/\bjani\b/g,"ivan");
    if (!merged.has(key)) merged.set(key,{...person,roles:new Set(person.roles || []),creditCount:person.creditCount || (person.roles || []).length || 1});
    else {
      (person.roles || []).forEach((role) => merged.get(key).roles.add(role));
      merged.get(key).creditCount += person.creditCount || (person.roles || []).length || 1;
      if (!merged.get(key).id && person.id) merged.get(key).id = person.id;
      if (person.sourceType !== "period-lineup") merged.get(key).sourceType = person.sourceType;
    }
  });
  return [...merged.values()].map((person) => {
    const roles = [...person.roles];
    return {...person,roles,role:roles.join(", ")};
  }).sort((a,b) => b.creditCount-a.creditCount || b.roles.length-a.roles.length || a.name.localeCompare(b.name));
}

function isSampleSource(person) {
  return (person.roles || []).some((role) => /sample(?:s|d)? from|sampled (?:voice|speech|artist)|source recording/i.test(role));
}

function displayCreditRole(role) {
  return /samples from artist/i.test(role) ? "sampled speech / source recording" : role;
}

function rememberPersonnel(item,personnel) {
  personnel.forEach((person) => person.roles.forEach((role) => {
    if (isSampleSource(person) || person.sourceType === "period-lineup") return;
    const key = `${sortKey(item.artist)}|${canonicalTitle(item.album)}|${sortKey(person.name)}|${sortKey(role)}`;
    if (!creditEvidence.some((entry) => entry.key === key)) creditEvidence.push({key,role,person:person.name,album:item.album,artist:item.artist,year:item.year || ""});
  }));
}

function personnelListHtml(personnel,emptyMessage) {
  if (!personnel.length) return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  const technicalRole = /\b(?:producer|production|engineer|engineering|assistant|assistance|mastering|mix(?:ed|ing)?|recording|photograph(?:y|er)?|art direction|design|liner notes|technician)\b/i;
  const nonSampled = personnel.filter((person) => !isSampleSource(person));
  const performers = nonSampled.filter((person) => person.sourceType === "period-lineup" || person.roles.some((role) => !technicalRole.test(role)));
  const production = nonSampled.filter((person) => !performers.includes(person));
  const samples = personnel.filter(isSampleSource);
  const byCreditDepth = (a,b) => (b.creditCount || b.roles.length)-(a.creditCount || a.roles.length) || b.roles.length-a.roles.length || a.name.localeCompare(b.name);
  const rows = (people,sampled = false) => `<ul class="personnel-list">${[...people].sort(byCreditDepth).map((person) => `<li><button type="button" class="credit-person" data-report-scope="Artist" data-value="${escapeHtml(person.name)}">${escapeHtml(person.name)}<span>Open artist search →</span></button><div class="credit-roles">${person.roles.map((role) => sampled || person.sourceType === "period-lineup" ? `<span>${escapeHtml(displayCreditRole(role))}</span>` : `<button type="button" data-report-scope="Instrument" data-value="${escapeHtml(role)}">${escapeHtml(displayCreditRole(role))}</button>`).join("")}</div></li>`).join("")}</ul>`;
  return `${performers.length ? `<h4 class="credit-group-title">Musicians and vocalists</h4>${rows(performers)}` : ""}${production.length ? `<h4 class="credit-group-title">Production, engineering and other credits</h4>${rows(production)}` : ""}${samples.length ? `<h4 class="credit-group-title">Sampled voices and source material</h4>${rows(samples,true)}<p class="fine-print">A sampled-source credit means the person’s recorded voice or other archival material appears in the track; it does not mean they performed with the band.</p>` : ""}`;
}

const dynamicInstrumentGuides = new Map();

async function fetchWikipediaSearchPages(search,limit = 30,fullText = false) {
  const params = new URLSearchParams({action:"query",generator:"search",gsrsearch:search,gsrnamespace:"0",gsrlimit:String(limit),prop:"extracts|info|pageprops|pageviews",exintro:"1",exlimit:"max",explaintext:"1",inprop:"url",pvipdays:"30",format:"json",origin:"*"});
  if (fullText) params.delete("exintro");
  const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error("Wikipedia research did not respond");
  const data = await response.json();
  return Object.values(data.query?.pages || {});
}

async function fetchWikidataEntities(ids,props = "labels|claims|sitelinks") {
  const unique = [...new Set(ids.filter(Boolean))].slice(0,50);
  if (!unique.length) return {};
  const params = new URLSearchParams({action:"wbgetentities",ids:unique.join("|"),props,languages:"en",format:"json",origin:"*"});
  const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`);
  if (!response.ok) throw new Error("Wikidata research did not respond");
  return (await response.json()).entities || {};
}

function wikidataClaimIds(entity,property) {
  return (entity?.claims?.[property] || []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
}

function wikidataYear(entity) {
  const time = entity?.claims?.P577?.[0]?.mainsnak?.datavalue?.value?.time || "";
  return time.match(/[+-](\d{4})-/)?.[1] || "";
}

function wikipediaViews(page) {
  return Object.values(page.pageviews || {}).reduce((sum,value) => sum + (Number(value) || 0),0);
}

async function fetchAutomaticInstrumentPlayers(instrumentId,query) {
  if (!instrumentId) return [];
  const params = new URLSearchParams({action:"query",list:"search",srsearch:`haswbstatement:P1303=${instrumentId}`,srnamespace:"0",srlimit:"30",format:"json",origin:"*"});
  const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`);
  if (!response.ok) return [];
  const results = (await response.json()).query?.search || [];
  const entities = await fetchWikidataEntities(results.map((result) => result.title),"labels|descriptions");
  const roleTerms={guitar:["guitarist"],bass:["bassist","bass player"],piano:["pianist"],drums:["drummer"],accordion:["accordionist","accordion player"],saxophone:["saxophonist"],violin:["violinist"],sitar:["sitarist","sitar player"]};
  const term=sortKey(query || "");
  const roles=Object.entries(roleTerms).find(([name])=>term.includes(name))?.[1] || [term];
  return Object.values(entities).filter(entity=>entity.labels?.en?.value && roles.some(role=>role && String(entity.descriptions?.en?.value || "").toLowerCase().includes(role))).sort((a,b)=>a.labels.en.value.localeCompare(b.labels.en.value)).slice(0,12).map((entity) => ({
    name:entity.labels.en.value,
    era:"Documented Player",
    contribution:entity.descriptions?.en?.value || "",
    sourceUrl:`https://www.wikidata.org/wiki/${entity.id}`
  }));
}

async function fetchAutomaticInstrumentLandmarks(query) {
  const searches = [`"${query}" "studio album"`,`"${query}" "live album"`,`"${query}" "debut album"`,`"${query}" "personnel" album`];
  const results = await Promise.allSettled(searches.map(search => fetchWikipediaSearchPages(search,20)));
  if (results.every(result=>result.status==="rejected")) throw new Error("Album research unavailable");
  const candidates=new Map();
  for(const result of results) if(result.status==="fulfilled") for(const page of result.value) {
    if(isAlbumArticle(page) || /\([^)]*album[^)]*\)/i.test(page.title)) candidates.set(page.pageid,page);
  }
  const queued=[...candidates.values()].sort((a,b)=>wikipediaViews(b)-wikipediaViews(a)).slice(0,100);
  const pages=[];let next=0;
  const worker=async()=>{
    while(next<queued.length) {
      const page=queued[next++];
      try {
        // MediaWiki permits only one whole-article extract per request.
        const params=new URLSearchParams({action:"query",pageids:String(page.pageid),prop:"extracts",explaintext:"1",format:"json",origin:"*"});
        const data=await fetchJson(`https://en.wikipedia.org/w/api.php?${params}`,30000);
        const text=String(data.query?.pages?.[page.pageid]?.extract || "");
        const term=sortKey(query).replace(/^electric /,"");
        const lines=text.split(/[\n.!?]+/).map(line=>line.trim()).filter(line=>line.length>8 && sortKey(line).includes(term));
        const credit=lines.find(line=>/[–—−-]|\b(?:play(?:s|ed|ing)?|perform|featur|instrument|sitarist|musician|credit|arrang|solo)\b/i.test(line) && !/\b(?:no |without |does not |did not )/i.test(line));
        if(credit && isAlbumArticle({...page,extract:text})) {
          const position=credit.toLowerCase().indexOf(term.toLowerCase());
          const offset=Math.max(0,position-100);
          pages.push({...page,extract:text,instrumentEvidence:(offset ? "…" : "")+credit.slice(offset,offset+240)+(credit.length>offset+240 ? "…" : "")});
        }
      } catch(error) {/* Keep independently verified articles if another source fails. */}
    }
  };
  await Promise.all([worker(),worker(),worker(),worker()]);
  const pageRows=pages.sort((a,b)=>wikipediaViews(b)-wikipediaViews(a));
  const allEntities=async(ids,props)=> {
    const unique=[...new Set(ids.filter(Boolean))], entities={};
    for(let index=0;index<unique.length;index+=50) {
      try {Object.assign(entities,await fetchWikidataEntities(unique.slice(index,index+50),props));} catch(error) {/* Album introductions provide an independent artist fallback. */}
    }
    return entities;
  };
  const entities=await allEntities(pageRows.map(page=>page.pageprops?.wikibase_item),"labels|claims");
  const performers=await allEntities(Object.values(entities).flatMap(entity=>wikidataClaimIds(entity,"P175")),"labels");
  return pageRows.flatMap(page=>{
    const entity=entities[page.pageprops?.wikibase_item];
    const names=wikidataClaimIds(entity,"P175").map(id=>performers[id]?.labels?.en?.value).filter(Boolean);
    if(!names.length) {
      const lead=String(page.extract || "").split("\n")[0];
      const credited=lead.match(/\balbum by (.+?)(?:,|\. |\.$| released | recorded | from )/i)?.[1]?.replace(/^(?:the )?(?:(?:American|British|English|Scottish|Indian|Canadian|Australian|Norwegian|German|French|Swedish|Japanese|Welsh) )?(?:(?:rock|folk|psychedelic|jazz|blues|pop|progressive|alternative|electronic|classical|fusion|heavy metal|sitar|and) )*(?:band|group|duo|trio|musician|sitarist|guitarist|singer-songwriter|singer|composer|pianist|bassist|artist) /i,"").trim();
      if(credited && credited.length<100) names.push(credited);
    }
    if(!names.length) return [];
    return [{artist:names.slice(0,3).join(" & "),artistAliases:names,title:page.title.replace(/\s*\((?:[^)]*album[^)]*|soundtrack)\)\s*$/i,""),year:wikidataYear(entity) || page.extract.split("\n")[0].match(/\b(?:18|19|20)\d{2}\b/)?.[0] || "",importance:"Sourced Instrument Connection",credit:page.instrumentEvidence,note:`The linked album article identifies ${query} in its instrumentation or performance discussion. Check the source for the particular track or edition.`,sourceUrl:page.fullurl,documented:true}];
  });
}

function scoreInstrumentLandmark(entry) {
  const significance=/essential|master performance/i.test(entry.importance) ? 60 : /landmark|historic|pioneer/i.test(entry.importance) ? 52 : 40;
  const artistCounts=getInstrumentLibraryIndex().artists;
  const depth=[...new Set([entry.artist,...(entry.artistAliases || [])].map(songArtistKey))].reduce((sum,artist)=>sum+(artistCounts.get(artist)||0),0);
  const artistFit=depth ? Math.min(20,10+Math.round(Math.log2(depth+1)*2)) : 0;
  const evidence=entry.sourceUrl ? 20 : 15;
  return {...entry,score:Math.min(100,significance+artistFit+evidence),scoreReason:`Musical significance ${significance}/60 · artist connection ${artistFit}/20 · source detail ${evidence}/20`};
}

function instrumentTitleKey(title,artist) {
  const original=recommendationTitleKey(title,artist);
  const name=recommendationArtistKey(artist);
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const key=(escaped ? original.replace(new RegExp("\\b"+escaped+"\\b","g")," ") : original).replace(/\bthe\b/g,"").replace(/\bcollection\b/g,"").replace(/\s+/g," ").trim();
  return key || original;
}
function mergeInstrumentLandmarks(curated,discovered) {
  const rows=[];
  const artists=entry=>[entry.artist,...(entry.artistAliases || [])].flatMap(name=>[name,...name.split(/\s+(?:&|and|\/)\s+/)]).map(recommendationArtistKey);
  for(const entry of [...curated,...discovered]) {
    const title=instrumentTitleKey(entry.title,entry.artist), names=artists(entry);
    const previous=rows.find(row=>instrumentTitleKey(row.title,row.artist)===title && artists(row).some(name=>names.includes(name)));
    if(!previous) rows.push({...entry});
    else {
      previous.sourceUrl ||= entry.sourceUrl;
      previous.artistAliases=[...new Set([...(previous.artistAliases || []),entry.artist,...(entry.artistAliases || [])])];
    }
  }
  return rows.map(scoreInstrumentLandmark).sort((a,b)=>b.score-a.score || (a.rank||999)-(b.rank||999) || a.title.localeCompare(b.title)).map((entry,index)=>({...entry,rank:index+1}));
}

async function buildAutomaticInstrumentGuide(query) {
  const key = sortKey(query);
  if (dynamicInstrumentGuides.has(key)) return dynamicInstrumentGuides.get(key);
  const articleQueries = [`intitle:\"${query}\" musical instrument`,`\"${query}\" musical instrument`];
  let article = null;
  for (const search of articleQueries) {
    article = await fetchWikipediaSummary(search).catch(() => null);
    if (article?.extract) break;
  }
  const instrumentId = article?.pageprops?.wikibase_item || "";
  const [players,landmarks] = await Promise.all([
    fetchAutomaticInstrumentPlayers(instrumentId,query).catch(() => []),
    fetchAutomaticInstrumentLandmarks(query).catch(() => [])
  ]);
  const guide = {
    title:article?.title || String(query).replace(/\b\w/g,(letter) => letter.toLocaleUpperCase()),
    aliases:[query],
    introLabel:"HISTORY & WHY IT MATTERS",
    introduction:article?.extract || `Miles found verified credits for ${query}, but a reliable instrument history was not returned on this attempt.`,
    sourceLabel:`Read the ${query} history source`,
    sourceUrl:article?.fullurl || `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(`${query} musical instrument`)}`,
    players,
    landmarks,
    automatic:true
  };
  dynamicInstrumentGuides.set(key,guide);
  return guide;
}

const INSTRUMENT_GUIDES = {
  sitar: {
    title:"Sitar",
    aliases:["sitar","electric sitar"],
    introduction:"The sitar is a long-necked plucked lute central to Hindustani classical music. Its curved frets allow wide, vocal-like bends, while sympathetic strings ring beneath the melody and create its characteristic halo of resonance. Modern concert styles were shaped by several gharanas, especially the Maihar and Etawah traditions. Ravi Shankar became its most influential international ambassador; Nikhil Banerjee brought extraordinary depth and introspection to the Maihar style; and Vilayat Khan developed a highly vocal gayaki-ang approach. The instrument entered Western popular music during the 1960s, but its history, repertoire and greatest masters extend far beyond that crossover moment.",
    sourceLabel:"Read the sitar history source",
    sourceUrl:"https://en.wikipedia.org/wiki/Sitar",
    players:[
      {name:"Ravi Shankar",aliases:["Shankar, Ravi"],era:"Maihar gharana · 1920–2012",contribution:"The sitar’s foremost global ambassador, a major concert artist and composer who introduced generations of international listeners to Hindustani classical music."},
      {name:"Nikhil Banerjee",aliases:["Banerjee, Nikhil"],era:"Maihar gharana · 1931–1986",contribution:"A master of expansive alap, melodic architecture and spiritual intensity; widely regarded alongside Ravi Shankar and Vilayat Khan as one of the defining sitarists of the twentieth century."},
      {name:"Vilayat Khan",aliases:["Khan, Vilayat"],era:"Etawah gharana · 1928–2004",contribution:"The supreme exponent of gayaki ang, reshaping sitar technique to emulate the continuous bends, ornamentation and emotional inflection of Hindustani vocal music."},
      {name:"Imrat Khan",aliases:["Khan, Imrat"],era:"Etawah gharana · 1935–2018",contribution:"A leading master of both sitar and surbahar who carried the Imdadkhani/Etawah family tradition to international audiences."},
      {name:"Anoushka Shankar",aliases:["Shankar, Anoushka"],era:"Contemporary · born 1981",contribution:"A virtuoso who extends her father Ravi Shankar’s lineage through classical performance, original composition and collaborations spanning flamenco, electronic and global music."},
      {name:"Shahid Parvez Khan",aliases:["Khan, Shahid Parvez"],era:"Etawah gharana · born 1958",contribution:"A leading contemporary exponent celebrated for brilliant rhythmic command, lyrical phrasing and the vocal character of his sitar."},
      {name:"Budhaditya Mukherjee",aliases:["Mukherjee, Budhaditya"],era:"Imdadkhani gharana · born 1955",contribution:"A major modern concert sitarist known for tonal refinement, rigorous raga development and formidable technique."},
      {name:"George Harrison",aliases:["Harrison, George"],era:"Western crossover · 1943–2001",contribution:"A student of Ravi Shankar who brought the sound of the sitar into the Beatles’ music and used his fame to direct Western listeners toward Indian classical tradition."}
    ],
    landmarks:[
      {rank:1,artist:"Ravi Shankar",artistAliases:["Shankar, Ravi"],title:"Three Ragas",year:"1956",importance:"Essential",credit:"Ravi Shankar · sitar",note:"A foundational LP-length introduction to Shankar’s concert art, featuring Raga Jog, Ahir Bhairav and Simhendra Madhyamam."},
      {rank:2,artist:"Ravi Shankar",artistAliases:["Shankar, Ravi"],title:"The Sounds of India",year:"1957",importance:"Essential",credit:"Ravi Shankar · sitar",note:"Shankar explains raga, tala and improvisation before performing, making this one of the clearest gateways into Hindustani classical music."},
      {rank:3,artist:"Vilayat Khan",artistAliases:["Khan, Vilayat"],title:"Raga Yaman",year:"1960",importance:"Master performance",credit:"Vilayat Khan · sitar",note:"A representative document of Khan’s vocalized gayaki-ang approach and command of long-form raga development."},
      {rank:4,artist:"The Beatles",title:"Rubber Soul",titleAliases:["Rubber Soul - Stereo","Rubber Soul - Mono"],year:"1965",importance:"Crossover landmark",credit:"George Harrison · sitar on “Norwegian Wood”",note:"The recording that made the sitar immediately recognizable to millions of Western pop listeners."},
      {rank:5,artist:"The Beatles",title:"Revolver",year:"1966",importance:"Crossover landmark",credit:"George Harrison · sitar on “Love You To”",note:"Harrison moved beyond decoration toward a composition substantially organized around Indian instruments and musical ideas."},
      {rank:6,artist:"The Rolling Stones",title:"Aftermath",year:"1966",importance:"Crossover landmark",credit:"Brian Jones · sitar on “Paint It, Black”",note:"One of rock’s most famous sitar parts, using the instrument as the central recurring hook."},
      {rank:7,artist:"Donovan",title:"Sunshine Superman",year:"1966",importance:"Psychedelic landmark",credit:"Shawn Phillips · sitar",note:"An early folk-psychedelic album whose instrumentation helped establish the sitar within the era’s expanding studio palette."},
      {rank:8,artist:"Ravi Shankar",artistAliases:["Shankar, Ravi"],title:"Live at the Monterey International Pop Festival",titleAliases:["At the Monterey International Pop Festival"],year:"1967",importance:"Historic concert",credit:"Ravi Shankar · sitar",note:"Shankar’s Monterey appearance became a decisive encounter between Indian classical performance and the rock-festival audience."},
      {rank:9,artist:"The Beatles",title:"Sgt. Pepper's Lonely Hearts Club Band",year:"1967",importance:"Crossover landmark",credit:"George Harrison · sitar on “Within You Without You”",note:"A fully realized Indian classical ensemble and philosophical centerpiece placed inside the defining pop album of its era."},
      {rank:10,artist:"The Incredible String Band",title:"The 5000 Spirits or the Layers of the Onion",titleAliases:["The 5000 Spirits Or The Layers Of The Onion"],year:"1967",importance:"Folk landmark",credit:"Mike Heron · sitar",note:"British psychedelic folk absorbed sitar color into an eclectic acoustic language distinct from mainstream rock."},
      {rank:11,artist:"Yehudi Menuhin & Ravi Shankar",artistAliases:["Ravi Shankar & Yehudi Menuhin","Menuhin, Yehudi / Shankar, Ravi"],title:"West Meets East",year:"1967",importance:"Cross-cultural landmark",credit:"Ravi Shankar · sitar; Yehudi Menuhin · violin",note:"A landmark collaboration that presented Indian and Western classical traditions in direct musical dialogue."},
      {rank:12,artist:"George Harrison",artistAliases:["Harrison, George"],title:"Wonderwall Music",year:"1968",importance:"Fusion landmark",credit:"Indian classical ensemble with sitar",note:"Harrison’s soundtrack joined Indian classical performers, studio composition and Western rock instrumentation."},
      {rank:13,artist:"Nikhil Banerjee",artistAliases:["Banerjee, Nikhil"],title:"Afternoon Ragas",year:"1970",importance:"Essential",credit:"Nikhil Banerjee · sitar",note:"A major document of Banerjee’s patient development, tonal control and deeply meditative Maihar style."},
      {rank:14,artist:"Nikhil Banerjee",artistAliases:["Banerjee, Nikhil"],title:"Le Sitar de Pandit Nikhil Banerjee",titleAliases:["Le Sitar de Pandit Nikhil Banerjee (Traditions classiques de l'orient - Inde Vol.1)"],year:"1976",importance:"Master performance",credit:"Nikhil Banerjee · sitar",note:"An extended classical presentation that captures Banerjee’s balance of lyrical introspection and rhythmic power."},
      {rank:15,artist:"Nikhil Banerjee",artistAliases:["Banerjee, Nikhil"],title:"The Hundred-Minute Raga: Purabi Kalyan",year:"1982",importance:"Essential",credit:"Nikhil Banerjee · sitar",note:"A monumental live performance that gives Banerjee room for exceptionally broad and unhurried raga development."},
      {rank:16,artist:"Kula Shaker",title:"K",year:"1996",importance:"Revival landmark",credit:"Crispian Mills · sitar and Indian-influenced guitar",note:"A prominent 1990s British psychedelic revival that returned Indian instrumentation and spiritual references to the rock mainstream."},
      {rank:17,artist:"Anoushka Shankar",artistAliases:["Shankar, Anoushka"],title:"Rise",year:"2005",importance:"Contemporary landmark",credit:"Anoushka Shankar · sitar",note:"An original, composition-led album that established Shankar’s identity beyond the traditional recital format."},
      {rank:18,artist:"Anoushka Shankar",artistAliases:["Shankar, Anoushka"],title:"Traveller",year:"2011",importance:"Fusion landmark",credit:"Anoushka Shankar · sitar",note:"A sustained dialogue between Hindustani music and flamenco built around shared improvisational and rhythmic ideas."},
      {rank:19,artist:"Anoushka Shankar",artistAliases:["Shankar, Anoushka"],title:"Traces of You",year:"2013",importance:"Contemporary landmark",credit:"Anoushka Shankar · sitar",note:"A personal, collaborative album linking classical lineage, songwriting and modern production."},
      {rank:20,artist:"Anoushka Shankar",artistAliases:["Shankar, Anoushka"],title:"Land of Gold",year:"2016",importance:"Contemporary landmark",credit:"Anoushka Shankar · sitar",note:"A politically engaged work using sitar within a cinematic global ensemble shaped by migration and displacement."}
    ]
  },
  moog: {
    title:"Moog",
    aliases:["moog","moog synthesizer","minimoog","moog modular","moog iii","moog iiic"],
    introduction:"The Moog changed the synthesizer from a laboratory curiosity into a recognizable musical voice. Wendy Carlos proved it could sustain an entire bestselling album; rock, progressive, jazz, soul and electronic artists then used it for melody, bass, texture and sequenced motion.",
    sourceLabel:"Read the Moog history source",
    sourceUrl:"https://en.wikipedia.org/wiki/Moog_synthesizer",
    landmarks:[
      {rank:1,artist:"Wendy Carlos",artistAliases:["Carlos, Wendy"],title:"Switched-On Bach",titleAliases:["Switched‐On Bach"],year:"1968",importance:"Essential",credit:"Wendy Carlos · Moog modular",note:"The commercial and artistic breakthrough that brought the Moog into mainstream consciousness."},
      {rank:2,artist:"The Beatles",title:"Abbey Road",year:"1969",importance:"Essential",credit:"George Harrison, John Lennon and Paul McCartney · Moog",note:"The Beatles integrated Harrison’s new Moog into several late-period studio arrangements, including “Here Comes the Sun” and “Because.”"},
      {rank:3,artist:"The Monkees",title:"Pisces, Aquarius, Capricorn & Jones Ltd.",year:"1967",importance:"Pioneer",credit:"Micky Dolenz and Paul Beaver · Moog",note:"One of the earliest rock albums to feature the instrument prominently."},
      {rank:4,artist:"The Doors",title:"Strange Days",year:"1967",importance:"Pioneer",credit:"Paul Beaver · Moog",note:"The title track is among the earliest prominent Moog appearances on a rock record."},
      {rank:5,artist:"George Harrison",artistAliases:["Harrison, George"],title:"Electronic Sound",year:"1969",importance:"Pioneer",credit:"George Harrison and Bernie Krause · Moog IIIP",note:"A full LP of experimental Moog recordings released on Apple’s Zapple label."},
      {rank:6,artist:"Wendy Carlos",artistAliases:["Carlos, Wendy"],title:"The Well-Tempered Synthesizer",year:"1969",importance:"Landmark",credit:"Wendy Carlos · Moog modular",note:"Carlos expanded the classical electronic language established by Switched-On Bach."},
      {rank:7,artist:"Wendy Carlos",artistAliases:["Carlos, Wendy"],title:"Clockwork Orange",titleAliases:["A Clockwork Orange"],year:"1971",importance:"Landmark",credit:"Wendy Carlos · Moog modular",note:"A defining electronic film score whose synthesized Beethoven became part of the film’s identity."},
      {rank:8,artist:"Emerson, Lake & Palmer",title:"Emerson, Lake & Palmer",year:"1970",importance:"Essential",credit:"Keith Emerson · Moog modular",note:"The “Lucky Man” solo helped establish the Moog as a lead instrument in progressive rock."},
      {rank:9,artist:"Emerson, Lake & Palmer",title:"Tarkus",year:"1971",importance:"Landmark",credit:"Keith Emerson · Moog modular",note:"A major progressive-rock showcase for Emerson’s expanding keyboard and Moog vocabulary."},
      {rank:10,artist:"Popol Vuh",title:"Affenstunde",year:"1970",importance:"Pioneer",credit:"Florian Fricke · Moog III",note:"An early German electronic landmark built around Fricke’s large Moog modular system."},
      {rank:11,artist:"Popol Vuh",title:"In den Gärten Pharaos",titleAliases:["In Den Gärten Pharaos"],year:"1971",importance:"Landmark",credit:"Florian Fricke · Moog III",note:"Fricke used the Moog for spacious, meditative electronic composition before largely abandoning it."},
      {rank:12,artist:"Tonto's Expanding Head Band",title:"Zero Time",year:"1971",importance:"Landmark",credit:"Malcolm Cecil and Robert Margouleff · TONTO modular system",note:"A foundational demonstration of TONTO, a multitimbral system incorporating Moog modules."},
      {rank:13,artist:"Stevie Wonder",artistAliases:["Wonder, Stevie"],title:"Music of My Mind",titleAliases:["Music Of My Mind"],year:"1972",importance:"Essential",credit:"Stevie Wonder, Malcolm Cecil and Robert Margouleff · TONTO/Moog",note:"The beginning of Wonder’s classic synthesizer-rich run with Cecil and Margouleff."},
      {rank:14,artist:"Stevie Wonder",artistAliases:["Wonder, Stevie"],title:"Talking Book",year:"1972",importance:"Essential",credit:"Stevie Wonder, Malcolm Cecil and Robert Margouleff · TONTO/Moog",note:"Moog-derived TONTO textures became part of Wonder’s new, self-directed studio language."},
      {rank:15,artist:"Stevie Wonder",artistAliases:["Wonder, Stevie"],title:"Innervisions",year:"1973",importance:"Essential",credit:"Stevie Wonder, Malcolm Cecil and Robert Margouleff · TONTO/Moog",note:"Synth bass, leads and orchestration are central to one of the defining albums of the 1970s."},
      {rank:16,artist:"Herbie Hancock",artistAliases:["Hancock, Herbie"],title:"Crossings",year:"1972",importance:"Pioneer",credit:"Patrick Gleeson · Moog III",note:"A landmark meeting of electric jazz and studio-added modular synthesis."},
      {rank:17,artist:"Herbie Hancock",artistAliases:["Hancock, Herbie"],title:"Sextant",year:"1973",importance:"Landmark",credit:"Patrick Gleeson and Herbie Hancock · Moog/ARP synthesizers",note:"A dense, futuristic fusion album shaped by early synthesizer sequencing and processing."},
      {rank:18,artist:"Tangerine Dream",title:"Phaedra",year:"1974",importance:"Essential",credit:"Christopher Franke · Moog modular sequencer",note:"Its unstable sequenced pulse became a cornerstone of the Berlin School electronic sound."},
      {rank:19,artist:"Tangerine Dream",title:"Rubycon",year:"1975",importance:"Landmark",credit:"Christopher Franke · Moog modular sequencer",note:"A deeper, more fluid development of the sequencer-driven language introduced on Phaedra."},
      {rank:20,artist:"Kraftwerk",title:"Autobahn",year:"1974",importance:"Essential",credit:"Kraftwerk · Minimoog and other electronics",note:"A global electronic breakthrough that used the Minimoog within a carefully engineered travel soundscape."},
      {rank:21,artist:"Isao Tomita",artistAliases:["Tomita, Isao (冨田勲)"],title:"Snowflakes Are Dancing",year:"1974",importance:"Landmark",credit:"Isao Tomita · Moog III and modular synthesizers",note:"Debussy orchestrated as vivid multitracked electronic color."},
      {rank:22,artist:"Mort Garson",artistAliases:["Garson, Mort"],title:"Mother Earth's Plantasia",year:"1976",importance:"Cult landmark",credit:"Mort Garson · Moog synthesizer",note:"A once-obscure plant-themed Moog record that became a widely rediscovered electronic classic."},
      {rank:23,artist:"Jean-Michel Jarre",artistAliases:["Jarre, Jean-Michel"],title:"Oxygène",titleAliases:["Oxygene"],year:"1976",importance:"Essential",credit:"Jean-Michel Jarre · Minimoog and other synthesizers",note:"A melodic electronic blockbuster whose analog palette helped define home-listening electronica."},
      {rank:24,artist:"Rick Wakeman",artistAliases:["Wakeman, Rick"],title:"The Six Wives of Henry VIII",titleAliases:["The Six Wives Of Henry VIII"],year:"1973",importance:"Landmark",credit:"Rick Wakeman · Minimoog",note:"A virtuoso keyboard album that placed Minimoog leads beside organ, piano and Mellotron."},
      {rank:25,artist:"Giorgio Moroder",artistAliases:["Moroder, Giorgio"],title:"From Here to Eternity",titleAliases:["From Here To Eternity"],year:"1977",importance:"Landmark",credit:"Giorgio Moroder · Moog synthesizer and sequencer",note:"An all-electronic disco suite built from machine pulse and synthetic texture."}
    ]
  },
  accordion: {
    title:"Accordion",
    aliases:["accordion","accordian","piano accordion","button accordion","diatonic accordion","chromatic accordion","squeezebox"],
    introLabel:"HISTORY & WHY IT MATTERS",
    introduction:[
      "The accordion is a portable, bellows-driven free-reed instrument: air pushed or pulled through metal reeds creates the tone, while buttons or a piano-style keyboard select notes and chords. Cyrill Demian patented an early instrument called the accordion in Vienna in 1829. Makers rapidly expanded that compact design into many regional families, including piano and chromatic-button accordions, diatonic button boxes, the concertina and the bandoneon.",
      "Its portability, volume and ability to carry melody, bass and harmony at once made it a traveling orchestra. During the nineteenth and twentieth centuries it moved through European folk and dance traditions, Argentine tango, French musette, Italian and Irish music, Mexican conjunto and norteño, Louisiana Cajun and Creole zydeco, Brazilian forró, Colombian cumbia, Ethiopian popular music and South African famo.",
      "On record, the accordion can be the entire rhythmic engine or a flash of color inside rock and pop. Astor Piazzolla reinvented tango around the bandoneon; Clifton Chenier electrified Creole dance music into modern zydeco; Narciso Martínez and Flaco Jiménez defined generations of conjunto; and artists from Paul Simon and Tom Waits to Arcade Fire, Beirut and Weird Al Yankovic carried its breathing sound into the album era."
    ],
    sourceLabel:"Read the accordion history source",
    sourceUrl:"https://en.wikipedia.org/wiki/Accordion",
    players:[
      {name:"Cyrill Demian",era:"Early development · 1772–1847",contribution:"The Viennese instrument maker whose 1829 patent named an early chord-producing free-reed instrument the accordion."},
      {name:"Astor Piazzolla",aliases:["Piazzolla, Astor"],era:"Nuevo tango · 1921–1992",contribution:"A bandoneon virtuoso and composer who fused tango with counterpoint, jazz harmony and concert-music ambition."},
      {name:"Clifton Chenier",aliases:["Chenier, Clifton"],era:"Zydeco · 1925–1987",contribution:"The King of Zydeco, whose amplified piano accordion joined Creole tradition to blues and rhythm and blues."},
      {name:"Narciso Martínez",aliases:["Martinez, Narciso","Martínez, Narciso"],era:"Conjunto · 1911–1992",contribution:"The Father of Conjunto Music, celebrated for establishing the button accordion as a nimble melodic lead over bajo sexto."},
      {name:"Flaco Jiménez",aliases:["Jimenez, Flaco","Jiménez, Flaco"],era:"Conjunto and roots music · born 1939",contribution:"A defining Tex-Mex accordionist whose collaborations carried conjunto phrasing into country, rock and roots music."},
      {name:"Buckwheat Zydeco",aliases:["Zydeco, Buckwheat"],era:"Zydeco crossover · 1947–2016",contribution:"Stanley Dural Jr. brought zydeco accordion to major-label albums, international tours and a broad rock audience."},
      {name:"Hailu Mergia",aliases:["Mergia, Hailu"],era:"Ethiopian jazz and popular music · born 1946",contribution:"A keyboardist and accordionist whose hypnotic solo recordings link Ethiopian modes, jazz improvisation and home-studio intimacy."},
      {name:"Sharon Shannon",aliases:["Shannon, Sharon"],era:"Irish traditional and contemporary · born 1968",contribution:"A virtuoso button accordionist who brought Irish dance music into wide-ranging folk, rock and global collaborations."},
      {name:"Richard Galliano",aliases:["Galliano, Richard"],era:"New musette and jazz · born 1950",contribution:"A French accordionist who renewed the musette tradition through jazz improvisation and concert repertory."},
      {name:"Forere Motloheloa",era:"Lesotho famo · twentieth century",contribution:"The accordionist and songwriter whose music became the foundation of Paul Simon’s “The Boy in the Bubble.”"},
      {name:"Régine Chassagne",aliases:["Chassagne, Régine"],era:"Indie rock · born 1976",contribution:"Arcade Fire’s multi-instrumentalist uses accordion as both an intimate folk voice and part of the band’s orchestral scale."},
      {name:"Weird Al Yankovic",aliases:["Yankovic, Weird Al","Yankovic, “Weird Al”"],era:"Comedy and pop · born 1959",contribution:"He made accordion a lead instrument in modern American comedy music, virtuosic polka medleys and original pop songs."}
    ],
    landmarks:[
      {rank:1,artist:"Clifton Chenier",artistAliases:["Chenier, Clifton"],title:"Bogalusa Boogie",year:"1976",importance:"Zydeco essential",credit:"Clifton Chenier · accordion and vocals",note:"A definitive document of Chenier’s Red Hot Louisiana Band and the blues-driven, dance-floor force of modern zydeco."},
      {rank:2,artist:"Astor Piazzolla",artistAliases:["Piazzolla, Astor"],title:"Libertango",year:"1974",importance:"Tango essential",credit:"Astor Piazzolla · bandoneon",note:"The signature statement of Piazzolla’s nuevo tango, with the accordion family’s bandoneon driving a modern rhythmic and harmonic language."},
      {rank:3,artist:"Flaco Jiménez",artistAliases:["Jimenez, Flaco","Jiménez, Flaco"],title:"Partners",year:"1992",importance:"Conjunto landmark",credit:"Flaco Jiménez · button accordion",note:"A celebrated set of collaborations that places Jiménez’s conjunto accordion beside country, rock and roots singers."},
      {rank:4,artist:"Narciso Martínez",artistAliases:["Martinez, Narciso","Martínez, Narciso"],title:"The Father of Conjunto Music",year:"1989",importance:"Conjunto foundation",credit:"Narciso Martínez · button accordion",note:"An essential collection by the musician whose fast, melodic right-hand style helped define Texas-Mexican conjunto."},
      {rank:5,artist:"Buckwheat Zydeco",artistAliases:["Zydeco, Buckwheat"],title:"On a Night Like This",year:"1987",importance:"Crossover landmark",credit:"Buckwheat Zydeco · accordion and vocals",note:"A major-label breakthrough that carried Louisiana zydeco onto rock radio and international stages."},
      {rank:6,artist:"Hailu Mergia",artistAliases:["Mergia, Hailu"],title:"Hailu Mergia & His Classical Instrument: Shemonmuanaye",titleAliases:["Hailu Mergia & His Classical Instrument","Shemonmuanaye"],year:"1985",importance:"Ethiopian landmark",credit:"Hailu Mergia · accordion, keyboards and drum machine",note:"A singular solo recording whose intimate accordion lines float through Ethiopian melodies and electronic rhythm."},
      {rank:7,artist:"Richard Galliano",artistAliases:["Galliano, Richard"],title:"New Musette",year:"1991",importance:"Jazz landmark",credit:"Richard Galliano · accordion",note:"The album that named Galliano’s renewal of French musette through jazz harmony, improvisation and virtuoso accordion."},
      {rank:8,artist:"Sharon Shannon",artistAliases:["Shannon, Sharon"],title:"Sharon Shannon",year:"1991",importance:"Irish landmark",credit:"Sharon Shannon · button accordion",note:"A landmark Irish debut that presents the button accordion with rhythmic lift, clarity and an open ear to contemporary collaboration."},
      {rank:9,artist:"Luiz Gonzaga",artistAliases:["Gonzaga, Luiz"],title:"O Sanfoneiro do Povo de Deus",year:"1968",importance:"Forró landmark",credit:"Luiz Gonzaga · sanfona (accordion) and vocals",note:"A major recording by the King of Baião, whose accordion made northeastern Brazilian forró a national popular language."},
      {rank:10,artist:"Kepa Junkera",artistAliases:["Junkera, Kepa"],title:"Bilbao 00:00h",year:"1998",importance:"Basque landmark",credit:"Kepa Junkera · trikitixa",note:"A wide-ranging showcase for the Basque diatonic accordion, connecting traditional dance forms with an international cast."},
      {rank:11,artist:"The Beach Boys",title:"Pet Sounds",titleAliases:["Pet Sounds (50th Anniversary Edition)","Pet Sounds (MFSL)"],year:"1966",importance:"Studio-pop landmark",credit:"Carl Fortina and Frank Marocco · accordions",note:"Layered accordions help give “Wouldn’t It Be Nice” its bright, surging orchestral texture."},
      {rank:12,artist:"The Band",title:"The Band",titleAliases:["The Band (50th Anniversary Remix)","The Band (MFSL)"],year:"1969",importance:"Roots-rock landmark",credit:"Garth Hudson · accordion and keyboards",note:"Hudson’s accordion on “Rockin’ Chair” is central to the album’s weathered, communal American sound."},
      {rank:13,artist:"Bruce Springsteen",artistAliases:["Springsteen, Bruce"],title:"The Wild, the Innocent & the E Street Shuffle",titleAliases:["The Wild, The Innocent & The E Street Shuffle"],year:"1973",importance:"Rock landmark",credit:"Danny Federici · accordion on “4th of July, Asbury Park (Sandy)”",note:"Federici’s boardwalk accordion gives Springsteen’s early Jersey-shore epic much of its wistful sense of place."},
      {rank:14,artist:"Paul Simon",artistAliases:["Simon, Paul"],title:"Graceland",titleAliases:["Graceland (25th Anniversary Edition)"],year:"1986",importance:"Global-pop landmark",credit:"Forere Motloheloa · accordion on “The Boy in the Bubble”",note:"Motloheloa’s rolling famo accordion figure became the rhythmic and melodic foundation of the album’s opening song."},
      {rank:15,artist:"Los Lobos",title:"How Will the Wolf Survive?",titleAliases:["How Will The Wolf Survive?"],year:"1984",importance:"Roots-rock landmark",credit:"David Hidalgo · accordion",note:"Los Lobos place East Los Angeles rock, conjunto and Mexican-American tradition in the same living musical continuum."},
      {rank:16,artist:"The Pogues",title:"Rum Sodomy & the Lash",titleAliases:["Rum Sodomy And The Lash"],year:"1985",importance:"Folk-punk landmark",credit:"James Fearnley · accordion",note:"Fearnley’s accordion is a melodic engine in the Pogues’ collision of Irish traditional music and punk velocity."},
      {rank:17,artist:"Tom Waits",artistAliases:["Waits, Tom"],title:"Rain Dogs",year:"1985",importance:"Art-rock landmark",credit:"William Schimmel · accordion",note:"Accordion adds wheeze, sway and old-city atmosphere to Waits’s junkyard orchestra."},
      {rank:18,artist:"They Might Be Giants",title:"Lincoln",year:"1988",importance:"Alternative landmark",credit:"John Linnell · accordion and keyboards",note:"Linnell made accordion an agile lead voice inside witty, economical American alternative pop."},
      {rank:19,artist:"Weird Al Yankovic",artistAliases:["Yankovic, Weird Al","Yankovic, “Weird Al”"],title:"“Weird Al” Yankovic",titleAliases:["\"Weird Al\" Yankovic"],year:"1983",importance:"Pop-culture landmark",credit:"Weird Al Yankovic · accordion and vocals",note:"Yankovic’s debut established the accordion as the signature instrument of a durable comedy-pop career."},
      {rank:20,artist:"Arcade Fire",title:"Funeral",year:"2004",importance:"Indie-rock landmark",credit:"Régine Chassagne and Richard Reed Parry · accordion",note:"Accordion helps Funeral move between parlor intimacy, folk memory and huge communal crescendos."},
      {rank:21,artist:"The Decemberists",title:"Picaresque",year:"2005",importance:"Indie-folk landmark",credit:"Jenny Conlee · accordion and keyboards",note:"Conlee’s accordion is essential to the album’s theatrical, maritime and old-world color."},
      {rank:22,artist:"A Hawk and a Hacksaw",title:"The Way the Wind Blows",year:"2006",importance:"Folk landmark",credit:"Jeremy Barnes · accordion",note:"A vivid meeting of American experimental folk and Balkan brass-and-accordion traditions."},
      {rank:23,artist:"Beirut",title:"The Flying Club Cup",year:"2007",importance:"Indie-folk landmark",credit:"Accordion within Beirut’s ensemble",note:"French chanson and Balkan-brass references place accordion inside Beirut’s sweeping, handmade orchestration."},
      {rank:24,artist:"Julieta Venegas",artistAliases:["Venegas, Julieta"],title:"Sí",titleAliases:["Si"],year:"2003",importance:"Latin-pop landmark",credit:"Julieta Venegas · accordion, keyboards and vocals",note:"Venegas brought accordion to the center of sleek, intimate Spanish-language alternative pop."},
      {rank:25,artist:"Yann Tiersen",artistAliases:["Tiersen, Yann"],title:"Le Fabuleux Destin d'Amélie Poulain",titleAliases:["Amélie","Amelie","Amélie: Original Soundtrack"],year:"2001",importance:"Soundtrack landmark",credit:"Yann Tiersen · accordion and multiple instruments",note:"The soundtrack made a wistful Parisian accordion palette newly familiar to an international audience."},
      {rank:26,artist:"Neutral Milk Hotel",title:"In the Aeroplane Over the Sea",year:"1998",importance:"Indie landmark",credit:"Julian Koster · accordion and other instruments",note:"Accordion is one strand in the album’s creaking, ecstatic acoustic sound world."},
      {rank:27,artist:"Calexico",title:"Feast of Wire",titleAliases:["Feast Of Wire"],year:"2003",importance:"Desert-rock landmark",credit:"Accordion within Calexico’s borderlands ensemble",note:"Accordion joins mariachi brass, pedal steel and post-rock texture in Calexico’s cinematic Southwest."}
    ]
  }
};

function entityKey(value = "") {
  return referenceArtistName(value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function instrumentGuideFor(query) {
  const key = sortKey(query);
  if(GUITAR_GUIDE.aliases.includes(key)) return GUITAR_GUIDE;
  const guide=Object.values(INSTRUMENT_GUIDES).find((guide) => guide.aliases.some((alias) => key.includes(alias) || alias.includes(key)));
  if(!guide) return null;
  const extra=EXTRA_INSTRUMENT_ALBUMS[sortKey(guide.title)] || [];
  return {...guide,landmarks:[...guide.landmarks,...extra]};
}

let instrumentLibraryIndex=null;
function getInstrumentLibraryIndex() {
  if(instrumentLibraryIndex?.collection===library) return instrumentLibraryIndex;
  const albums=new Map(),artists=new Map();
  for(const item of library) {
    const artist=songArtistKey(item.artist);
    artists.set(artist,(artists.get(artist)||0)+1);
    const key=entityKey(item.artist)+"|"+instrumentTitleKey(item.album,item.artist);
    if(!albums.has(key)) albums.set(key,[]);
    albums.get(key).push(item);
  }
  return instrumentLibraryIndex={collection:library,albums,artists};
}
function landmarkHoldings(landmark) {
  const index=getInstrumentLibraryIndex();
  const titles=[...new Set([landmark.title,...(landmark.titleAliases || [])].map(title=>instrumentTitleKey(title,landmark.artist)))];
  const artists=[...new Set([landmark.artist,...(landmark.artistAliases || [])].map(entityKey))];
  return [...new Set(artists.flatMap(artist=>titles.flatMap(title=>index.albums.get(artist+"|"+title) || [])))];
}

function groupedCreditEvidence(query) {
  const matches = creditEvidence.filter((entry) => sortKey(entry.role).includes(sortKey(query)) || sortKey(query).includes(sortKey(entry.role)));
  const groups = new Map();
  matches.forEach((entry) => {
    const key = `${entityKey(entry.artist)}|${canonicalTitle(entry.album)}`;
    if (!groups.has(key)) groups.set(key,{album:entry.album,artist:entry.artist,year:entry.year,people:new Set(),roles:new Set()});
    groups.get(key).people.add(entry.person);
    groups.get(key).roles.add(entry.role);
  });
  return [...groups.values()].map((entry) => ({...entry,people:[...entry.people].sort(),roles:[...entry.roles].sort()}));
}

function openUnownedAlbumReport(title,artist,year = "") {
  const item = {album:title,artist,year,genres:[],studio:"",ratingKey:""};
  renderAlbumDetail(item,true,true);
}

function instrumentLandmarkCard(entry,holdings) {
  const primary=holdings[0];
  const albumButton=primary
    ? `<button type="button" data-album="${escapeHtml(primary.album)}" data-artist="${escapeHtml(primary.artist)}">${escapeHtml(entry.title)}</button>`
    : `<button type="button" data-unowned-album data-album-title="${escapeHtml(entry.title)}" data-album-artist="${escapeHtml(entry.artist)}" data-album-year="${escapeHtml(entry.year || "")}">${escapeHtml(entry.title)}</button>`;
  return `<article class="instrument-landmark"><div class="instrument-landmark-head"><span>Album</span><b>${entry.score ?? "—"}<small> MILES / 100</small></b></div><h4>${albumButton}</h4><p class="instrument-album-meta"><button type="button" class="instrument-artist" data-report-scope="Artist" data-value="${escapeHtml(entry.artist)}">${escapeHtml(entry.artist)}</button>${entry.year ? ` · ${escapeHtml(entry.year)}` : ""}</p>${entry.description ? `<p>${escapeHtml(entry.description)}</p>` : ""}<small>${holdings.length ? `${holdings.length} Plex edition${holdings.length===1 ? "" : "s"}` : "No Plex Match"}</small>${entry.sourceUrl ? `<a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noreferrer">Source ↗</a>` : ""}${entry.scoreReason ? `<details><summary>Why This MILES Score?</summary><p>${escapeHtml(entry.scoreReason)}. MILES measures collection priority.</p></details>` : ""}${wishlistButton(entry.artist,entry.title,entry.year)}${compactStoreLinks(entry.title,entry.artist)}</article>`;
}

function instrumentPlayerCard(player) {
  const listen=player.listen;
  const holdings=listen?.type==="Album" ? landmarkHoldings({title:listen.title,artist:listen.artist,artistAliases:[...(listen.artistAliases || []),...(player.collectionArtists || [])]}) : [];
  const primary=holdings[0];
  const action=listen?.type==="Song" ? `data-report-scope="Song" data-value="${escapeHtml(listen.title)}" data-song-artist="${escapeHtml(listen.artist)}"` : primary ? `data-album="${escapeHtml(primary.album)}" data-artist="${escapeHtml(primary.artist)}"` : listen ? `data-unowned-album data-album-title="${escapeHtml(listen.title)}" data-album-artist="${escapeHtml(listen.artist)}" data-album-year="${escapeHtml(listen.year || "")}"` : "";
  return `<article class="instrument-player"><button type="button" data-report-scope="Artist" data-value="${escapeHtml(player.name)}"><strong>${escapeHtml(player.name)}</strong></button><p>${escapeHtml(player.contribution)}</p>${listen ? `<button type="button" class="guitar-starting-point" ${action}><small>Start With</small><strong>${escapeHtml(listen.title)}</strong><span>${escapeHtml(listen.artist)}${listen.year ? ` · ${escapeHtml(listen.year)}` : ""}</span></button>` : ""}${player.sourceUrl ? `<a href="${escapeHtml(player.sourceUrl)}" target="_blank" rel="noreferrer">${player.group ? "Guitar Contribution Source" : "Instrument Source"} ↗</a>` : ""}</article>`;
}

function instrumentPlayersHtml(guide) {
  const players=guide.players || [];
  if(!players.some(player=>player.group)) return `<div class="instrument-player-grid">${players.map(instrumentPlayerCard).join("")}</div>`;
  const groups=[...new Set(players.map(player=>player.group))];
  return groups.map(group=>`<h4 class="guitar-tradition">${escapeHtml(group)}</h4><div class="instrument-player-grid">${players.filter(player=>player.group===group).map(instrumentPlayerCard).join("")}</div>`).join("");
}

function instrumentArtistCollection(guide,owned) {
  const artists=new Set((guide.collectionArtists || []).map(recommendationArtistKey));
  if(!artists.size) return [];
  const documented=new Set(owned.flatMap(result=>result.holdings));
  const groups=new Map();
  for(const item of library) {
    if(documented.has(item) || !artists.has(recommendationArtistKey(item.artist))) continue;
    const key=recommendationArtistKey(item.artist)+"|"+canonicalTitle(item.album);
    if(!groups.has(key)) groups.set(key,{item,editions:[]});
    groups.get(key).editions.push(item);
  }
  return [...groups.values()].sort((a,b)=>referenceArtistName(a.item.artist).localeCompare(referenceArtistName(b.item.artist)) || String(a.item.year || "9999").localeCompare(String(b.item.year || "9999")) || a.item.album.localeCompare(b.item.album));
}

function instrumentArtistCollectionHtml(rows) {
  return `<section id="instrument-artist-albums" class="report-panel"><p class="eyebrow">MORE FROM YOUR COLLECTION</p><h3>${rows.length} More Albums By Featured Guitarists</h3><p class="muted">These match the featured guitarists or their bands as album artists. Individual performance credits have not been checked for every album.</p><div class="album-list">${rows.map(({item,editions})=>`<button type="button" class="album" data-album="${escapeHtml(item.album)}" data-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(referenceAlbumTitle(item.album))}</strong><span>${escapeHtml(referenceArtistName(item.artist))} · ${escapeHtml(item.year || "Year unknown")}${editions.length>1 ? ` · ${editions.length} editions` : ""}</span></button>`).join("")}</div></section>`;
}

async function renderRoleReport(query,addHistory = true) {
  const runId = ++reportRunId;
  MilesSections.begin();
  MilesResearch.reset();
  let guide = instrumentGuideFor(query);
  const encountered = groupedCreditEvidence(query);
  if (addHistory) addReportHistory({scope:"Instrument",query}); else syncReportNavigation();
  els.report.hidden = false;
  if (!guide) {
    els.reportContent.innerHTML = `<div class="report-header"><p class="eyebrow">AN INSTRUMENT INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">Researching the instrument automatically…</span></div><section class="report-panel"><p class="eyebrow">LIVE RESEARCH</p><h3>Building history, key players and album landmarks</h3><p class="muted">Miles is checking Wikipedia and Wikidata, ranking documented album uses, then comparing the results with all ${library.length.toLocaleString()} Plex albums.</p></section>`;
    els.report.scrollIntoView({behavior:"smooth",block:"start"});
    MilesResearch.start(runId,"Instrument",{albums:"Instrument History, Players & Album Credits"});
    guide = await buildAutomaticInstrumentGuide(query).catch(() => null);
    if(guide) MilesResearch.done(runId,"albums"); else MilesResearch.unavailable(runId,"albums");
    if (runId !== reportRunId) return;
    if (!guide) {
      els.reportContent.innerHTML = `<div class="report-header"><p class="eyebrow">AN INSTRUMENT INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">${encountered.length} verified album${encountered.length === 1 ? "" : "s"} encountered so far</span></div><section class="report-panel"><p class="eyebrow">VERIFIED CREDITS</p><h3>Grouped by album</h3>${encountered.length ? `<div class="credit-evidence">${encountered.map((entry) => `<article><button type="button" data-album="${escapeHtml(entry.album)}" data-artist="${escapeHtml(entry.artist)}"><strong>${escapeHtml(entry.album)}</strong><small>${escapeHtml(entry.artist)}${entry.year ? ` · ${escapeHtml(entry.year)}` : ""}</small></button><p>${escapeHtml(entry.people.join(", "))}</p></article>`).join("")}</div>` : `<p class="muted">No structured credits for this term have been verified yet.</p>`}<p class="fine-print">The research services did not return enough sourced material on this attempt. Miles has kept every verified MusicBrainz credit it already found.</p></section>`;
      return;
    }
  }
  const draw = () => {
  const researched = mergeInstrumentLandmarks(guide.landmarks,[]).map((entry) => ({entry,holdings:landmarkHoldings(entry)}));
  const owned = researched.filter((result) => result.holdings.length);
  const missing = researched.filter((result) => !result.holdings.length);
  const editionCount = owned.reduce((sum,result) => sum + result.holdings.length,0);
  const related=instrumentArtistCollection(guide,owned);
  const introduction = (Array.isArray(guide.introduction) ? guide.introduction : [guide.introduction]).map((paragraph) => biographyParagraphs(paragraph)).join("");
  replaceReportHtml(els.reportContent,`<div class="report-header"><p class="eyebrow">AN INSTRUMENT INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(guide.title)}</h2><span class="verdict">${researched.length} reference albums · ${owned.length} matched · ${editionCount} Plex editions${related.length ? ` · ${related.length} more artist matches` : ""}</span></div>
    <section class="report-panel instrument-intro"><p class="eyebrow">${escapeHtml(guide.introLabel || "WHY IT MATTERS")}</p><h3>${escapeHtml(guide.title)} in recorded music</h3>${introduction}<a href="${escapeHtml(guide.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(guide.sourceLabel)} ↗</a></section>
    ${guide.players?.length ? `<section id="instrument-players" class="report-panel"><p class="eyebrow">${escapeHtml(guide.playerHeading || (guide.automatic ? "Documented Players" : "Masters & Key Contributors"))}</p><h3>${escapeHtml(guide.playerHeading || (guide.automatic ? "Documented Instrument Associations" : `People Who Shaped The ${guide.title}`))}</h3>${guide.playerIntroduction ? `<p class="muted">${escapeHtml(guide.playerIntroduction)}</p>` : ""}${instrumentPlayersHtml(guide)}</section>` : ""}
    <section class="report-panel"><p class="eyebrow">YOUR COLLECTION</p><h3>${owned.length} Reference Albums Matched In Plex</h3><p class="muted">These are matches against ${researched.length} researched album titles, not a complete count of ${escapeHtml(guide.title.toLowerCase())} recordings in your library. Editions are grouped under each album.</p><div class="instrument-grid">${owned.map(({entry,holdings}) => instrumentLandmarkCard(entry,holdings)).join("") || `<p class="muted">No researched landmark titles were matched.</p>`}</div><p class="fine-print">Amazon and eBay buttons search by artist and main album title. As an Amazon Associate and eBay Partner Network Affiliate, I earn from qualifying purchases.</p></section>
    ${related.length ? instrumentArtistCollectionHtml(related) : ""}
    <section class="report-panel"><p class="eyebrow">LIVE MUSICBRAINZ EVIDENCE</p><h3>Verified credits from albums opened in this journey</h3>${encountered.length ? `<div class="credit-evidence">${encountered.map((entry) => `<article><button type="button" data-album="${escapeHtml(entry.album)}" data-artist="${escapeHtml(entry.artist)}"><strong>${escapeHtml(entry.album)}</strong><small>${escapeHtml(entry.artist)}${entry.year ? ` · ${escapeHtml(entry.year)}` : ""}</small></button><p>${escapeHtml(entry.people.join(", "))}</p><small>${escapeHtml(entry.roles.join(", "))}</small></article>`).join("")}</div>` : `<p class="muted">No opened album has supplied a structured ${escapeHtml(query)} credit yet.</p>`}</section>
    <details class="report-panel collapsible"><summary><span><small>NOTABLE GAPS</small><strong>Albums Ranked By MILES Score</strong></span><b>${missing.length}</b></summary><p class="muted">${missing.length} album gaps, ordered by MILES score from highest to lowest. Scores combine musical significance, artist connections and source detail.</p><div class="instrument-grid">${missing.map(({entry,holdings}) => instrumentLandmarkCard(entry,holdings)).join("")}</div><p class="fine-print">“Not matched” means no artist-and-title match in the current Plex snapshot. It is not proof that the music is absent from a compilation or box set.</p></details>`);
  };
  draw();
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  if(guide.expandAutomatically===false) {
    MilesResearch.start(runId,"Instrument",{albums:"Reference Albums & Collection Matches"});
    MilesResearch.done(runId,"albums");
  } else if (!guide.automatic) {
    MilesResearch.start(runId,"Instrument",{albums:"Additional Albums & Instrument Credits"});
    try {
      const extra=await fetchAutomaticInstrumentLandmarks(query);
      if(runId!==reportRunId) return;
      guide={...guide,landmarks:mergeInstrumentLandmarks(guide.landmarks,extra)};
      draw();
      MilesResearch.done(runId,"albums");
    } catch(error) {if(runId===reportRunId) MilesResearch.unavailable(runId,"albums");}
  }
}

function albumNeighbors(item) {
  const artist = songArtistKey(item.artist);
  const albums = [...new Map(library.filter((row) => songArtistKey(row.artist) === artist)
    .map((row) => [`${canonicalTitle(row.album)}|${row.year}`,row])).values()]
    .sort((a,b) => String(a.year || "9999").localeCompare(String(b.year || "9999")) || sortKey(a.album).localeCompare(sortKey(b.album)));
  const position = albums.findIndex((row) => item.ratingKey && row.ratingKey === item.ratingKey || row.album === item.album && row.year === item.year);
  if (position < 0) {
    const before = albums.filter((row) => row.year && row.year <= item.year);
    return {previous:before.at(-1) || null,next:albums.find((row) => row.year && row.year > item.year) || null,count:albums.length};
  }
  return {previous:albums[position-1] || null,next:albums[position+1] || null,count:albums.length};
}

function albumNeighborsHtml(item) {
  const {previous,next} = albumNeighbors(item);
  const link = (row,label) => row ? `<button type="button" class="album song-instance" data-album="${escapeHtml(row.album)}" data-artist="${escapeHtml(row.artist)}"><small>${label}</small><strong>${escapeHtml(row.album)}</strong><span>${escapeHtml(referenceArtistName(row.artist))} · ${escapeHtml(row.year || "Year unknown")}</span></button>` : `<p class="muted">No ${label.toLowerCase()} album in this Plex artist chronology.</p>`;
  return `<p class="eyebrow">NEXT IN THE CATALOG</p><h3>Before and after this album</h3><div class="album-list">${link(previous,"Previous owned release")}${link(next,"Next owned release")}</div><p class="fine-print">These neighbors follow the artist’s albums in your Plex catalog by year. They are not a claim about the complete official discography.</p>`;
}

function localAlbumTake(item, editions, group, tracks = []) {
  if (isWhiteAlbum(item)) {
    const mono = /\bmono\b/i.test(item.album);
    return "The White Album makes its sprawl the point: the intimacy of “Julia” and “Blackbird” shares space with the abrasion of “Helter Skelter” and the tape collage of “Revolution 9.” The shifts can feel funny, tender or threatening, sometimes within minutes. Listen to the final stretch: “Cry Baby Cry,” “Revolution 9” and “Good Night” turn a songbook into an unsettling bedtime sequence. Its four personalities pull apart, but the sequencing makes their contradictions speak to one another." +
      (mono ? " On this mono edition, listen for how voices, guitars and percussion compete inside one image; that concentration offers a different way into the album’s abrupt changes of scale." : "");
  }
  const sourced = sourcedAlbumFallback(item);
  // A take needs an album-specific musical argument. Do not substitute catalog counts.
  return sourced?.take || "";
}

function albumTakeHtml(item, editions, group, tracks = []) {
  const take = localAlbumTake(item,editions,group,tracks);
  return take ? `<div class="miles-take"><strong>The Miles Take</strong><p>${escapeHtml(take)}</p><p class="fine-print">Miles’ listening perspective</p></div>` : "";
}

function curatedAlbumBiography(item) {
  const artist = entityKey(item.artist);
  const title = canonicalTitle(item.album);
  if ((artist === "the beatles" || artist === "beatles") && title === "let it be naked") {
    return "Let It Be… Naked is a 2003 alternative presentation of the Beatles’ Let It Be material, assembled from the original 1969–70 recordings. Initiated by Paul McCartney, it removes Phil Spector’s later orchestral and choral overdubs, uses different edits and takes in places, and presents a revised running order intended to emphasize the band’s performances. “Don’t Let Me Down” is restored to the album sequence, while “Dig It” and “Maggie Mae” are omitted. The release is best understood as a companion interpretation rather than a replacement for the 1970 album: it reveals how dramatically editing, mixing and production choices can reshape the same sessions.";
  }
  return "";
}

function researchedAlbumBiography(item,group,release,tracks,personnel) {
  const artist = referenceArtistName(item.artist);
  const year = String(group?.["first-release-date"] || release?.date || item.year || "an uncertain date").slice(0,4);
  const labels = [...new Set((release?.["label-info"] || []).map((entry) => entry.label?.name).filter(Boolean))];
  const genres = (group?.genres || []).map((genre) => genre.name).filter(Boolean);
  const labelText = labels.length ? ` for ${labels.slice(0,2).join(" and ")}` : item.studio ? ` for ${item.studio}` : "";
  const genreText = genres.length || item.genres.length ? ` The catalog classifies it within ${[...genres,...item.genres].filter((value,index,array) => array.indexOf(value) === index).slice(0,4).join(", ")}.` : "";
  const trackText = tracks.length ? `The selected official reference edition contains ${tracks.length} tracks, opening with “${tracks[0].title}”${tracks.length > 1 ? ` and closing with “${tracks.at(-1).title}”` : ""}.` : "The available reference edition does not expose a complete track sequence.";
  const people = personnel.slice(0,5).map((person) => `${person.name} (${person.role})`);
  const personnelText = people.length ? `Its documented personnel include ${people.join(", ")}.` : "The selected reference edition does not yet carry structured personnel credits.";
  return `${group?.title || item.album} is a ${year} album by ${artist}${labelText}.${genreText} ${trackText} ${personnelText}`.replace(/\s+/g," ").trim();
}

async function loadAlbumEnrichment(item, editions, runId) {
  MilesResearch.start(runId,"Album",{biography:"Album Biography & Trivia",reference:"Tracks, Credits & Artwork",artist:"Artist Biography"});
  const overview = $("#album-overview"), tracksPanel = $("#album-tracks"), people = $("#album-personnel"), identity = $("#album-identity"), yearAudit = $("#album-year-audit"), yearStatus = $("#album-year-status"), artistBio = $("#album-artist-biography");
  try {
    const [referenceResult,albumWiki,artistWiki] = await Promise.all([
      MilesResearch.track(runId,"reference",fetchAlbumReference(item)).then((value) => ({value})).catch((error) => ({error})),
      MilesResearch.track(runId,"biography",fetchAlbumWikipediaSummary(item)),
      MilesResearch.track(runId,"artist",fetchArtistWikipediaSummary(item.artist))
    ]);
    if (runId !== reportRunId) return;
    artistBio.innerHTML = artistBiographyHtml(item.artist,artistWiki);
    if (!referenceResult.value && !albumWiki?.extract) throw referenceResult.error || new Error("No reliable album reference was found");
    if (!referenceResult.value) {
      const wikiArt = albumWiki.original?.source || albumWiki.thumbnail?.source || "";
      overview.innerHTML = `<p class="eyebrow">ALBUM BIOGRAPHY & CONTEXT</p><div class="album-story-layout">${albumArtwork(wikiArt,albumWiki.title || item.album)}<div class="album-story-copy"><h3>${escapeHtml(albumWiki.title || referenceAlbumTitle(item.album))}</h3>${biographyParagraphs(albumWiki.extract)}<a href="${escapeHtml(albumWiki.fullurl)}" target="_blank" rel="noreferrer">Read source article ↗</a></div></div>${albumPurchaseLinks(item.album,item.artist)}${albumFactsHtml(albumWiki,[],[],item)}${albumTakeHtml(item,editions,null)}`;
      const sourced = sourcedAlbumFallback(item);
      tracksPanel.innerHTML = sourced ? sourcedAlbumTracksHtml(item,sourced) : `<p class="eyebrow">TRACK LIST</p><h3>Reference edition temporarily unavailable</h3><p class="muted">The biography is sourced independently; MusicBrainz did not return the edition-level track record.</p>`;
      people.innerHTML = sourced ? sourcedAlbumCreditsHtml(sourced) : `<p class="eyebrow">CREDITS</p><h3>Reference credits temporarily unavailable</h3>`;
      if (sourced) { rememberPersonnel(item,sourced.personnel); hydrateListeningTools(); void primeApplePreviewButtons(tracksPanel); }
      identity.innerHTML = `<p class="eyebrow">IDENTITY, EDITIONS & LINKS</p><h3>${escapeHtml(referenceAlbumTitle(item.album))}</h3><a href="${escapeHtml(albumWiki.fullurl)}" target="_blank" rel="noreferrer">Read source article ↗</a>${albumPurchaseLinks(item.album,item.artist)}<p class="fine-print">The album biography is verified; edition metadata will retry on the next report load.</p>`;
      if (yearStatus) yearStatus.textContent = "Biography verified";
      if (yearAudit) yearAudit.innerHTML = `<p class="eyebrow">YEAR INTEGRITY</p><h3>Edition year not independently verified</h3><p class="muted">Miles found the album article but MusicBrainz did not return the release-group date on this attempt.</p>`;
      return;
    }
    const reference = referenceResult.value;
    const {group,release} = reference;
    let tracks = (release?.media || []).flatMap((medium) => (medium.tracks || []).map((track) => ({number:track.number,title:track.title || track.recording?.title,length:track.length,recordingId:track.recording?.id})));
    const sourced = sourcedAlbumFallback(item);
    if (!tracks.length && sourced) tracks = sourced.tracks;
    const personnel = mergePersonnel([...personnelFromRelease(release),...(sourced?.personnel || [])],item);
    rememberPersonnel(item,personnel);
    const genres = (group.genres || []).map((genre) => genre.name).slice(0,8);
    const originalYear = String(group["first-release-date"] || "").slice(0,4);
    const plexYears = [...new Set(editions.map((edition) => edition.year).filter(Boolean))].sort();
    const mismatches = originalYear ? editions.filter((edition) => edition.year && edition.year !== originalYear) : [];
    if (yearStatus) yearStatus.textContent = !originalYear ? "Unverified" : mismatches.length ? `${mismatches.length} to review` : "Verified";
    if (yearAudit) yearAudit.innerHTML = `<p class="eyebrow">YEAR INTEGRITY</p><h3>${mismatches.length ? "Plex year differs from the original release" : "Original-release year check"}</h3><dl class="identity-grid"><div><dt>Verified original year</dt><dd>${escapeHtml(originalYear || "Unknown")}</dd></div><div><dt>Plex year${plexYears.length === 1 ? "" : "s"}</dt><dd>${escapeHtml(plexYears.join(", ") || "Missing")}</dd></div></dl>${mismatches.length ? `<div class="scope-note year-warning"><strong>Review ${mismatches.length} Plex record${mismatches.length === 1 ? "" : "s"}</strong><p>${mismatches.map((edition) => `${edition.album}: Plex ${edition.year}, original ${originalYear}`).map(escapeHtml).join("<br>")}</p></div>` : `<p class="muted">${originalYear && plexYears.includes(originalYear) ? "The Plex year agrees with MusicBrainz’s first release date." : "Miles could not establish a contradictory year."}</p>`}<p class="fine-print">A deliberate reissue year is not automatically an error. This check identifies differences so you can decide whether Plex should carry the original album year or an edition-specific date.</p>`;
    const biography = albumWiki?.extract || group.annotation || curatedAlbumBiography(item) || researchedAlbumBiography(item,group,release,tracks,personnel);
    const cover = albumWiki?.original?.source || albumWiki?.thumbnail?.source || await fetchReleaseGroupCover(group.id) || "";
    if (runId !== reportRunId) return;
    overview.innerHTML = `<p class="eyebrow">ALBUM BIOGRAPHY & CONTEXT</p><div class="album-story-layout">${albumArtwork(cover,albumWiki?.title || group.title || item.album)}<div class="album-story-copy"><h3>${escapeHtml(albumWiki?.title || group.title || item.album)}</h3>${biographyParagraphs(biography)}${albumWiki?.fullurl ? `<a href="${escapeHtml(albumWiki.fullurl)}" target="_blank" rel="noreferrer">Read source article ↗</a>` : ""}${!albumWiki?.extract && !group.annotation && !curatedAlbumBiography(item) ? `<p class="fine-print">Researched fallback assembled from the matched MusicBrainz release, label, track and personnel records.</p>` : ""}</div></div>${albumPurchaseLinks(item.album,item.artist)}${albumTakeHtml(item,editions,group,tracks)}${regionalReleaseDates(group)}${albumFactsHtml(albumWiki,tracks,personnel,item)}`;
    tracksPanel.innerHTML = `<p class="eyebrow">TRACK LIST</p><h3>${tracks.length ? `${tracks.length} tracks on the selected reference edition` : "Track list unavailable"}</h3>${tracks.length ? `<ol class="track-list">${tracks.map((track) => `<li><button type="button" class="track-drill" data-report-scope="Song" data-value="${escapeHtml(track.title || "Untitled")}" data-song-artist="${escapeHtml(albumReferenceArtist(item))}" data-song-album="${escapeHtml(item.album)}" data-recording-id="${escapeHtml(track.recordingId || "")}" aria-label="Open song report for ${escapeHtml(track.title || "Untitled")}"><span>${escapeHtml(track.number || "")}</span><strong>${escapeHtml(track.title || "Untitled")}</strong>${track.length ? `<time>${Math.floor(track.length/60000)}:${String(Math.floor(track.length/1000)%60).padStart(2,"0")}</time>` : `<time>Open</time>`}<b aria-hidden="true">›</b></button>${trackSongActions(track.title || "Untitled",albumReferenceArtist(item),item.album)}</li>`).join("")}</ol><p class="fine-print">Select any track to open its song intelligence report, search YouTube, or stream its Apple Preview in place. Back returns to this album and the same position.</p>` : `<p class="muted">No track-bearing release edition was returned for this identity.</p>`}`;
    if (sourced && !release?.media?.some((medium) => medium.tracks?.length)) tracksPanel.innerHTML = sourcedAlbumTracksHtml(item,sourced);
    void primeApplePreviewButtons(tracksPanel);
    people.innerHTML = `<p class="eyebrow">CREDITS</p><h3>Musicians, producers and other contributors</h3>${personnelListHtml(personnel,"The selected reference edition has no structured performer/instrument relationships.")}`;
    if (sourced) people.innerHTML = sourcedAlbumCreditsHtml(sourced,personnel);
    identity.innerHTML = `<p class="eyebrow">IDENTITY, EDITIONS & LINKS</p><h3>Reference identity</h3><dl class="identity-grid"><div><dt>First release</dt><dd>${escapeHtml(group["first-release-date"] || item.year || "Unknown")}</dd></div><div><dt>Primary type</dt><dd>${escapeHtml(group["primary-type"] || "Album")}</dd></div><div><dt>Reference editions</dt><dd>${(group.releases || []).length}</dd></div><div><dt>Genres</dt><dd>${escapeHtml(genres.join(", ") || item.genres.join(", ") || "Unclassified")}</dd></div></dl><a href="https://musicbrainz.org/release-group/${encodeURIComponent(group.id)}" target="_blank" rel="noreferrer">Open MusicBrainz release group ↗</a>${albumWiki?.fullurl ? ` · <a href="${escapeHtml(albumWiki.fullurl)}" target="_blank" rel="noreferrer">Read source article ↗</a>` : ""}${albumPurchaseLinks(item.album,item.artist)}<p class="fine-print">Reference status: matched. Track order and credits belong to one selected official edition and may differ from your exact Plex pressing.</p>`;
    hydrateListeningTools();
    const historyEntry = reportHistory[reportHistoryIndex];
    if (historyEntry?.scope === "Album" && historyEntry.detail && historyEntry.query === item.album && historyEntry.artist === item.artist) historyEntry.html = els.reportContent.innerHTML;
  } catch (error) {
    if (runId !== reportRunId) return;
    const curatedBiography = curatedAlbumBiography(item);
    overview.innerHTML = `<p class="eyebrow">ALBUM BIOGRAPHY & CONTEXT</p><h3>${escapeHtml(referenceAlbumTitle(item.album))}</h3>${curatedBiography ? biographyParagraphs(curatedBiography) : `<p>${escapeHtml(error.message)}. Miles could not verify a detailed external biography, so the local record and collecting context are shown without invented claims.</p>`}${albumPurchaseLinks(item.album,item.artist)}${albumTakeHtml(item,editions,null)}${albumFactsHtml(null,[],[],item)}`;
    tracksPanel.innerHTML = `<p class="eyebrow">TRACK LIST</p><h3>Not available from the Plex album snapshot</h3>`;
    people.innerHTML = `<p class="eyebrow">WHO PLAYED WHAT</p><h3>Not available from the Plex album snapshot</h3>`;
    if (!artistBio.querySelector(".biography-copy")) artistBio.innerHTML = artistBiographyHtml(item.artist,null);
    identity.innerHTML = `<p class="eyebrow">IDENTITY, EDITIONS & LINKS</p><h3>${escapeHtml(referenceAlbumTitle(item.album))}</h3>${albumPurchaseLinks(item.album,item.artist)}<p class="fine-print">External match failed; local metadata remains available and purchase searches use the exact Plex edition title.</p>`;
    if (yearStatus) yearStatus.textContent = "Unverified";
    if (yearAudit) yearAudit.innerHTML = `<p class="eyebrow">YEAR INTEGRITY</p><h3>Original-release year unavailable</h3><p class="muted">Miles could not compare this Plex year with a verified MusicBrainz release-group date.</p>`;
  }
}

function renderAlbumDetail(item,addHistory = true,unowned = false) {
  const runId = ++reportRunId;
  MilesSections.begin();
  MilesResearch.reset();
  markAlbumExplored(item);
  const editions = library.filter((row) => row.artist === item.artist && canonicalTitle(row.album) === canonicalTitle(item.album)).sort((a,b) => String(a.year).localeCompare(String(b.year)));
  if (addHistory) addReportHistory({scope:"Album",query:item.album,artist:item.artist,detail:true,context:{item,unowned}}); else syncReportNavigation();
  els.report.hidden = false;
  els.reportContent.innerHTML = `<div class="report-header album-hero"><p class="eyebrow">AN ALBUM INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(item.album)}</h2><span class="verdict">${escapeHtml(referenceArtistName(item.artist))}${item.year ? ` · ${item.year}` : ""}</span><div class="album-wishlist-action">${wishlistButton(referenceArtistName(item.artist),item.album,item.year)}</div></div>
    <section id="album-overview" class="report-panel"><p class="eyebrow">ART & BIOGRAPHY</p><h3>Researching the album…</h3>${albumPurchaseLinks(item.album,item.artist)}</section>
    <section id="album-tracks" class="report-panel"><p class="eyebrow">SONGS</p><h3>Loading the selected edition…</h3></section>
    <section id="album-personnel" class="report-panel"><p class="eyebrow">CREDITS</p><h3>Loading musicians and producers…</h3></section>
    <section id="album-neighbors" class="report-panel">${albumNeighborsHtml(item)}</section>
    <details class="report-panel collapsible"><summary><span><small>COLLECTION DETAILS</small><strong>Year, editions and reference identity</strong></span></summary><section class="album-facts"><article><span>Year integrity</span><strong id="album-year-status">Checking…</strong></article><article><span>Owned editions</span><strong>${editions.length}</strong></article><article><span>Genre</span><strong>${escapeHtml(item.genres[0] || "Unknown")}</strong></article><article><span>Label / studio</span><strong>${escapeHtml(item.studio || "Unknown")}</strong></article></section>
    <div id="album-year-audit"><p class="eyebrow">YEAR INTEGRITY</p><h3>Checking Plex against the original release…</h3></div>
    <p class="eyebrow">YOUR EDITIONS</p><div class="album-list">${editions.map((edition) => `<div class="album static"><strong>${escapeHtml(edition.album)}</strong><span>${escapeHtml(edition.year || "Year unknown")}${edition.studio ? ` · ${escapeHtml(edition.studio)}` : ""}${edition.genres.length ? ` · ${escapeHtml(edition.genres.join(", "))}` : ""}</span></div>`).join("") || `<p class="muted">This album is not matched in your Plex catalog.</p>`}</div>
    <div id="album-identity"><p class="eyebrow">REFERENCE IDENTITY</p><h3>Resolving the release…</h3></div></details>
    <section id="album-artist-biography" class="report-panel"><p class="eyebrow">ARTIST BIOGRAPHY</p><h3>Researching ${escapeHtml(referenceArtistName(item.artist))}…</h3></section>${personalNotesHtml("Album",item.album,item.artist)}`;
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  loadAlbumEnrichment(item,editions,runId).finally(() => MilesResearch.finish(runId));
}

function renderContributorReport(scope,query,runId) {
  const credits=creditEvidence.filter(row => songArtistKey(row.person)===songArtistKey(query));
  const rows=credits.map(row => `<li><button type="button" data-album="${escapeHtml(row.album)}" data-artist="${escapeHtml(row.artist)}"><strong>${escapeHtml(row.album)}</strong><span>${escapeHtml(row.artist)} · ${escapeHtml(row.role)}</span></button></li>`).join("");
  els.reportContent.innerHTML=`<div class="report-header"><p class="eyebrow">${escapeHtml(scope.toUpperCase())} INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">Biography &amp; Documented Contributions</span>${wishlistButton(query,query,"","Artist")}</div><section id="standalone-artist-biography" class="report-panel">${artistBiographyHtml(query,null)}</section>${contributorCoverageHtml(query)}<section class="report-panel"><p class="eyebrow">VERIFIED CONTRIBUTIONS</p><h3>Credits From Explored Recordings</h3>${rows ? `<ul class="rank-list">${rows}</ul>` : `<p class="muted">No matching performance credits have been verified in this session yet. Open a recording or album with documented credits to connect it here. The album export alone does not identify every contributor.</p>`}</section>`;
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  MilesResearch.start(runId,"Artist",{biography:"Contributor Biography"});
  MilesResearch.track(runId,"biography",fetchArtistWikipediaSummary(query)).then(article => {
    if (runId!==reportRunId) return;
    const panel=$("#standalone-artist-biography");
    if(panel) replaceReportHtml(panel,artistBiographyHtml(query,article));
  }).catch(()=>{
    if(runId===reportRunId) replaceReportHtml($("#standalone-artist-biography"),artistBiographyHtml(query,null));
  });
}

function renderReport(scope, query, addHistory = true) {
  const runId = ++reportRunId;
  MilesSections.begin();
  MilesResearch.reset();
  const matches = library.filter((item) => matchesScope(item,query,scope)).sort((a,b) => sortKey(a.album).localeCompare(sortKey(b.album)));
  if (addHistory) addReportHistory({scope,query}); else syncReportNavigation();
  els.report.hidden = false;
  if (scope === "Contributor" || scope === "Composer") {
    currentReportMatches=matches;
    if(scope === "Composer") renderComposerReport(query,runId);
    else renderContributorReport(scope,query,runId);
    return;
  }

  if (!matches.length) {
    if(scope === "Decade") {
      els.reportContent.innerHTML=`<div class="report-header"><p class="eyebrow">DECADE INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">No Local Album Matches</span></div><section id="decade-recommendations" class="report-panel"><p class="eyebrow">RECOMMENDED ALBUMS YOU DON’T OWN</p><h3>Comparing The Reference Catalog…</h3></section>`;
      loadDecadeRecommendations(query,runId);
      els.report.scrollIntoView({behavior:"smooth",block:"start"});return;
    }
    if (scope === "Artist") {
      els.reportContent.innerHTML = `<div class="report-header"><p class="eyebrow">AN ARTIST INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">No local title match · researching the artist beyond Plex</span>${wishlistButton(query,query,"","Artist")}</div>${artistSectionsHtml(query)}<section id="reference-panel" class="report-panel reference-panel"><p class="eyebrow">REFERENCE IDENTITY</p><h3>Finding the artist, biography and discography…</h3><p class="muted">Miles is checking MusicBrainz and Wikipedia rather than treating an unfamiliar name as a dead end.</p></section>`;
      els.report.scrollIntoView({behavior:"smooth", block:"start"});
      loadArtistCoverage(query,[],runId);
      return;
    }
    els.reportContent.innerHTML = `<div class="report-header"><p class="eyebrow">${escapeHtml(scope.toUpperCase())}</p><h2 class="report-title">${escapeHtml(query)}</h2></div><p class="empty">No matching albums were found in the loaded Plex library.</p>`;
    els.report.scrollIntoView({behavior:"smooth", block:"start"}); return;
  }

  currentReportMatches = matches;

  const summary = holdingsSummary(matches,scope);
  const yearRange = summary.years.length ? `${summary.years[0]}–${summary.years.at(-1)}` : "Year unknown";
  const maxGenre = summary.genres[0]?.[1] || 1;
  const genreRows = summary.genres.map(([genre,count]) => `<button type="button" class="genre-row" data-drill="genre" data-value="${escapeHtml(genre)}"><span>${escapeHtml(genre)}</span><span class="bar"><i style="width:${Math.max(5,count/maxGenre*100)}%"></i></span><strong>${count}</strong></button>`).join("");
  const findings = metadataFindings(matches);
  const findingsHtml = findings.map((finding) => `<button type="button" class="finding ${finding.level}" data-drill="metadata" data-value="${finding.key}"><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.detail)}</p><span class="open-evidence">Open affected albums →</span></button>`).join("");
  const topArtists = summary.topArtists.map(([artist,count]) => `<li><button type="button" data-report-scope="Artist" data-value="${escapeHtml(artist)}"><strong>${escapeHtml(artist)}</strong><span>${count} album${count === 1 ? "" : "s"} · open report</span></button></li>`).join("");
  const unsupported = ["Contributor","Composer","Instrument","Song"].includes(scope) ? `<div class="scope-note"><strong>Snapshot limitation</strong><p>This album-level Plex export does not contain ${scope.toLowerCase()} credits. Matches use the closest available album, artist and genre fields; a track-and-credit export is required for authoritative ${scope.toLowerCase()} analysis.</p></div>` : "";
  els.reportContent.innerHTML = `
    <div class="report-header"><p class="eyebrow">A COLLECTION INTELLIGENCE REPORT · ${escapeHtml(scope.toUpperCase())}</p><h2 class="report-title">${escapeHtml(query)}</h2><span class="verdict">${matches.length.toLocaleString()} holdings · ${summary.artistCount.toLocaleString()} artists · ${yearRange}</span>${scope === "Artist" ? wishlistButton(query,query,"","Artist") : ""}</div>
    ${scope === "Artist" ? artistSectionsHtml(query) : ""}
    ${unsupported}
    <nav class="report-jump" aria-label="Report sections"><a href="#summary">Summary</a><a href="#coverage">Coverage</a><a href="${scope === "Decade" ? "#decade-recommendations" : "#reference-panel"}">Missing</a><a href="#metadata-health">Years</a><a href="#key-holdings">Holdings</a></nav>
    <div id="summary">${executiveFindings(matches,summary,scope)}${renderScoreSection(matches,summary,scope)}</div>
    <section class="insight-grid">${renderHoldingCards(matches,summary,scope)}</section>
    <section id="drilldown" class="report-panel drilldown" hidden></section>
    ${contextForYear(scope,query,matches)}
    ${scope === "Decade" ? `<section id="decade-recommendations" class="report-panel"><p class="eyebrow">RECOMMENDED ALBUMS YOU DON’T OWN</p><h3>Comparing Your Collection With The Reference Catalog…</h3></section>` : ""}
    <div id="coverage" class="report-grid intelligence-grid">
      <section class="report-panel"><p class="eyebrow">LIBRARY COVERAGE</p><h3>Shape of your holdings</h3><p class="muted">The list is evidence; the shape is the finding. These are the artists and genres carrying this result.</p><h4>Leading artists</h4><ul class="rank-list">${topArtists}</ul><h4>Genre concentration</h4><div class="genre-bars">${genreRows || "<p class='muted'>No genre metadata found.</p>"}</div></section>
      <section class="report-panel"><p class="eyebrow">ERA MAP</p><h3>Where the collection is deep—and thin</h3><div class="era-map">${renderEraMap(summary.decadeRows)}</div><p class="fine-print">Counts reflect Plex years, not recording dates; reissues with altered years can distort this map.</p></section>
    </div>
    <section id="reference-panel" class="report-panel reference-panel" ${scope === "Decade" ? "hidden" : ""}>${scope === "Artist" ? `<p class="eyebrow">REFERENCE CATALOG</p><h3>Checking studio-album gaps…</h3><p class="muted">Matching your holdings against a canonical artist identity and release-group catalog.</p>` : `<p class="eyebrow">MISSING PIECES</p><h3>What this result cannot prove by itself</h3><p class="muted">Specific missing-title claims require a canonical reference catalog for the selected ${escapeHtml(scope.toLowerCase())}. The era map above exposes chronological thin spots without inventing titles.</p>`}</section>
    <details id="metadata-health" class="report-panel collapsible"><summary><span><small>YEAR INTEGRITY</small><strong>Missing, conflicting and verified release years</strong></span><b>${findings.length || 0} local findings</b></summary><div class="finding-grid">${findingsHtml || `<article class="finding good"><strong>No missing or locally conflicting years</strong><p>Open any album for comparison with its verified MusicBrainz original-release year. Artist reports also show reference-verified mismatches in the catalog section.</p></article>`}</div></details>
    <details id="key-holdings" class="report-panel collapsible"><summary><span><small>KEY HOLDINGS</small><strong>Representative records and evidence</strong></span><b>${Math.min(16,matches.length)} of ${matches.length}</b></summary><div class="album-list">${renderAlbumList(matches)}</div><p class="fine-print">Select a title to run an album-specific Miles report.</p></details>`;
  els.report.scrollIntoView({behavior:"smooth", block:"start"});
  if (scope === "Artist") loadArtistCoverage(query,matches,runId);
  if (scope === "Decade") loadDecadeRecommendations(query,runId);
}

els.tabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scope]"); if (!button) return;
  activeScope = button.dataset.scope; renderTabs(); els.query.focus();
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = els.query.value.trim();
  if (!library.length) { setMessage("Load a Plex CSV or JSON before running Miles.", true); return; }
  if (query) activeScope === "Song" ? renderSongReport(query) : activeScope === "Instrument" ? renderRoleReport(query) : renderReport(activeScope,query);
});

$("#wishlist-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget), type = String(data.get("type") || "Album");
  const artist = String(data.get("artist") || "").trim(), album = type === "Artist" ? artist : String(data.get("album") || "").trim();
  if (!artist || !album) return;
  if (!wishlist.some((row) => wishlistKey(row.artist,row.album,row.type) === wishlistKey(artist,album,type))) toggleWishlist(artist,album,data.get("year"),type);
});
$("#wishlist-sort").addEventListener("change",renderWishlist);
$("#wishlist-items").addEventListener("click",(event) => {
  const remove = event.target.closest("[data-wishlist-remove]");
  if (remove) { toggleWishlist(remove.dataset.wishlistArtist,remove.dataset.wishlistAlbum,remove.dataset.wishlistYear,remove.dataset.wishlistType); return; }
  const open = event.target.closest("[data-wishlist-open]");
  if (open) {
    $("#wishlist-dialog").close();
    const type = open.dataset.wishlistType;
    if (type === "Artist") { renderReport("Artist",open.dataset.wishlistArtist); return; }
    if (type === "Song") { renderSongReport(open.dataset.wishlistAlbum,true,{artist:open.dataset.wishlistArtist}); return; }
    const item = library.find((row) => wishlistKey(row.artist,row.album) === wishlistKey(open.dataset.wishlistArtist,open.dataset.wishlistAlbum));
    if (item) renderAlbumDetail(item);
    else openUnownedAlbumReport(open.dataset.wishlistAlbum,open.dataset.wishlistArtist,open.dataset.wishlistYear);
  }
});

els.report.addEventListener("toggle", (event) => {
  const details = event.target.closest?.("details[data-release-group-id]");
  if (details?.open) loadArtistReleaseVersions(details);
}, true);

els.report.addEventListener("click", async (event) => {
  const wishlistToggle = event.target.closest("[data-wishlist-toggle]");
  if (wishlistToggle) {
    toggleWishlist(wishlistToggle.dataset.wishlistArtist,wishlistToggle.dataset.wishlistAlbum,wishlistToggle.dataset.wishlistYear,wishlistToggle.dataset.wishlistType);
    return;
  }
  const appleButton = event.target.closest("[data-apple-preview]");
  if (appleButton) {
    const row = appleButton.closest("li");
    const panel = row?.querySelector(".inline-song-preview");
    if (!panel) return;
    if (!panel.hidden) {
      panel.querySelector("audio")?.pause();
      panel.hidden = true;
      appleButton.textContent = "Play Preview";
      appleButton.setAttribute("aria-expanded","false");
      return;
    }
    panel.hidden = false;
    appleButton.setAttribute("aria-expanded","true");
    if (panel.dataset.loaded === "true") {
      appleButton.textContent = "Hide Preview";
      panel.querySelector("audio")?.play().catch(() => {});
      return;
    }
    const readyPreview = storedApplePreview(appleButton);
    if (readyPreview) {
      renderAndPlayApplePreview(panel,appleButton,readyPreview);
      return;
    }
    appleButton.disabled = true;
    appleButton.textContent = "Loading…";
    panel.innerHTML = `<div class="song-preview unavailable"><strong>Finding Apple preview…</strong><span>Matching artist + song.</span></div>`;
    const preview = await fetchAppleSongPreview(appleButton.dataset.songTitle || "",appleButton.dataset.songArtist || "",appleButton.dataset.songAlbum || "");
    storeApplePreview(appleButton,preview);
    renderAndPlayApplePreview(panel,appleButton,preview);
    return;
  }
  const songRefresh = event.target.closest("[data-song-refresh]");
  if (songRefresh) { const entry = reportHistory[reportHistoryIndex]; renderSongReport(entry?.query || els.query.value.trim(),false,entry?.context || {}); return; }
  const unownedAlbumButton = event.target.closest("[data-unowned-album]");
  if (unownedAlbumButton) {
    cacheCurrentReportState();
    openUnownedAlbumReport(unownedAlbumButton.dataset.albumTitle || "",unownedAlbumButton.dataset.albumArtist || "",unownedAlbumButton.dataset.albumYear || "");
    return;
  }
  const missingButton = event.target.closest("[data-missing-id]");
  if (missingButton) {
    const context = missingReleaseLookup.get(missingButton.dataset.missingId);
    if (context) renderMissingReleaseDetail(context);
    return;
  }
  const reportButton = event.target.closest("[data-report-scope]");
  if (reportButton) {
    cacheCurrentReportState();
    const scope = reportButton.dataset.reportScope;
    const query = reportButton.dataset.value || "";
    const songContext = scope === "Song" ? {artist:reportButton.dataset.songArtist || "",album:reportButton.dataset.songAlbum || "",recordingId:reportButton.dataset.recordingId || ""} : {};
    activeScope = scope; renderTabs(); els.query.value = query; scope === "Song" ? renderSongReport(query,true,songContext) : scope === "Instrument" ? renderRoleReport(query) : renderReport(scope,query);
    return;
  }
  const closeDrill = event.target.closest("[data-close-drill]");
  if (closeDrill) {
    const panel = els.report.querySelector("#drilldown");
    if (panel) { panel.hidden = true; panel.innerHTML = ""; }
    return;
  }
  const drillButton = event.target.closest("[data-drill]");
  if (drillButton) {
    showDrilldown(drillButton.dataset.drill,drillButton.dataset.value || "");
    return;
  }
  const fuseButton = event.target.closest("[data-fuse-refresh]");
  if (fuseButton) {
    const query = els.query.value.trim();
    const matches = library.filter((item) => matchesScope(item,query));
    loadArtistCoverage(query,matches,reportRunId,true);
    return;
  }
  const resultTab = event.target.closest("[data-result-tab]");
  if (resultTab) {
    const target = resultTab.dataset.resultTab;
    els.report.querySelectorAll("[data-result-tab]").forEach((button) => button.classList.toggle("active",button.dataset.resultTab === target));
    els.report.querySelectorAll("[data-result-panel]").forEach((panel) => panel.hidden = panel.dataset.resultPanel !== target);
    return;
  }
  const button = event.target.closest("[data-album]"); if (!button) return;
  const item = library.find((row) => row.album === button.dataset.album && row.artist === button.dataset.artist) || library.find((row) => row.album === button.dataset.album);
  if (item) renderAlbumDetail(item);
});

document.querySelectorAll("[data-history-back]").forEach((button) => button.addEventListener("click", () => {
  if (reportHistoryIndex > 0) openReportHistory(reportHistoryIndex - 1,Boolean(button.closest("dialog")));
}));
document.querySelectorAll("[data-history-forward]").forEach((button) => button.addEventListener("click", () => {
  if (reportHistoryIndex < reportHistory.length - 1) openReportHistory(reportHistoryIndex + 1,Boolean(button.closest("dialog")));
}));

els.tangledToggle.addEventListener("click", () => els.tangledDialog.showModal());
els.tangledClose.addEventListener("click", () => els.tangledDialog.close());
els.tangledPath.addEventListener("click", (event) => {
  const button = event.target.closest("[data-history-index]");
  if (button) openReportHistory(Number(button.dataset.historyIndex));
});
els.tangledDialog.addEventListener("click", (event) => {
  if (event.target === els.tangledDialog) els.tangledDialog.close();
});

els.file.addEventListener("change", async () => {
  const file = els.file.files?.[0]; if (!file) return;
  setMessage(`Reading ${file.name}…`);
  try {
    const text = await file.text();
    const records = file.name.toLowerCase().endsWith(".json") ? extractJsonRecords(JSON.parse(text)) : parseCsv(text);
    loadRecords(records);
  } catch (error) { setMessage(error.message || "Miles could not read that file.", true); }
  finally { els.file.value = ""; }
});

els.loadLast.addEventListener("click", async () => {
  try {
    const records = await readLibrary();
    if (!records.length) throw new Error("No saved library is available in this browser yet.");
    loadRecords(records, false);
  } catch (error) { setMessage(error.message, true); }
});

els.forget.addEventListener("click", async () => {
  await forgetLibrary(); library = []; creditEvidence = []; els.stats.hidden = true; els.report.hidden = true; els.tangledToggle.hidden = true; if (els.tangledDialog.open) els.tangledDialog.close();
  els.status.textContent = "No library loaded"; els.status.classList.remove("ready"); songReportCache.clear();refreshCollectionControls();renderDiscoveryControls();setMessage("The saved browser copy was removed.");
});

async function preloadLibrary() {
  const generation = ++libraryLoadGeneration;
  setMessage("Loading your Plex library…");
  try {
    const response = await fetch("reference-data/Plex-Music-Library.csv", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Metadata snapshot returned ${response.status}.`);
    const records = parseCsv(await response.text());
    if (generation !== libraryLoadGeneration) return;
    loadRecords(records, false);
    setMessage(`Preloaded ${library.length.toLocaleString()} albums from your Plex metadata snapshot.`);
  } catch (error) {
    setMessage("The preloaded snapshot could not be opened. You can still select a CSV or JSON below.", true);
  }
}

renderTabs();
renderWishlist();
initListeningTools();
initMilesMenu();
refreshCollectionControls();
if (localStorage.getItem("miles-collection-disconnected") !== "true") preloadLibrary();
