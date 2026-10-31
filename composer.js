// Composer reports follow works across performers and compilation albums.
const LISZT_WORKS = [
  ["Piano Sonata In B Minor","S.178",98,["sonata in b minor","sonata b minor"],"A single continuous sonata that transforms a small group of themes across sharply contrasting characters."],
  ["Transcendental Études","S.139",97,["transcendental","transcendante"],"Twelve studies turn virtuoso technique into character pieces; Mazeppa, Feux follets and Chasse-neige offer contrasting entry points."],
  ["Années De Pèlerinage","S.160 / S.161 / S.163",96,["annees de pelerinage","années de pèlerinage","years of pilgrimage","vallee d obermann","dante sonata"],"Three books respond to landscapes, literature and art. Vallée d’Obermann and the Dante Sonata reward listening beyond the showpieces."],
  ["Grandes Études De Paganini","S.141",94,["paganini","la campanella"],"Six studies translate violin virtuosity to the piano, including the repeated notes and leaps of La campanella."],
  ["Hungarian Rhapsodies","S.244",94,["hungarian rhapsod","rhapsodie hongrois","ungarische rhapsod"],"Nineteen piano rhapsodies contrast spacious introductions with accelerating dance sections. No. 2 is a starting point rather than the whole collection."],
  ["Piano Concerto No. 1","S.124",93,["piano concerto no 1","piano concerto 1","concerto for piano no 1"],"The E-flat concerto links four sections through returning material and makes the triangle an unusually prominent orchestral voice."],
  ["Les Préludes","S.97",92,["les preludes","les préludes"],"This symphonic poem transforms recurring ideas through reflective, pastoral and martial episodes; it opens the orchestral side of Liszt."],
  ["Harmonies Poétiques Et Religieuses","S.173",92,["harmonies poetiques","harmonies poétiques","benediction de dieu","bénédiction de dieu","funerailles","funérailles"],"A ten-piece cycle spanning prayer, contemplation and mourning; Bénédiction de Dieu dans la solitude and Funérailles are key works."],
  ["Piano Concerto No. 2","S.125",91,["piano concerto no 2","piano concerto 2","concerto for piano no 2"],"The A-major concerto unfolds as a continuous span in which lyrical themes change tempo, texture and dramatic function."],
  ["A Faust Symphony","S.108",91,["faust symphony","faust symphonie","faust-symphonie"],"Three character portraits explore Faust, Gretchen and Mephistopheles through thematic transformation on an orchestral scale."],
  ["Totentanz","S.126",90,["totentanz","dance of death"],"Variations on the Dies irae chant pit percussive piano writing against the orchestra in a concentrated, dark showpiece."],
  ["Liebesträume","S.541",89,["liebestraum","liebesträum","dreams of love"],"Three nocturnes rework Liszt’s songs for piano. No. 3’s lyrical line needs to remain audible through its surrounding figuration."],
  ["Mephisto Waltz No. 1","S.514",89,["mephisto waltz no 1","mephisto waltz 1","mephisto-walzer nr 1","mephisto waltz"],"A volatile dance inspired by Lenau’s Faust, mixing obsessive rhythmic drive with seductive lyrical interruptions."],
  ["Consolations","S.172",88,["consolation"],"Six concise piano pieces offer a quieter route into Liszt, especially the sustained cantabile of No. 3."],
  ["Nuages Gris","S.199",87,["nuages gris","grey clouds","gray clouds"],"A brief late work whose unresolved harmony and spare texture reveal an exploratory side far removed from concert virtuosity."]
].map(([title,catalogue,score,aliases,note])=>({title,catalogue,score,aliases,note,source:"https://www.liszt.org/p/franz-liszt-works.html"}));
const composerAlbumCache=new Map();
function composerTextKey(value) {return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function composerWorkMatches(work,title,lisztContext=false) {
  const key=composerTextKey(title);
  const numbers=[...work.catalogue.matchAll(/S\.(\d+)/g)].map(match=>match[1]);
  if(numbers.some(number=>new RegExp("\\bs\\s*"+number+"\\b").test(key))) return true;
  const alias=work.aliases.some(value=>key.includes(composerTextKey(value)));
  // Common concerto/sonata names require an explicit composer context.
  return alias && (lisztContext || key.includes("liszt") || !/concerto|sonata in b minor/i.test(work.title));
}
async function fetchComposerAlbumReference(item,isLiszt) {
  // The 2011 Hyperion box has different word order in Plex and MusicBrainz.
  // Its identity is verified against Hyperion CDS44501/98, rather than a loose title hit.
  if(isLiszt && /^(?:liszt: )?(?:the )?complete (?:liszt )?piano music$/i.test(item.album) && item.year==="2011" && /hyperion/i.test(item.studio)) {
    const release=await fetchJson(musicBrainzUrl("/ws/2/release/8a4365ca-02ca-49e2-af3c-676eac91018c?inc=recordings+artist-credits&fmt=json"));
    if(release.id!=="8a4365ca-02ca-49e2-af3c-676eac91018c") throw new Error("The reference edition did not match");
    return {release};
  }
  try {return await fetchAlbumReference(item);} catch(error) {
    const title=item.album.replace(/^\s*(?:Franz\s+)?Liszt\s*:\s*/i,"");
    if(isLiszt && title!==item.album) return fetchAlbumReference({...item,album:title});
    throw error;
  }
}
function composerTrackRows(item,reference) {
  return (reference?.release?.media || []).flatMap(medium=>(medium.tracks || []).map(track=>{
    const recording=track.recording || {};
    const composers=(recording.relations || []).filter(row=>/composer/i.test(row.type || "")).map(row=>row.artist?.name || "");
    return {title:track.title || recording.title || "",item,referenceUrl:reference.release?.id ? `https://musicbrainz.org/release/${reference.release.id}` : "",lisztContext:/liszt/i.test(item.album+" "+item.artist+" "+composers.join(" ")),recordingId:recording.id || ""};
  }));
}
function renderComposerReport(query,runId) {
  const isLiszt=/\bliszt\b/i.test(query);
  const name=isLiszt ? "Franz Liszt" : query;
  const works=isLiszt ? LISZT_WORKS : [];
  const candidates=library.filter(item=>isLiszt ? /liszt/i.test(item.artist+" "+item.album) || item.genres.some(genre=>/classical|romantic|orchestral|piano/i.test(genre)) || /classical|great composers|piano masterpieces/i.test(item.album) : songArtistKey(item.artist).includes(songArtistKey(query)) || item.album.toLowerCase().includes(query.toLowerCase()));
  candidates.sort((a,b)=>Number(/liszt/i.test(b.album+" "+b.artist))-Number(/liszt/i.test(a.album+" "+a.artist)));
  const unique=[...new Map(candidates.map(item=>[songArtistKey(item.artist)+"|"+canonicalTitle(item.album),item])).values()];
  const matches=new Map(works.map(work=>[work.title,[]]));
  let scanned=0,successful=0;
  els.reportContent.innerHTML=`<div class="report-header"><p class="eyebrow">A COMPOSER INTELLIGENCE REPORT</p><h2 class="report-title">${escapeHtml(name)}</h2><span class="verdict">Compositions, Recordings &amp; Your Collection</span><div class="wishlist-action">${wishlistButton(name,name,"","Artist")}</div></div><section id="standalone-artist-biography" class="report-panel"><p class="eyebrow">ARTIST BIOGRAPHY</p><h3>Researching ${escapeHtml(name)}…</h3></section><section id="composer-key-works" class="report-panel"></section><section id="composer-collection" class="report-panel"></section>`;
  const draw=()=>{
    if(runId!==reportRunId) return;
    replaceReportHtml(document.querySelector("#composer-key-works"),`<p class="eyebrow">KEY COMPOSITIONS</p><h3>Essential Works To Know</h3>${works.length ? `<p class="muted">MILES scores express editorial listening priority, ordered highest first. A work can span several tracks and appear on many performers’ albums.</p><ol class="composer-works">${works.map(work=>`<li><div class="recommendation-heading"><strong>${escapeHtml(work.title)}<small>${escapeHtml(work.catalogue)}</small></strong><b class="recommendation-score">${work.score}<small>MILES / 100</small></b></div><p>${escapeHtml(work.note)}</p><p>${matches.get(work.title).length ? `${matches.get(work.title).length} matching reference track${matches.get(work.title).length===1 ? "" : "s"} on albums matched to Plex` : scanned<unique.length ? "Checking your recordings…" : "No matching reference track found in the checked albums"}</p><a href="${work.source}" target="_blank" rel="noreferrer">Work catalogue ↗</a><div class="button-row">${trackSongActions(work.title,name,"")}${wishlistButton(name,work.title,"","Song")}</div></li>`).join("")}</ol><p class="fine-print">Work descriptions are Miles’ listening guidance. Catalogue reference: American Liszt Society. Additional reading: <a href="https://www.henle.de/Transcendental-Studies/HN-717" target="_blank" rel="noreferrer">Henle’s Transcendental Studies</a> · <a href="https://www.laphil.com/works/piano-concerto-no-1-liszt" target="_blank" rel="noreferrer">LA Phil concerto notes</a>.</p>` : `<p class="muted">A sourced work guide has not yet been added for this composer. The biography is researched independently.</p>`}`);
    const found=[...matches.entries()].filter(([,rows])=>rows.length);
    replaceReportHtml(document.querySelector("#composer-collection"),`<p class="eyebrow">COMPOSITIONS IN YOUR COLLECTION</p><h3>Tracks Across Albums &amp; Compilations</h3><p class="muted">${scanned} of ${unique.length} candidate albums checked · ${successful} matched reference track lists. Checks include classical compilations regardless of album artist.</p>${found.map(([title,rows])=>`<h4>${escapeHtml(title)}</h4><ul class="composer-track-matches">${rows.map(row=>`<li><button class="track-drill" type="button" data-report-scope="Song" data-value="${escapeHtml(row.title)}" data-song-artist="${escapeHtml(name)}" data-recording-id="${escapeHtml(row.recordingId)}"><strong>${escapeHtml(row.title)}</strong></button><button type="button" class="album" data-album="${escapeHtml(row.item.album)}" data-artist="${escapeHtml(row.item.artist)}">${escapeHtml(row.item.album)} · ${escapeHtml(referenceArtistName(row.item.artist))}</button>${row.referenceUrl ? `<a href="${row.referenceUrl}" target="_blank" rel="noreferrer">Reference Track List ↗</a>` : ""}</li>`).join("")}</ul>`).join("") || `<p class="muted">${scanned<unique.length ? "Looking for individual compositions rather than relying on album titles." : "No work-level matches were returned. Unmatched or unavailable reference editions cannot establish that a work is missing."}</p>`}<p class="fine-print">These matches use the track list of a reference edition for an album you own. Matches can include piano arrangements, excerpts or earlier versions; read the individual track title. Your exact pressing may differ. This Plex export contains album metadata, so a direct track export would provide stronger confirmation.</p>`);
    MilesResearch.label(runId,"tracks",`Composition Tracks (${scanned}/${unique.length} Albums Checked)`);
  };
  MilesResearch.start(runId,"Composer",{biography:"Composer Biography",tracks:"Composition Tracks & Compilation Albums"});
  draw();
  els.report.scrollIntoView({behavior:"smooth",block:"start"});
  MilesResearch.track(runId,"biography",fetchArtistWikipediaSummary(name)).then(article=>{
    if(runId===reportRunId) replaceReportHtml(document.querySelector("#standalone-artist-biography"),artistBiographyHtml(name,article));
  }).catch(()=>{if(runId===reportRunId) replaceReportHtml(document.querySelector("#standalone-artist-biography"),artistBiographyHtml(name,null));});
  if(!works.length) {MilesResearch.done(runId,"tracks");return;}
  let next=0;
  const worker=async()=>{
    while(next<unique.length && runId===reportRunId) {
      const item=unique[next++];
      const key=songArtistKey(item.artist)+"|"+canonicalTitle(item.album);
      try {
        if(!composerAlbumCache.has(key)) composerAlbumCache.set(key,fetchComposerAlbumReference(item,isLiszt).catch(error=>{composerAlbumCache.delete(key);throw error;}));
        const reference=await composerAlbumCache.get(key);
        if(runId!==reportRunId) return;
        const tracks=composerTrackRows(item,reference);
        if(tracks.length) successful++;
        for(const work of works) matches.get(work.title).push(...tracks.filter(track=>composerWorkMatches(work,track.title,track.lisztContext)));
      } catch(error) {/* Count attempts and expose unmatched track lists accurately. */}
      scanned++;draw();
    }
  };
  Promise.all([worker(),worker()]).then(()=>{
    if(runId!==reportRunId) return;
    if(successful<unique.length) MilesResearch.unavailable(runId,"tracks"); else MilesResearch.done(runId,"tracks");
    draw();
  });
}
