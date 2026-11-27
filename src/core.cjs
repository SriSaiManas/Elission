const personality = 'You are ELISSION, a composed, articulate desktop companion. Be precise and candid. Use dry wit sparingly and never in serious or sensitive situations. Avoid stock assistant phrases and imitation of actors. Admit uncertainty. You cannot perform actions through this chat response. Never claim an action happened unless evidence says it did.';
const isWake = text => /^\s*(?:eli|ellie|elley)\s*[.!?]*\s*$/i.test(text);
const stripWake = text => text.replace(/^\s*(?:eli|ellie)\s*[,.:]\s*/i, '').trim();
function calculate(input) {
  const parts = input.match(/\d+(?:\.\d+)?|[()+*/%-]/g) || [];
  if (input.length > 200 || parts.join('') !== input.replace(/\s/g, '')) throw Error('Use numbers, parentheses, and arithmetic operators.');
  let index = 0;
  function factor() {
    const token = parts[index++];
    if (token === '-') return -factor();
    if (token === '(') {
      const result = sum();
      if (parts[index++] !== ')') throw Error('Expected a closing parenthesis.');
      return result;
    }
    if (!token || !/^\d/.test(token)) throw Error('Expected a number.');
    return Number(token);
  }
  function product() {
    let result = factor();
    while (['*','/','%'].includes(parts[index])) {
      const operator = parts[index++];
      const next = factor();
      result = operator === '*' ? result * next : operator === '/' ? result / next : result % next;
    }
    return result;
  }
  function sum() {
    let result = product();
    while (['+','-'].includes(parts[index])) {
      const operator = parts[index++];
      const next = product();
      result += operator === '+' ? next : -next;
    }
    return result;
  }
  const result = sum();
  if (index !== parts.length || !Number.isFinite(result)) throw Error('Invalid or non-finite calculation.');
  return result;
}
function parse(text) {
  const documentCommand = text.match(/^(open)(?: a| the)? (?:file|folder)$/i);
  if (documentCommand) return {action:'pick',value:/folder$/i.test(text) ? 'folder' : 'file'};
  for (const [regex, action] of [
    [/^(?:open|launch)\s+(.+)$/i,'open'], [/^close\s+(.+)$/i,'close'], [/^switch to\s+(.+)$/i,'switch'],
    [/^(?:find|search installed apps(?: for)?)\s+(.+)$/i,'apps'], [/^(?:search(?: the web)? for|google)\s+(.+)$/i,'web'],
    [/^(?:set )?volume(?: to)? (\d+)%?$/i,'volume'], [/^(?:set )?brightness(?: to)? (\d+)%?$/i,'brightness'],
    [/^(mute|unmute)(?: audio)?$/i,'mute'], [/^(play|pause|next track|previous track)$/i,'media'],
    [/^(?:take (?:a )?)?(screenshot)$/i,'screenshot'],
    [/^(?:(?:check|show(?: me)?|what(?:'s| is)) (?:my |the )?)?(cpu|memory usage|battery)(?: usage| utilization| status| level| charge)?[?!.]?$/i,'status'],
    [/^(?:what(?:'s| is) (?:the )?|current )?(date|time)\??$/i,'date'],
    [/^(?:take a note|note)\s*[: ]\s*(.+)$/i,'note'], [/^remember\s+(.+)$/i,'remember'],
    [/^remind me in (\d+ (?:seconds?|minutes?|hours?) to .+)$/i,'reminder'],
    [/^calculate\s+(.+)$/i,'calculate'], [/^(summarize)(?: this| a| the)? (?:file|document)$/i,'summarize'],
    [/^(move)(?: a| this| the)? file$/i,'move']
  ]) {
    const match = text.match(regex);
    if (match) return { action, value: match[1] };
  }
}
async function providerRequest(endpoint, key, signal, options) {
  const url = new URL(endpoint);
  if (url.username || url.password) throw Error('Use an endpoint without embedded credentials.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw Error('Use HTTPS or a loopback HTTP endpoint.');
  let response;
  try {
    response = await fetch(url, {
      ...options, redirect:'error', signal,
      headers:{'Content-Type':'application/json', ...(key && {Authorization:'Bearer ' + key})}
    });
  } catch {
    if (signal?.aborted && signal.reason?.name !== 'TimeoutError') throw signal.reason;
    if (signal?.aborted) throw Error('The AI request timed out. Check that the server is running and try again.');
    throw Error('Cannot reach the AI endpoint. Check its URL, network connection, and TLS settings.');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    if ([401,403].includes(response.status)) throw Error('AI provider returned HTTP ' + response.status + ': credentials were rejected or lack model access.');
    if (response.status === 404) throw Error('The model or Chat Completions endpoint was not found. Check the model ID and URL.');
    if (response.status === 429) throw Error('The AI provider is rate-limited or out of quota.');
    if (response.status >= 500) throw Error('The AI server is unavailable. Check its status and try again.');
    throw Error('AI provider returned HTTP ' + response.status + '. Check that the model accepts OpenAI-compatible chat requests.');
  }
  return response;
}
async function verifyModel({provider,endpoint,model,key,signal}) {
  if (provider === 'local') {
    const modelsUrl = new URL(endpoint);
    if (!/\/chat\/completions\/?$/.test(modelsUrl.pathname)) throw Error('Enter the local server’s OpenAI-compatible /chat/completions URL.');
    modelsUrl.pathname = modelsUrl.pathname.replace(/\/chat\/completions\/?$/,'/models');
    const response = await providerRequest(modelsUrl,key,signal,{method:'GET'});
    const list = await response.json().catch(() => null);
    if (!Array.isArray(list?.data)) throw Error('The local server did not return an OpenAI-compatible model list.');
    if (!list.data.some(entry => entry?.id === model)) throw Error('Model unavailable on the local server. Start or install it and enter its exact model ID.');
  }
  return streamChat({
    endpoint,model,key,signal,
    messages:[{role:'user',content:'Reply with the word OK.'}],
    onPart:() => {}
  });
}
async function streamChat({ endpoint, model, key, messages, signal, onPart }) {
  const response = await providerRequest(endpoint,key,signal,{
    method:'POST',body:JSON.stringify({model,messages,stream:true})
  });
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw Error('The provider returned no response.');
    onPart(content);
    return content;
  }
  let result = '', buffer = '';
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value, {stream:!done});
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          if (!result.trim()) throw Error('The provider returned no response.');
          return result;
        }
        let event;
        try { event = JSON.parse(payload); } catch { throw Error('The AI endpoint returned invalid streaming data.'); }
        if (event.error) throw Error('The AI server could not run this model. Check that it is available and supports chat completions.');
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          result += delta;
          onPart(result);
        }
      }
      if (done) break;
    }
    if (!result.trim()) throw Error('The provider returned no response.');
    return result;
  } catch (error) {
    if (signal?.aborted && signal.reason?.name === 'TimeoutError') throw Error('The AI request timed out.');
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
module.exports = {isWake, stripWake, calculate, parse, streamChat, verifyModel, personality};
