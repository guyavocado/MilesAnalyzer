# Miles project

- Canonical production URL: https://miles-analyzer.netlify.app/
- Intended source repository: https://github.com/guyavocado/MilesAnalyzer (main). Verify write access and a Netlify Git link before calling it the deployment source.
- Netlify serves the repository root using `netlify.toml`; `netlify/functions/musicbrainz.mjs` proxies MusicBrainz requests.
- The Plex catalog snapshot is local at `reference-data/Plex-Music-Library.csv` and excluded from public Git history. It is needed for the preloaded collection. Do not publish it to a public repository without explicit approval for that destination.
- A release is complete only after production `app.js` matches the intended commit and a live song search shows Neil Diamond as the primary artist for “Sweet Caroline,” with Frank Sinatra among documented covers where supplied by reference data.
- If GitHub or Netlify authorization is absent, state the missing access precisely. Do not describe a local ZIP, Library update, or Git commit as a production deployment.
