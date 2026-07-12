
export default async function handler(req, res) {
  const lang = String(req.query.lang || '').trim();
  const query = String(req.query.query || '').trim();
  const reading = String(req.query.reading || '').trim();
  if (!lang || !query) {
    res.status(400).json({ error: 'Missing lang or query', examples: [] });
    return;
  }
  const searchUrl = new URL('https://tatoeba.org/en/sentences/search');
  searchUrl.searchParams.set('from', lang);
  searchUrl.searchParams.set('to', 'eng');
  searchUrl.searchParams.set('query', query);
  searchUrl.searchParams.set('sort', 'relevance');
  try {
    const response = await fetch(searchUrl, { headers: { 'user-agent': 'Mozilla/5.0 AIDA Example Lookup' } });
    const html = await response.text();
    const examples = extractExamplesFromHtml(html, { lang, query, reading }).slice(0, 3);
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ examples });
  } catch (error) {
    res.status(200).json({ examples: [], error: String(error && error.message || error) });
  }
}

function decode(text = '') {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function clean(text = '') {
  return decode(String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function pushUnique(out, seen, example) {
  const text = clean(example.text);
  const translation = clean(example.translation);
  if (!text || !translation) return;
  const key = `${text}||${translation}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ text, translation, reading: clean(example.reading), source: 'Online example lookup' });
}

function extractExamplesFromHtml(html, meta) {
  const out = [];
  const seen = new Set();
  const patterns = [
    /"text":"([^"]+)","lang":"(?:jpn|yue)"[^]*?"translations":\[([^]*?)\]/g,
    /<div[^>]*class="text"[^>]*>([^<]+)<\/div>[^]*?<div[^>]*class="translations"[^>]*>([^]*?)<\/div>/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && out.length < 3) {
      const text = clean(match[1]);
      const block = match[2] || '';
      const translationMatch = block.match(/English[^]*?"text":"([^"]+)"/) || block.match(/<div[^>]*class="text"[^>]*>([^<]+)<\/div>/);
      const translation = clean(translationMatch ? translationMatch[1] : '');
      if (!text || !translation) continue;
      if (meta.query && !text.includes(meta.query.replace(/^〜|~|-/g, ''))) continue;
      pushUnique(out, seen, { text, translation, reading: meta.lang === 'yue' ? meta.reading : '' });
    }
    if (out.length) break;
  }
  return out;
}
