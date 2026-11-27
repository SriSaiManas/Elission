const origin = 'https://leetcode.com';
function normalized(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
const units = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function spokenId(words) {
  const tokens = normalized(words).split(' ').filter(word => word !== 'and');
  if (tokens.length < 2 || tokens.length > 8) return null;
  if (tokens.every(word => units.indexOf(word) >= 0 && units.indexOf(word) <= 9)) return tokens.map(word => units.indexOf(word)).join('');
  function pair(items) {
    if (!items.length) return 0;
    const ten = tens.indexOf(items[0]), unit = units.indexOf(items[0]);
    if (items.length === 1) return ten >= 2 ? ten * 10 : unit;
    if (items.length === 2 && ten >= 2 && units.indexOf(items[1]) >= 1 && units.indexOf(items[1]) <= 9) return ten * 10 + units.indexOf(items[1]);
    return -1;
  }
  let total = 0;
  for (const [word,multiplier] of [['thousand',1000],['hundred',100]]) {
    const index = tokens.indexOf(word);
    if (index === -1) continue;
    const first = pair(tokens.splice(0,index));
    tokens.shift();
    if (first < 1) return null;
    total += first * multiplier;
  }
  let rest = pair(tokens);
  if (!total && rest < 0 && tokens.length >= 2) {
    const prefix = units.indexOf(tokens[0]), suffix = pair(tokens.slice(1));
    if (prefix >= 10 && suffix >= 0) return String(prefix * 100 + suffix);
  }
  if (rest < 0 || total + rest < 1) return null;
  return String(total + rest);
}
function intent(input) {
  const text = input.replace(/\b(?:leet|lead|lit)\s*code\b/gi,'LeetCode');
  if (!/\bleetcode\b/i.test(text)) return null;
  const lower = text.toLowerCase();
  const id = lower.match(/\b(?:problem|question|number)\s*#?\s*(\d+)\b/)?.[1]
    || lower.match(/\b(?:leetcode|solve|find|search for)\s+#?(\d+)\b/)?.[1];
  const named = text.replace(/^\s*(?:open|launch)\s+(?:chrome|edge)\s*[,;]?\s*/i,'').match(/\b(?:search(?:\s+for)?|find|open|solve)\s+(?:the\s+)?(?:leetcode\s+)?(?:problem\s+)?(.+?)(?=\s+on\s+leetcode\b|[,;]|\s+and\s+(?:solve|submit)\b|$)/i)?.[1]?.trim();
  const said = text.match(/\b(?:problem|question|number)\s+([a-z -]+?)(?=[,;.!?]|\s+and\s+(?:solve|submit)\b|$)/i)?.[1];
  const query = id || (said && spokenId(said)) || (named && !/^(?:chrome|edge|leetcode|it)$/i.test(named) ? named.replace(/[.!?]+$/,'') : '');
  if (!query && !/\b(open|go to|launch|submit)\b/i.test(lower)) return null;
  const repeat = lower.match(/\b(\d+|two|three)\s+times\b|\b(twice|thrice)\b/)?.slice(1).find(Boolean);
  const count = ['twice','two'].includes(repeat) ? 2 : ['thrice','three'].includes(repeat) ? 3 : repeat ? Number(repeat) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 3) throw Error('Ask for one to three submissions at a time.');
  return {query,chrome:/\bchrome\b/i.test(text),solve:/\b(?:solve|write.*solution)\b/i.test(text),submit:/\bsubmit\b/i.test(text) && !/\b(?:do not|don.t|never|without)\s+submit/i.test(text),count};
}
function findProblem(entries,query) {
  const key = normalized(query);
  const matches = entries.filter(item => item?.stat && (String(item.stat.frontend_question_id) === key
    || normalized(item.stat.question__title || '') === key || normalized(item.stat.question__title_slug || '') === key));
  if (matches.length !== 1) throw Error('I couldn’t match one LeetCode problem. Try its exact title or problem number.');
  const item = matches[0];
  const slug = item.stat.question__title_slug;
  if (!/^[a-z0-9-]{1,180}$/.test(slug)) throw Error('LeetCode returned an invalid problem link.');
  if (item.paid_only) throw Error('LeetCode marks this problem as Premium. Open it yourself if your account has access.');
  return {slug,title:item.stat.question__title,url:origin+'/problems/'+slug+'/'};
}
let catalog, catalogUntil = 0;
async function resolveProblem(query,signal) {
  if (!catalog || Date.now() >= catalogUntil) {
    const response = await fetch(origin+'/api/problems/all/',{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
    if (!response.ok) throw Error('LeetCode’s public catalog is unavailable. Open the problem manually and ask me to submit the current solution.');
    const data = await response.json();
    if (!Array.isArray(data.stat_status_pairs)) throw Error('LeetCode returned an invalid problem catalog.');
    catalog = data.stat_status_pairs;
    catalogUntil = Date.now()+3600000;
  }
  return findProblem(catalog,query);
}
module.exports = {intent,findProblem,resolveProblem};
