'use strict';
let connection, keepalive, granted;
const jobs = new Map();

function disconnect() {
  connection?.close();
  connection = granted = undefined;
  clearInterval(keepalive);
  for (const job of jobs.values()) job.abort();
}
function pair(code) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw Error('Enter the pairing code from ELISSION Settings.');
  disconnect();
  const peer = connection = new WebSocket('ws://127.0.0.1:18461/elission');
  return new Promise((resolve,reject) => {
    let ready = false;
    const timeout = setTimeout(() => { peer.close(); reject(Error('ELISSION did not accept the pairing code.')); },4000);
    peer.onopen = () => peer.send(JSON.stringify({token:code}));
    peer.onclose = () => {
      clearTimeout(timeout);
      if (connection === peer) disconnect();
      if (!ready) reject(Error('Connection failed. Generate a new code in desktop Settings.'));
    };
    peer.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        ready = true;
        clearTimeout(timeout);
        keepalive = setInterval(() => peer.send('{"type":"ping"}'),15000);
        resolve();
      } else if (ready && message.type === 'job') void handleJob(peer,message);
      else if (ready && message.type === 'cancel') jobs.get(message.id)?.abort();
    };
  });
}

async function search(query,signal) {
  if (typeof query !== 'string' || !query.trim() || query.length > 500) throw Error('Invalid search query.');
  if (!await chrome.permissions.contains({origins:['https://www.google.com/*']})) throw Error('Enable verified Google search in the ELISSION extension popup.');
  const target = new URL('https://www.google.com/search');
  target.searchParams.set('q',query.trim());
  signal.throwIfAborted();
  const created = await chrome.tabs.create({url:target.href,active:true});
  for (let i = 0; i < 55; i++) {
    signal.throwIfAborted();
    const tab = await chrome.tabs.get(created.id);
    if (tab.status === 'complete' && tab.url) {
      const actual = new URL(tab.url);
      if (actual.origin === target.origin && actual.pathname === target.pathname && actual.searchParams.get('q') === query.trim()) return {url:actual.href};
      throw Error('Google did not reach the requested search URL. Check the browser for a redirect or consent prompt.');
    }
    await new Promise(resolve => setTimeout(resolve,250));
  }
  throw Error('The search tab did not finish loading.');
}
function readPage() {
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility === 'visible';
  const fields = [...document.querySelectorAll('textarea')].filter(field => visible(field) && !field.disabled && !field.readOnly);
  return {
    title:document.title.slice(0,300),
    location:location.origin + location.pathname,
    text:(document.body?.innerText || '').slice(0,10000),
    tables:[...document.querySelectorAll('table')].filter(visible).slice(0,8).map(table =>
      [...table.rows].filter(visible).slice(0,30).map(row =>
        [...row.cells].filter(visible).slice(0,12).map(cell => cell.innerText.trim().slice(0,160)))),
    fields:fields.slice(0,20).map(field => ({
      label:(field.labels?.[0]?.innerText || field.getAttribute('aria-label') || field.placeholder || '').trim().slice(0,120)
    }))
  };
}
function fillDraft(label,text) {
  const fields = [...document.querySelectorAll('textarea')].filter(field =>
    field.getClientRects().length && getComputedStyle(field).visibility === 'visible' && !field.disabled && !field.readOnly &&
    (field.labels?.[0]?.innerText || field.getAttribute('aria-label') || field.placeholder || '').trim() === label);
  if (fields.length !== 1 || fields[0].value || (fields[0].maxLength >= 0 && text.length > fields[0].maxLength)) return false;
  const field = fields[0];
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,text);
  field.dispatchEvent(new Event('input',{bubbles:true}));
  return field.isConnected && field.value === text;
}
async function page(action,args,signal) {
  const grant = granted;
  if (!grant) throw Error('Open the browser tab and select Allow this tab in the extension popup.');
  const tab = await chrome.tabs.get(grant.tabId);
  if (!tab.active || tab.status !== 'complete' || tab.url !== grant.url) throw Error('The approved page is no longer active. Reopen it and allow it again.');
  signal.throwIfAborted();
  if (grant !== granted) throw Error('Browser approval changed.');
  const draft = action === 'draft';
  if (draft && (typeof args.label !== 'string' || !args.label || args.label.length > 120 || typeof args.text !== 'string' || !args.text || args.text.length > 4000)) throw Error('Invalid textarea draft.');
  const [execution] = await chrome.scripting.executeScript({
    target:{tabId:grant.tabId,documentIds:[grant.documentId]},
    func:draft ? fillDraft : readPage, args:draft ? [args.label,args.text] : []
  });
  if (grant !== granted || execution?.documentId !== grant.documentId) throw Error('The approved page changed during the action.');
  if (draft && execution.result !== true) throw Error('Could not verify the draft. Use an empty textarea with one unique label.');
  return draft ? {filled:true} : execution.result;
}

async function handleJob(peer,{id,action,args}) {
  const job = new AbortController();
  jobs.set(id,job);
  try {
    if (!['search','observe','draft'].includes(action)) throw Error('Unsupported browser action.');
    const result = action === 'search' ? await search(args.query,job.signal) : await page(action,args,job.signal);
    const envelope = JSON.stringify({id,result});
    if (new TextEncoder().encode(envelope).length > 90 * 1024) throw Error('This tab exposes more data than ELISSION can read in one snapshot.');
    if (!job.signal.aborted && peer.readyState === WebSocket.OPEN) peer.send(envelope);
  } catch (error) {
    if (!job.signal.aborted && peer.readyState === WebSocket.OPEN) peer.send(JSON.stringify({id,error:error.message}));
  } finally {
    jobs.delete(id);
  }
}
chrome.tabs.onUpdated.addListener((tabId,change) => {
  if (granted?.tabId === tabId && (change.status === 'loading' || change.url)) granted = undefined;
});
chrome.tabs.onRemoved.addListener(tabId => { if (granted?.tabId === tabId) granted = undefined; });
chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if (sender.url !== chrome.runtime.getURL('popup.html')) return;
  async function run() {
    if (message.action === 'status') return connection?.readyState === WebSocket.OPEN ? 'Connected.' : 'Disconnected.';
    if (message.action === 'pair') { await pair(message.code); return 'Connected. Allow an individual tab when needed.'; }
    if (message.action === 'disconnect') { disconnect(); return 'Disconnected.'; }
    if (message.action === 'allow' && connection?.readyState === WebSocket.OPEN && Number.isInteger(message.tabId)) {
      const [execution] = await chrome.scripting.executeScript({target:{tabId:message.tabId},func:() => location.href});
      if (!/^https?:\/\//.test(execution?.result || '')) throw Error('Only HTTP and HTTPS pages can be allowed.');
      granted = {tabId:message.tabId,documentId:execution.documentId,url:execution.result};
      return 'This document is allowed until it navigates or you disconnect.';
    }
    throw Error('Connect to ELISSION first.');
  }
  run().then(message => reply({message}),error => reply({error:error.message}));
  return true;
});
