let recommendationCatalog;
const recommendationLookup = new Map();
function recommendationArtistKey(value) {
  let key=songArtistKey(String(value).replace(/&/g," and ")).replace(/\band (?:the )?(?:wailers|revolution|new power generation|his orchestra)\b/g,"").replace(/\bthe\b/g,"").replace(/\s+/g," ").trim();
  if(key === "jimi hendrix experience") key="jimi hendrix";
  return key;
}
function recommendationTitleKey(value,artist) {
  let key=canonicalTitle(value).replace(/\b(?:disc|cd)\s*\d+\b/g,"").replace(/\b(?:19|20)\d{2}\b/g,"").trim();
  if (recommendationArtistKey(artist)==="beatles" && /^(?:the beatles|the beatles white album|white album|the white album)$/.test(key)) key="white album";
  if (recommendationArtistKey(artist)==="led zeppelin" && /^(?:untitled|iv|led zeppelin iv|led zeppelin 4)$/.test(key)) key="led zeppelin iv";
  return key;
}
function rankDecadeRecommendations(catalog,collection,decade) {
  const owned=new Set(), artistDepth=new Map(), genres=new Set();
  for(const item of collection) {
    const artist=recommendationArtistKey(item.artist);
    owned.add(artist+"|"+recommendationTitleKey(item.album,item.artist));
    artistDepth.set(artist,(artistDepth.get(artist)||0)+1);
    for(const genre of item.genres || []) genres.add(genre.toLowerCase());
  }
  const candidates=new Map();
  for(const album of catalog) {
    if(album.year<decade || album.year>=decade+10) continue;
    const artist=recommendationArtistKey(album.artist);
    const key=artist+"|"+recommendationTitleKey(album.title,album.artist);
    if(owned.has(key)) continue;
    const editorial=album.sources.filter(source=>/1001 Albums|Rolling Stone|NME|Pitchfork|Fantano/.test(source)).length;
    const recognition=Math.min(60,editorial ? 30+10*editorial : 25+5*Math.min(album.sources.length,3));
    const depth=artistDepth.get(artist)||0;
    const artistFit=depth ? Math.min(25,15+Math.round(Math.log2(depth+1)*2)) : 0;
    const genreFit=album.genres.some(genre=>genres.has(genre.toLowerCase())) ? 15 : 0;
    const scored={...album,key,score:recognition+artistFit+genreFit,recognition,artistFit,genreFit,depth};
    const previous=candidates.get(key);
    if(!previous || previous.score<scored.score) candidates.set(key,scored);
  }
  return [...candidates.values()].sort((a,b)=>b.score-a.score || b.sources.length-a.sources.length || b.depth-a.depth || a.year-b.year || a.title.localeCompare(b.title));
}
async function loadDecadeRecommendations(query,runId) {
  const panel=document.querySelector("#decade-recommendations");
  const decade=Math.floor(Number(String(query).match(/\d{4}/)?.[0])/10)*10;
  if(!panel || !Number.isFinite(decade)) return;
  MilesResearch.start(runId,"Decade",{recommendations:"Recommended Albums & Ownership Checks"});
  try {
    recommendationCatalog ||= fetchJson("./reference-data/recommended-albums.json");
    const data=await recommendationCatalog;
    if(runId!==reportRunId) return;
    const ranked=rankDecadeRecommendations(data.albums,library,decade);
    const top=ranked.slice(0,100);
    recommendationLookup.clear();
    top.forEach(album=>recommendationLookup.set(album.key,album));
    const rows=top.map((album,index)=>`<li class="decade-recommendation"><div class="recommendation-heading"><span class="recommendation-rank">#${index+1}</span><button type="button" data-recommended-album="${escapeHtml(album.key)}"><strong>${escapeHtml(album.title)}</strong><span>${escapeHtml(album.artist)} · ${album.year}</span></button><b class="recommendation-score">${album.score}<small>MILES / 100</small></b></div><p>${escapeHtml([...album.styles,...album.genres].filter((value,index,array)=>array.indexOf(value)===index).slice(0,3).join(" · "))}. Recognized by ${album.sources.length} reference list${album.sources.length===1?"":"s"}.${album.depth ? ` Connects to ${album.depth} ${escapeHtml(album.artist)} albums in your collection.` : " Adds an artist not matched in your collection."}</p><details><summary>Why This MILES Score?</summary><p>List recognition ${album.recognition}/60 · artist connection ${album.artistFit}/25 · genre connection ${album.genreFit}/15.</p><p>${escapeHtml(album.sources.join(" · "))}</p></details><div class="button-row">${wishlistButton(album.artist,album.title,String(album.year))}<a href="${escapeHtml(album.url)}" target="_blank" rel="noreferrer">Release reference ↗</a></div></li>`).join("");
    replaceReportHtml(panel,`<p class="eyebrow">RECOMMENDED ALBUMS YOU DON’T OWN</p><h3>Top ${top.length} Gaps From The ${decade}s</h3><p class="muted">${ranked.length} unmatched candidates, ordered by MILES priority. Artist and title matching consolidates common edition labels; compilations and unusual names can still need review.</p><p class="fine-print">MILES scores combine reference-list recognition, your artist holdings and genre connections. They express collection priority, rather than a published critic rating. Reference metadata: <a href="${escapeHtml(data.source)}" target="_blank" rel="noreferrer">album-list collection</a>.</p><ol class="decade-recommendations">${rows || '<li>No unmatched albums were found in the available reference catalog for this decade.</li>'}</ol>`);
    MilesResearch.done(runId,"recommendations");
  } catch(error) {
    recommendationCatalog=null;
    if(runId!==reportRunId) return;
    MilesResearch.unavailable(runId,"recommendations");
    replaceReportHtml(panel,'<p class="eyebrow">RECOMMENDED ALBUMS YOU DON’T OWN</p><h3>Recommendations Temporarily Unavailable</h3><p>The reference catalog did not load. Run this decade again to retry.</p>');
  }
}
document.querySelector("#report-content").addEventListener("click",event=>{
  const button=event.target.closest("[data-recommended-album]");
  if(!button) return;
  const album=recommendationLookup.get(button.dataset.recommendedAlbum);
  if(album) renderAlbumDetail({album:album.title,artist:album.artist,year:String(album.year),genres:album.genres,studio:""},true,true);
});
