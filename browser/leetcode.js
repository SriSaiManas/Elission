'use strict';
(() => {
  const origin = 'https://leetcode.com';
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  const codeSlug = /^[a-z0-9-]{1,180}$/;
  function target(url) {
    try {
      const actual = new URL(url);
      return actual.origin === origin ? actual.pathname.match(/^\/problems\/([a-z0-9-]+)(?:\/|$)/)?.[1] || null : null;
    } catch { return null; }
  }
  function inspect(slug, click) {
    if (location.origin !== 'https://leetcode.com' || !location.pathname.startsWith('/problems/' + slug + '/')) return null;
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
    const description = [...document.querySelectorAll('[data-track-load="description_content"]')].find(visible)?.innerText?.slice(0,9500) || '';
    const routeId = location.pathname.match(/\/submissions\/(\d+)(?:\/|$)/)?.[1];
    const ids = [...new Set([
      routeId,
      ...[...document.querySelectorAll('a[href*="/submissions/"]')].filter(visible)
        .map(link => link.getAttribute('href').match(/\/submissions\/(\d+)(?:\/|$)/)?.[1])
    ].filter(Boolean))].slice(0,100);
    const statusNode = [...document.querySelectorAll('[data-e2e-locator="submission-result"],[data-e2e-locator="submission-result-status"]')].find(visible);
    const status = (statusNode?.innerText || '').trim().slice(0,100);
    if (click) {
      const buttons = [...document.querySelectorAll('button[data-e2e-locator="console-submit-button"]')].filter(button =>
        visible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.innerText.trim() === 'Submit');
      if (buttons.length !== 1) return {clicked:false};
      buttons[0].click();
    }
    return {description,ids,routeId,status,clicked:click};
  }
  function fill(slug,code) {
    if (location.origin !== 'https://leetcode.com' || !location.pathname.startsWith('/problems/' + slug + '/')) return false;
    const editors = (window.monaco?.editor?.getEditors?.() || []).filter(editor =>
      editor.getDomNode()?.getClientRects().length && !editor.getRawOptions?.()?.readOnly);
    if (editors.length !== 1) return false;
    const editor = editors[0], model = editor.getModel();
    if (!model || model.getLanguageId() !== 'python') return false;
    editor.pushUndoStop();
    const applied = editor.executeEdits('elission',[{range:model.getFullModelRange(),text:code,forceMoveMarkers:true}]);
    editor.pushUndoStop();
    return applied && model.getValue().trim() === code.trim();
  }
  async function execute(tabId,func,args,documentId,world = 'ISOLATED') {
    const [out] = await chrome.scripting.executeScript({
      target:documentId ? {tabId,documentIds:[documentId]} : {tabId},world,func,args
    });
    return out;
  }
  async function current() {
    const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
    return tab;
  }
  self.leetcodeAction = async (action,args,signal) => {
    if (!await chrome.permissions.contains({origins:[origin+'/*']})) throw Error('Choose Allow LeetCode workflows in the ELISSION browser extension.');
    if (args.chrome && /Edg\//.test(navigator.userAgent)) throw Error('ELISSION is paired with Edge. Pair the Chrome extension and try again.');
    signal.throwIfAborted();
    if (action === 'leetcode_open') {
      let tab = await current();
      if (!args.slug && !args.current) {
        tab = await chrome.tabs.create({url:origin+'/',active:true});
        for (let tick = 0; tick < 50; tick++) {
          signal.throwIfAborted();
          const ready = await chrome.tabs.get(tab.id);
          if (ready.status === 'complete' && new URL(ready.url).origin === origin) return {homepage:true};
          await sleep(250);
        }
        throw Error('LeetCode did not finish opening.');
      }
      if (args.slug && (typeof args.slug !== 'string' || !codeSlug.test(args.slug))) throw Error('Invalid LeetCode problem.');
      if (args.slug && target(tab?.url) !== args.slug) tab = await chrome.tabs.create({url:origin+'/problems/'+args.slug+'/',active:true});
      const slug = args.slug || target(tab?.url);
      if (!slug) throw Error('Open the LeetCode problem with your solution in the paired browser first.');
      for (let tick = 0; tick < 56; tick++) {
        signal.throwIfAborted();
        const ready = await chrome.tabs.get(tab.id);
        if (ready.status === 'complete' && target(ready.url) === slug) {
          const result = await execute(tab.id,inspect,[slug,false]);
          if (result?.result && (!args.describe || result.result.description)) {
            return {slug,tabId:tab.id,documentId:result.documentId,description:result.result.description};
          }
        }
        await sleep(250);
      }
      throw Error('LeetCode did not load the problem description. Check the browser for a sign-in or access prompt.');
    }
    const {tabId,documentId,slug} = args.target || {};
    if (!Number.isInteger(tabId) || typeof documentId !== 'string' || typeof slug !== 'string' || !codeSlug.test(slug)) throw Error('Invalid prepared LeetCode problem.');
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active || target(tab.url) !== slug) throw Error('The selected LeetCode problem changed.');
    signal.throwIfAborted();
    if (action === 'leetcode_editor') {
      if (typeof args.code !== 'string' || !args.code.trim() || args.code.length > 12000) throw Error('Invalid solution draft.');
      const result = await execute(tabId,fill,[slug,args.code],documentId,'MAIN');
      if (result?.result !== true) throw Error('Could not verify an editable Python3 editor. Select Python3 and paste the draft manually.');
      return {filled:true};
    }
    const before = await execute(tabId,inspect,[slug,false],documentId);
    if (!before?.result) throw Error('Could not recheck the selected problem.');
    signal.throwIfAborted();
    const clicked = await execute(tabId,inspect,[slug,true],documentId);
    if (!clicked?.result?.clicked) throw Error('Could not locate a unique enabled LeetCode Submit button.');
    const ids = new Set([...before.result.ids,...clicked.result.ids]);
    for (let tick = 0; tick < 110; tick++) {
      signal.throwIfAborted();
      const live = await chrome.tabs.get(tabId);
      if (target(live.url) !== slug) return {clicked:true,verified:false};
      if (live.status === 'complete') {
        const after = await execute(tabId,inspect,[slug,false]).catch(() => null);
        const witness = after?.result?.ids.find(id => !ids.has(id));
        if (witness) return {clicked:true,verified:true,id:witness,status:after.result.routeId === witness ? after.result.status || null : null};
      }
      await sleep(300);
    }
    return {clicked:true,verified:false};
  };
})();
