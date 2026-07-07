// WhatsApp-style link previews: fetch the first URL in a message and extract
// OpenGraph/title metadata. Best-effort — any failure just means no preview.
//
// SSRF guard: only http(s), and never fetch obviously-internal hosts. The
// fetch is capped by a short timeout and we only read a limited slice of the
// body, so a slow/huge page can't stall message sending.

const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

const LINK_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'co', 'in', 'uk', 'us', 'ca', 'au',
  'de', 'fr', 'jp', 'cn', 'br', 'ru', 'it', 'es', 'nl', 'se', 'no', 'ch', 'sg', 'ae',
  'info', 'biz', 'me', 'ai', 'app', 'dev', 'xyz', 'tech', 'store', 'online', 'site', 'live',
  'news', 'blog', 'cloud', 'finance', 'money', 'bank', 'fund', 'capital', 'invest', 'ind',
]);
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d+)?(?:\/[^\s<>"']*)?/i;

// Returns the first web address in the text (schemed OR a bare domain such as
// `fintness.in` / `www.x.in`), normalized to an https:// URL, or null. Mirrors
// the frontend's link detection so previews and clickable links agree.
export const firstUrlIn = (text = '') => {
  const m = text.match(URL_RE);
  if (!m) return null;
  const token = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
  const noScheme = token.replace(/^https?:\/\//i, '');
  const hasScheme = /^https?:\/\//i.test(token);
  const isWww = /^www\./i.test(noScheme);
  const host = noScheme.split(/[/:?#]/)[0];
  const tld = host.split('.').pop().toLowerCase();
  if (!hasScheme && !isWww && !LINK_TLDS.has(tld)) return null;
  return hasScheme ? token : `https://${token}`;
};

const pick = (html, patterns) => {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return '';
};

const decodeEntities = (s = '') =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

export async function fetchLinkPreview(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (BLOCKED_HOST.test(parsed.hostname)) return null;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FintnessCRM-LinkPreview/1.0)' },
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('text/html')) return null;

    // Only read the head-ish portion — og tags live early in the document.
    const html = (await res.text()).slice(0, 200_000);

    const title = decodeEntities(pick(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]));
    const description = decodeEntities(pick(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]));
    let image = pick(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ]);
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, url).href; } catch { image = ''; }
    }

    if (!title && !description) return null;
    return {
      url,
      title: title.slice(0, 200),
      description: description.slice(0, 300),
      image: image.slice(0, 1000),
      siteName: parsed.hostname.replace(/^www\./, ''),
    };
  } catch {
    return null;
  }
}
