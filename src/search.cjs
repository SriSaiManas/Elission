const {parse} = require('parse5');

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child,visit);
}
function attr(node,name) {
  return node.attrs?.find(item => item.name === name)?.value;
}
function hasClass(node,name) { return (attr(node,'class') || '').split(/\s+/).includes(name); }
function text(node) {
  let value = '';
  walk(node,child => { if (child.nodeName === '#text') value += child.value; });
  return value.replace(/\s+/g,' ').trim();
}
function publicLink(raw) {
  try {
    let url = new URL(raw,'https://html.duckduckgo.com/');
    if (['duckduckgo.com','html.duckduckgo.com'].includes(url.hostname) && url.pathname === '/l/') {
      url = new URL(url.searchParams.get('uddg'));
    }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return;
    return url.href;
  } catch { return undefined; }
}
function parseSearchResults(html) {
  const results = [], seen = new Set();
  walk(parse(html),node => {
    if (results.length >= 5 || !hasClass(node,'result') || hasClass(node,'result--ad') || hasClass(node,'result--ads')) return;
    let link, snippet;
    walk(node,child => {
      if (!link && hasClass(child,'result__a')) link = child;
      if (!snippet && hasClass(child,'result__snippet')) snippet = child;
    });
    if (!link) return;
    const url = publicLink(attr(link,'href'));
    const title = text(link).slice(0,180);
    if (!url || !title || seen.has(url)) return;
    seen.add(url);
    results.push({title,url,snippet:snippet ? text(snippet).slice(0,380) : ''});
  });
  return results;
}
async function querySearch(query,signal,fetcher = fetch) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed || trimmed.length > 500) throw Error('Enter a search query between 1 and 500 characters.');
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q',trimmed);
  const deadline = AbortSignal.timeout(12000);
  try {
    const response = await fetcher(url,{
      redirect:'error',
      signal:signal ? AbortSignal.any([signal,deadline]) : deadline,
      headers:{Accept:'text/html', 'User-Agent':'ELISSION/2.0 (personal search; https://github.com/SriSaiManas/Elission)'}
    });
    if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/html')) throw Error('Search service unavailable.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = '', size = 0;
    try {
      while (true) {
        const {value,done} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 400000) throw Error('Search response exceeded its size limit.');
        body += decoder.decode(value,{stream:true});
      }
      body += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); }
    const results = parseSearchResults(body);
    if (!results.length) throw Error('Search returned no readable results.');
    return results;
  } catch {
    signal?.throwIfAborted();
    throw Error('DuckDuckGo did not return readable results. It may be unavailable or asking for a browser check.');
  }
}
function formatSources(results) {
  return results.map(({title,url,snippet},index) => (index+1) + '. ' + title + '\n' + (snippet ? snippet + '\n' : '') + url).join('\n\n');
}
module.exports = {querySearch,parseSearchResults,formatSources};
