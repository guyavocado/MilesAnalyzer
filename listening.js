// Listening tools use the current browser's notebook and verified report data.
const LISTENING_STORAGE_KEY = "miles-listening-v1";
let listeningState = {notes:{},visits:{}};
const exploredSongs = new Map();
try {
  const saved = JSON.parse(localStorage.getItem(LISTENING_STORAGE_KEY) || "null");
  if (saved && typeof saved.notes === "object" && saved.notes && typeof saved.visits === "object" && saved.visits) {
    listeningState.notes = Object.fromEntries(Object.entries(saved.notes).filter(([key,row]) => row && ["Song","Album"].includes(row.scope) && typeof row.artist === "string" && typeof row.title === "string" && listeningKey(row.scope,row.artist,row.title) === key).map(([key,row]) => [key,{...row,text:String(row.text || "").slice(0,5000),version:String(row.version || "").slice(0,200),favorite:Boolean(row.favorite)}]));
    listeningState.visits = Object.fromEntries(Object.entries(saved.visits).filter(([,value]) => Number.isFinite(value) && value > 0));
  }
} catch (_) {}

function listeningKey(scope,artist,title) {
  return JSON.stringify([scope,String(artist || "").normalize("NFKC").trim().toLocaleLowerCase(),String(title || "").normalize("NFKC").trim().toLocaleLowerCase()]);
}
function persistListeningState() {
  try { localStorage.setItem(LISTENING_STORAGE_KEY,JSON.stringify(listeningState)); return true; }
  catch (_) { return false; }
}
function markAlbumExplored(item) {
  listeningState.visits[listeningKey("Album",item.artist,item.album)] = Date.now();
  persistListeningState();
}
function personalNotesHtml(scope,title,artist) {
  const row = listeningState.notes[listeningKey(scope,artist,title)] || {};
  return `<section class="report-panel listening-note" data-note-scope="${escapeHtml(scope)}" data-note-title="${escapeHtml(title)}" data-note-artist="${escapeHtml(artist)}"><p class="eyebrow">YOUR LISTENING</p><h3>Notes &amp; discoveries</h3><p class="muted">Keep what you noticed and your favorite version. Saved in this browser.</p><label>Listening notes<textarea data-note-text maxlength="5000" rows="4" placeholder="What stood out when you listened?">${escapeHtml(row.text || "")}</textarea></label><label>Favorite version<input data-note-version maxlength="200" value="${escapeHtml(row.version || "")}" placeholder="e.g. Original stereo mix, 1969" /></label><button type="button" class="wishlist-action" data-note-favorite aria-pressed="${Boolean(row.favorite)}">${row.favorite ? "★ Favorite discovery" : "☆ Save as a favorite"}</button><p class="fine-print note-save-status" role="status">${row.updatedAt ? "Saved in this browser." : "Changes save automatically."}</p></section>`;
}
function savePersonalNote(panel,toggleFavorite = false) {
  const {noteScope:scope,noteTitle:title,noteArtist:artist} = panel.dataset;
  const key = listeningKey(scope,artist,title);
  const previous = listeningState.notes[key] || {};
  const row = {scope,title,artist,text:panel.querySelector("[data-note-text]").value,version:panel.querySelector("[data-note-version]").value,favorite:toggleFavorite ? !previous.favorite : Boolean(previous.favorite),updatedAt:Date.now()};
  listeningState.notes[key] = row;
  const saved = persistListeningState();
  const button = panel.querySelector("[data-note-favorite]");
  button.setAttribute("aria-pressed",String(row.favorite));
  button.textContent = row.favorite ? "★ Favorite discovery" : "☆ Save as a favorite";
  panel.querySelector(".note-save-status").textContent = saved ? "Saved in this browser." : "Browser storage is unavailable. These changes will last only until this page closes.";
  renderListeningNotebook();
}
function hydratePersonalNotes() {
  document.querySelectorAll(".listening-note").forEach((panel) => {
    const row = listeningState.notes[listeningKey(panel.dataset.noteScope,panel.dataset.noteArtist,panel.dataset.noteTitle)] || {};
    panel.querySelector("[data-note-text]").value = row.text || "";
    panel.querySelector("[data-note-version]").value = row.version || "";
    const button = panel.querySelector("[data-note-favorite]");
    button.setAttribute("aria-pressed",String(Boolean(row.favorite)));
    button.textContent = row.favorite ? "★ Favorite discovery" : "☆ Save as a favorite";
  });
}
function renderListeningNotebook() {
  const container = document.querySelector("#listening-notebook-items");
  if (!container) return;
  const favoritesOnly = document.querySelector("#notebook-favorites").checked;
  const rows = Object.values(listeningState.notes).filter((row) => (row.text || row.version || row.favorite) && (!favoritesOnly || row.favorite)).sort((a,b) => b.updatedAt-a.updatedAt).slice(0,40);
  container.innerHTML = rows.map((row) => `<article class="notebook-item"><button type="button" class="notebook-open" data-note-open data-note-scope="${escapeHtml(row.scope)}" data-note-title="${escapeHtml(row.title)}" data-note-artist="${escapeHtml(row.artist)}"><strong>${row.favorite ? "★ " : ""}${escapeHtml(row.title)}</strong><span>${escapeHtml(row.artist)} · ${escapeHtml(row.scope)} · Open Miles report →</span></button>${row.text ? `<p>${escapeHtml(row.text)}</p>` : ""}${row.version ? `<small>Favorite version: ${escapeHtml(row.version)}</small>` : ""}</article>`).join("") || `<p class="muted">${favoritesOnly ? "No favorite discoveries saved yet." : "Your notes will appear here when you save them on a song or album page."}</p>`;
}
function discoveryCandidates(mode,instrument = "",genre = "") {
  const seen = new Set();
  let candidates = library.filter((item) => {
    const key = listeningKey("Album",item.artist,canonicalTitle(item.album));
    if (seen.has(key) || (genre && !item.genres.includes(genre))) return false;
    seen.add(key);return true;
  });
  if (mode === "instrument") {
    const role = sortKey(instrument);
    if (!role) return [];
    const verified = creditEvidence.filter((entry) => sortKey(entry.role).includes(role));
    candidates = candidates.filter((item) => verified.some((entry) => songArtistMatches(entry.artist,item.artist) && canonicalTitle(entry.album) === canonicalTitle(item.album)));
  }
  if (mode === "overlooked") {
    const visitsByAlbum = new Map();
    library.forEach((item) => {
      const key = `${songArtistKey(item.artist)}|${canonicalTitle(item.album)}`;
      visitsByAlbum.set(key,Math.max(visitsByAlbum.get(key) || 0,listeningState.visits[listeningKey("Album",item.artist,item.album)] || 0));
    });
    const ranked = candidates.map((item) => ({item,visited:visitsByAlbum.get(`${songArtistKey(item.artist)}|${canonicalTitle(item.album)}`) || 0}));
    const oldest = ranked.length ? Math.min(...ranked.map((row) => row.visited)) : 0;
    candidates = ranked.filter((row) => row.visited === oldest).map((row) => row.item);
  }
  return candidates;
}
function renderDiscoveryControls() {
  const select = document.querySelector("#discovery-genre");
  if (!select) return;
  const current = select.value;
  const genres = [...new Set(library.flatMap((row) => row.genres))].sort((a,b) => a.localeCompare(b));
  select.innerHTML = `<option value="">Any genre</option>${genres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join("")}`;
  if (genres.includes(current)) select.value = current;
  document.querySelectorAll("[data-discover]").forEach((button) => button.disabled = !library.length);
}
function discoverAlbum(mode) {
  const instrument = document.querySelector("#discovery-instrument").value.trim();
  const genre = document.querySelector("#discovery-genre").value;
  const candidates = discoveryCandidates(mode,instrument,genre);
  const output = document.querySelector("#discovery-result");
  if (!candidates.length) {
    output.innerHTML = `<p class="muted">${mode === "instrument" ? "No matching instrument credits have been verified in the albums explored this session. Open the instrument report to research more releases." : "No albums match this selection. Load a library or choose another genre."}</p>${mode === "instrument" && instrument ? `<button type="button" class="button secondary" data-discovery-instrument="${escapeHtml(instrument)}">Explore ${escapeHtml(instrument)} in Miles</button>` : ""}`;
    return;
  }
  const item = candidates[Math.floor(Math.random()*candidates.length)];
  output.innerHTML = `<p class="fine-print">${mode === "overlooked" ? "Among the albums least recently explored in Miles on this browser; this is not playback history." : mode === "instrument" ? "Matched from verified credits encountered in this session." : "Random pick from your loaded collection."}</p><button type="button" class="discovery-album" data-discovery-album="${escapeHtml(item.album)}" data-discovery-artist="${escapeHtml(item.artist)}"><strong>${escapeHtml(item.artist)} · ${escapeHtml(item.album)}</strong><span>${escapeHtml(item.year || "Year unknown")} · Open album report →</span></button>`;
}
function listeningGuideHtml(theory,performers = []) {
  const prompts = theory?.listeningPrompts || [];
  // A guide must identify things in this song; generic exercises are not a substitute.
  if (!prompts.length) return "";
  return `<section class="report-panel listening-guide"><p class="eyebrow">A CLOSER LISTEN</p><h3>Inside This Recording</h3><ol>${prompts.map(prompt => `<li><h4>${escapeHtml(prompt.title)}</h4><p>${escapeHtml(prompt.text)}</p>${prompt.sourceUrl ? `<a class="fine-print" href="${escapeHtml(prompt.sourceUrl)}" target="_blank" rel="noreferrer">Listening reference ↗</a>` : ""}</li>`).join("")}</ol><p class="fine-print">Listening cues describe the standard studio recording. Alternate takes, live performances and remixes may differ. Keep your own observations in Notes &amp; Discoveries.</p></section>`;
}

