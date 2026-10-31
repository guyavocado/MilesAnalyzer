# MilesAnalyzer

Miles is a mobile-first Plex collection-intelligence application. It scores holdings, exposes genre and era shape, checks artist studio-album coverage, flags metadata problems, and provides MusicBrainz-backed artist and album drill-downs alongside the local Plex catalog.

## Privacy

The Plex catalog snapshot is supplied separately for deployment and is excluded from this public source repository. Never add Plex credentials, tokens, passwords, server addresses, API keys, or unapproved exports. User-selected replacement CSV/JSON files remain in that browser's IndexedDB.

## Run locally

Serve the repository root with any static web server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Netlify

The repository includes `netlify.toml` and needs no build command. The production site must be connected in Netlify and configured to publish from `main`; Netlify serves the repository root. The approved catalog snapshot must be added to `reference-data/Plex-Music-Library.csv` in an authorized deployment step, since it is intentionally omitted from the public repository.

## Current analysis surface

Reports use a layered structure: an executive summary and transparent 0–100 Miles score; genre scores, key holdings, era map, reference-catalog gaps, and metadata health; then expandable evidence and MusicBrainz-backed album details. The preloaded snapshot is still album-level, so authoritative song, contributor, composer, and instrument analysis requires a track-and-credit export or deeper Plex sync.


## Listening tools

Song reports include guitar chord searches, sourced form/harmony/rhythm/arrangement details, a focused listening guide, recording metadata comparisons, musical connections, notes and source confidence. Musical source coverage varies by song; unknown fields remain explicit. The selected recording takes precedence when opening a version. Musical theory for a cover is not copied from the original artist's article.

Notes, favorite versions and favorite discoveries stay in this browser's local storage. They appear in the listening notebook and on album/song reports. Collection discovery offers random picks, least recently explored albums (Miles report visits, not playback history), and instrument matches from verified credits encountered during the session. Connections use documented recording relationships, shared contributors and sourced musical traits among reports explored during the session. Similarity does not establish influence.

## Reference performance

The main song report renders before exhaustive release research finishes. Release panels update independently, preserving notes and controls. Successful reference JSON responses are cached for an hour in the page, with simultaneous requests coalesced; failed requests are retryable. The MusicBrainz proxy keeps a bounded warm-instance cache and coalesces requests, while Netlify's durable CDN cache is configured to vary by the `path` query parameter. These changes preserve the full release lookup and upstream pacing. Live timing and CDN behavior must be verified after deployment.

## Miles menu

The main page keeps compact collection stats in one row above Run Miles. Menu opens Collection (larger stats and snapshot import, reconnect, disconnect), Wishlist, Explore Your Collection, The Tangled Web, and Listening Notebook. Existing report-path links remain available. Wishlist entries support songs, albums, and artists, reopen the matching report type, and preserve previously saved album entries. Lists and collection management are shown only through the menu. Plex controls manage the existing metadata snapshot; they do not establish a live Plex account connection.

Instrument introductions use short paragraphs. The Tangled Web keeps a current-position cursor across the full session path, supports Back/Forward, and restores saved report HTML across report types. Earlier-stop navigation preserves later stops; a new report appends to the journey. Pending lookups are rerun when revisited instead of restoring a frozen loading panel.
