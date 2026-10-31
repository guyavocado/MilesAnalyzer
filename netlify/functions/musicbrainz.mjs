const ALLOWED_PATH = /^\/ws\/2\/(artist|release-group|release|recording|work)(\/[0-9a-f-]{36})?\/?\?/i;
const MIN_INTERVAL_MS = 1050;
const MAX_ATTEMPTS = 6;
const RETRYABLE_STATUS = new Set([429,500,502,503,504]);
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
const responseCache = new Map();
const pendingRequests = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve,milliseconds));

function retryDelay(response) {
  const value = response.headers.get("retry-after");
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1000,seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000,date - Date.now()) : 1000;
}

function enqueue(task) {
  const scheduled = requestQueue.then(task,task);
  requestQueue = scheduled.catch(() => {});
  return scheduled;
}

async function requestMusicBrainz(path) {
  let response, lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wait = Math.max(0,nextRequestAt - Date.now());
    if (wait) await sleep(wait);
    nextRequestAt = Date.now() + MIN_INTERVAL_MS;
    try {
      response = await fetch(`https://musicbrainz.org${path}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "MilesAnalyzer/0.3 (https://miles-analyzer.netlify.app/)"
        },
        signal: AbortSignal.timeout(9000)
      });
      if (!RETRYABLE_STATUS.has(response.status)) return {response,retries:attempt};
      nextRequestAt = Math.max(nextRequestAt,Date.now() + retryDelay(response));
    } catch (error) {
      lastError = error;
      nextRequestAt = Math.max(nextRequestAt,Date.now() + 1000);
    }
  }
  if (response) return {response,retries:MAX_ATTEMPTS - 1};
  throw lastError || new Error("MusicBrainz did not return a response");
}

export const handler = async (event) => {
  const path = event.queryStringParameters?.path || "";
  if (!ALLOWED_PATH.test(path)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unsupported MusicBrainz request" }) };
  }

  const cached = responseCache.get(path);
  if (cached && Date.now()-cached.savedAt < CACHE_TTL_MS) return {...cached.result,headers:{...cached.result.headers,"X-Miles-Cache":"hit"}};
  if (pendingRequests.has(path)) return pendingRequests.get(path);
  const pending = enqueue(async () => {
    try {
      const {response,retries} = await requestMusicBrainz(path);
      const body = await response.text();
      const result = {
        statusCode: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") || "application/json",
          "Cache-Control": response.ok ? "public, max-age=3600" : "no-store",
          "Netlify-CDN-Cache-Control": response.ok ? "public, durable, max-age=86400, stale-while-revalidate=3600" : "no-store",
          "Netlify-Vary": "query=path",
          "X-Miles-Retry-Count": String(retries)
        },
        body
      };
      if (response.ok) {
        responseCache.set(path,{result,savedAt:Date.now()});
        if (responseCache.size > MAX_CACHE_ENTRIES) responseCache.delete(responseCache.keys().next().value);
      }
      return result;
    } catch (error) {
      return { statusCode: 504, headers: { "Content-Type": "application/json", "Cache-Control":"no-store", "Netlify-CDN-Cache-Control":"no-store" }, body: JSON.stringify({ error: "The reference queue timed out" }) };
    }
  });
  pendingRequests.set(path,pending);
  try {return await pending;} finally {pendingRequests.delete(path);}
};