function registerExploredSong({primary,artist,theory,performers,versions,relations}) {
  const unique = [...new Map(versions.filter((row) => row.id).map((row) => [row.id,row])).values()].slice(0,20);
  exploredSongs.set(primary.id,{id:primary.id,title:primary.title,artist,theory,performers,versions:unique,relations});
  if (exploredSongs.size > 100) exploredSongs.delete(exploredSongs.keys().next().value);
}
function songConnectionsHtml(id) {
  const current = exploredSongs.get(id);
  if (!current) return "";
  const direct = (current.relations || []).filter((relation) => relation.recording?.id && /sample|remix|edit|medley|mash.up/i.test(relation.type || ""));
  const connectionButton = (recording,artist,label) => `<button type="button" class="connection-link" data-report-scope="Song" data-value="${escapeHtml(recording.title)}" data-song-artist="${escapeHtml(artist || "")}" data-recording-id="${escapeHtml(recording.id)}"><strong>${escapeHtml(recording.title)}</strong><span>${escapeHtml(label)}</span></button>`;
  const directRows = direct.slice(0,8).map((relation) => `${connectionButton(relation.recording,relation.recording["artist-credit"] ? artistCreditName(relation.recording) : "",`${relation.direction === "backward" ? "Incoming" : "Outgoing"} ${relation.type} relationship`)}<a class="fine-print" href="https://musicbrainz.org/recording/${encodeURIComponent(current.id)}" target="_blank" rel="noreferrer">Relationship source ↗</a>`).join("");
  const personKeys = new Set(current.performers.filter((person) => !isSampleSource(person)).map((person) => person.id || songArtistKey(person.name)));
  const others = [...exploredSongs.values()].filter((row) => row.id !== current.id && !(canonicalTitle(row.title) === canonicalTitle(current.title) && songArtistMatches(row.artist,current.artist)));
  const shared = others.map((row) => ({row,people:row.performers.filter((person) => !isSampleSource(person) && personKeys.has(person.id || songArtistKey(person.name)))})).filter((entry) => entry.people.length).sort((a,b) => b.people.length-a.people.length).slice(0,5);
  const sharedRows = shared.map(({row,people}) => connectionButton(row,row.artist,`Shared credits: ${people.map((person) => person.name).join(", ")} · ${row.artist}`)).join("");
  const traitPatterns = [{label:"pentatonic melody",pattern:/pentatonic/i},{label:"uneven meter",pattern:/\b(?:7|11|5)\/8\b|odd meter|uneven/i},{label:"drone",pattern:/\bdrone\b/i},{label:"counterpoint",pattern:/counterpoint/i},{label:"12-bar blues",pattern:/12.bar|twelve.bar/i}];
  const traits = traitPatterns.filter((trait) => trait.pattern.test(current.theory?.points?.join(" ") || ""));
  const similar = others.map((row) => ({row,traits:traits.filter((trait) => trait.pattern.test(row.theory?.points?.join(" ") || ""))})).filter((entry) => entry.traits.length).slice(0,4);
  const similarRows = similar.map(({row,traits}) => connectionButton(row,row.artist,`Shared documented trait: ${traits.map((trait) => trait.label).join(", ")} · ${row.artist}`)).join("");
  return `<section class="report-panel song-connections" data-connections-id="${escapeHtml(id)}"><p class="eyebrow">FOLLOW A MUSICAL THREAD</p><h3>Musical connections</h3><h4>Samples, remixes &amp; related recordings</h4>${directRows || `<p class="muted">No direct recording relationships were returned.</p>`}<h4>Shared musicians &amp; contributors</h4>${sharedRows || `<p class="muted">No shared credits found among the song reports explored this session.</p>`}<h4>Similar musical ideas</h4>${similarRows || `<p class="muted">No matching documented traits found among the songs explored this session.</p>`}<p class="fine-print">Shared credits and musical traits connect reports you have explored in this session. Similarity does not establish influence.</p></section>`;
}
function sourceConfidenceHtml({sourceUrl,story,theory,performers,owned}) {
  const confirmed = owned.filter((entry) => entry.versions.has("confirmed in Plex track list")).length;
  return `<details class="report-panel collapsible source-confidence"><summary><span><small>CHECK THE EVIDENCE</small><strong>Sources &amp; confidence</strong></span></summary><ul><li><strong>Recording identity — documented:</strong> <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">MusicBrainz recording ↗</a></li><li><strong>Song story — ${story?.fullurl ? "sourced" : "catalog summary"}:</strong> ${story?.fullurl ? `<a href="${escapeHtml(story.fullurl)}" target="_blank" rel="noreferrer">Read the story source ↗</a>` : "Based on recording and release metadata; a song-specific article has not been verified."}</li><li><strong>Musical analysis — ${theory ? "sourced" : "unavailable"}:</strong> ${theory?.sourceUrl ? `<a href="${escapeHtml(theory.sourceUrl)}" target="_blank" rel="noreferrer">Read the musical source ↗</a>` : "No verified song-specific theory details available."}</li><li><strong>Credits — ${performers.length ? "documented relationships" : "incomplete"}:</strong> ${performers.length} contributor credits attached to this recording; absence is not proof someone did not play.</li><li><strong>Collection matches:</strong> ${confirmed} albums have track-list evidence. Other matches use album titles and release mappings; they do not prove ownership of a particular mix.</li></ul><p class="fine-print">Sources can be incomplete or mistaken. These labels describe the available evidence, not a certainty score.</p></details>`;
}
function hydrateListeningTools() {
  renderWishlist();
  hydratePersonalNotes();
  document.querySelectorAll("[data-connections-id]").forEach((panel) => {
    if (exploredSongs.has(panel.dataset.connectionsId)) panel.outerHTML = songConnectionsHtml(panel.dataset.connectionsId);
  });
}
function initListeningTools() {
  renderListeningNotebook();renderDiscoveryControls();
  document.querySelector("#notebook-favorites").addEventListener("change",renderListeningNotebook);
  document.querySelector("#listening-notebook-items").addEventListener("click",(event) => {
    const button = event.target.closest("[data-note-open]");if (!button) return;
    document.querySelector("#notebook-dialog")?.close();
    cacheCurrentReportState();
    const {noteScope:scope,noteTitle:title,noteArtist:artist} = button.dataset;
    if (scope === "Song") renderSongReport(title,true,{artist});
    else {
      const item = library.find((row) => songArtistMatches(row.artist,artist) && canonicalTitle(row.album) === canonicalTitle(title));
      if (item) renderAlbumDetail(item);else openUnownedAlbumReport(title,artist,"");
    }
  });
  document.querySelector("#collection-discovery").addEventListener("click",(event) => {
    const discover = event.target.closest("[data-discover]");if (discover) {discoverAlbum(discover.dataset.discover);return;}
    const instrument = event.target.closest("[data-discovery-instrument]");if (instrument) {document.querySelector("#explore-dialog")?.close();cacheCurrentReportState();renderRoleReport(instrument.dataset.discoveryInstrument);return;}
    const album = event.target.closest("[data-discovery-album]");if (!album) return;
    const item = library.find((row) => row.artist === album.dataset.discoveryArtist && row.album === album.dataset.discoveryAlbum);
    if (item) {document.querySelector("#explore-dialog")?.close();cacheCurrentReportState();renderAlbumDetail(item);}
  });
  els.report.addEventListener("input",(event) => {
    const panel = event.target.closest(".listening-note");if (panel) savePersonalNote(panel);
  });
  els.report.addEventListener("click",(event) => {
    const favorite = event.target.closest("[data-note-favorite]");if (favorite) savePersonalNote(favorite.closest(".listening-note"),true);
  });
}

