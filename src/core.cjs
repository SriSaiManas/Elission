const personality = 'You are ELISSION, a composed, articulate desktop companion. Be precise and candid. Use dry wit sparingly and never in serious or sensitive situations. Avoid stock assistant phrases and imitation of actors. Admit uncertainty. When writing a conversational reply, report only actions confirmed by the application. Never claim an action happened unless evidence says it did.';
const isWake = text => /^\s*(?:eli|ellie|elley)\s*[.!?]*\s*$/i.test(text);
const stripWake = text => text.replace(/^\s*(?:eli|ellie)\s*[,.:]\s*/i, '').trim();
function containsCredential(text) {
  return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|live-|test-)?|AKIA)[A-Za-z0-9_-]{16,}|\b(?:password|passphrase|api[ _-]?key|secret[ _-]?key|access[ _-]?token|card number|cvv|cvc)\s*(?:is\b|[=:]))/i.test(text)
    || /(?:^|\D)(?:\d[ -]?){13,19}(?:\D|$)/.test(text);
}
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
  text = text.trim().replace(/^(?:(?:hey\s+)?(?:eli|ellie)[,.:]?\s+|(?:can|could|would) you\s+|please\s+)+/i,'');
  const documentCommand = text.match(/^(open)(?: a| the)? (?:file|folder)$/i);
  if (documentCommand) return {action:'pick',value:/folder$/i.test(text) ? 'folder' : 'file'};
  for (const [regex, action] of [
    [/^(summarize|inspect) (?:the )?(?:active|current) (?:browser )?tab[.!]?$/i,'browser_tab'],
    [/^(?:read|extract) (?:the )?(table|tables) (?:from|in|on) (?:the )?(?:active|current) (?:browser )?tab[.!]?$/i,'browser_table'],
    [/^draft in textarea ([^:]+)\s*:\s*(.+)$/is,'browser_draft'],
    [/^generate java class ([A-Za-z][A-Za-z0-9_]{0,79})\s*:\s*(.+)$/is,'java_draft'],
    [/^inspect window (.+)$/i,'inspect_window'],
    [/^(inspect) (?:a |the )?project(?: folder)?[.!]?$/i,'project'],
    [/^(?:plan and run|run task)\s+(.+)$/is,'task'],
    [/^(?:open|launch)\s+(.+)$/i,'open'], [/^close\s+(.+)$/i,'close'], [/^switch to\s+(.+)$/i,'switch'],
    [/^(?:search Google(?: for)?|google)\s+(.+)$/i,'web_google'],
    [/^(?:look up|look this up|find out|research)\s+(.+)$/i,'web'],
    [/^find (documentation for .+)$/i,'web'],
    [/^(?:find|search installed apps(?: for)?)\s+(.+)$/i,'apps'], [/^search(?: the web)? for\s+(.+)$/i,'web'],
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
    if (match) return { action, value: action === 'browser_draft' ? {label:match[1].trim(),text:match[2].trim()} : action === 'java_draft' ? {name:match[1],instruction:match[2].trim()} : match[1] };
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
const ollamaDefaults = {
  endpoint:'http://localhost:11434/v1/chat/completions',
  model:'qwen3.5:4b'
};
async function detectOllama(signal = AbortSignal.timeout(3500)) {
  const response = await providerRequest('http://localhost:11434/api/tags','',signal,{method:'GET'});
  const data = await response.json();
  if (!Array.isArray(data.models)) throw Error('Ollama did not return a model list.');
  return data.models.map(entry => entry.model || entry.name).filter(name => typeof name === 'string');
}
function replyText() {
  let pending = '', hidden = false;
  return (chunk, done = false) => {
    pending += chunk;
    let output = '';
    while (pending) {
      const marker = hidden ? '</think>' : '<think>';
      const index = pending.toLowerCase().indexOf(marker);
      if (index >= 0) {
        if (!hidden) output += pending.slice(0,index);
        pending = pending.slice(index + marker.length);
        hidden = !hidden;
        continue;
      }
      let keep = done ? 0 : Math.min(marker.length - 1,pending.length);
      while (keep && !marker.startsWith(pending.slice(-keep).toLowerCase())) keep--;
      if (!hidden) output += pending.slice(0,pending.length - keep);
      pending = keep ? pending.slice(-keep) : '';
      break;
    }
    return output;
  };
}
async function streamChat({ endpoint, model, key, messages, signal, onPart }) {
  const response = await providerRequest(endpoint,key,signal,{
    method:'POST',body:JSON.stringify({model,messages,stream:true})
  });
  const redact = replyText();
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw Error('The provider returned no response.');
    const visible = redact(content,true);
    if (!visible.trim()) throw Error('The model returned no visible answer.');
    onPart(visible);
    return visible;
  }
  let result = '', buffer = '';
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  function finish() {
    const tail = redact('',true);
    result += tail;
    if (!result.trim()) throw Error('The model returned no visible answer.');
    if (tail) onPart(result);
    return result;
  }
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
          return finish();
        }
        let event;
        try { event = JSON.parse(payload); } catch { throw Error('The AI endpoint returned invalid streaming data.'); }
        if (event.error) throw Error('The AI server could not run this model. Check that it is available and supports chat completions.');
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          const text = redact(delta);
          result += text;
          if (text) onPart(result);
        }
      }
      if (done) break;
    }
    return finish();
  } catch (error) {
    if (signal?.aborted && signal.reason?.name === 'TimeoutError') throw Error('The AI request timed out.');
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
  }
}
module.exports = {isWake, stripWake, calculate, parse, streamChat, verifyModel, detectOllama, ollamaDefaults, containsCredential, personality};