function songUnownedReleasesHtml(groups,owned,artist,loading = false) {
  const missing = groups.filter((group) => (!group["primary-type"] || group["primary-type"] === "Album") &&
    !owned.some(({item,groups:matched}) => matched.some((entry) => entry.id === group.id) || songArtistMatches(item.artist,artist) && titleConfidence(item.album,group.title) >= 90));
  const rows = missing.slice(0,40).map((group) => `<div class="wishlist-release"><button type="button" class="album song-instance" data-unowned-album data-album-title="${escapeHtml(group.title)}" data-album-artist="${escapeHtml(artist)}" data-album-year="${escapeHtml(String(group["first-release-date"] || "").slice(0,4))}"><strong>${escapeHtml(artist)} · ${escapeHtml(group.title)}</strong><span>${escapeHtml(String(group["first-release-date"] || "Date unknown").slice(0,10))} · MusicBrainz release group</span><small>Open Miles album page →</small></button>${wishlistButton(artist,group.title,String(group["first-release-date"] || "").slice(0,4))}${compactStoreLinks(group.title,artist)}</div>`).join("");
  return `<details class="report-panel collapsible song-unowned-releases"><summary><span><small>ALBUM RELEASES NOT OWNED</small><strong>Other documented albums with this recording</strong></span><b>${missing.length} releases${loading ? " so far" : ""}</b></summary>${loading ? `<p class="muted song-release-loading">Checking additional releases in the background…</p>` : ""}<div class="album-list">${rows || `<p class="muted">${loading ? "Additional album matches will appear as research finishes." : "No additional album release groups were returned."}</p>`}</div><p class="fine-print">Release mappings from MusicBrainz; “not owned” means no title and artist match in your current Plex snapshot.</p></details>`;
}
