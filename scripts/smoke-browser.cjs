const {chromium} = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {browserBridge} = require('../src/browser.cjs');

(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(),'elission-browser-'));
  const extension = path.join(temporary,'extension');
  await fs.cp(path.join(__dirname,'..','browser'),extension,{recursive:true});
  // The fixture gets a temporary host grant so the test can exercise the popup protocol
  // through Playwright, which cannot press Chrome's toolbar action.
  const manifestPath = path.join(extension,'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath,'utf8'));
  manifest.host_permissions = ['http://127.0.0.1/*','https://www.google.com/*','https://leetcode.com/*'];
  await fs.writeFile(manifestPath,JSON.stringify(manifest));
  const fixture = http.createServer((_request,response) => response.end(
    '<!doctype html><title>Fixture page</title><table><tr><th>Animal</th><td>Capybara</td></tr></table><label>Comments<textarea maxlength="50"></textarea></label>'
  ));
  const bridge = browserBridge();
  let context;
  try {
    await bridge.start();
    await new Promise(resolve => fixture.listen(0,'127.0.0.1',resolve));
    context = await chromium.launchPersistentContext(path.join(temporary,'profile'),{
      executablePath:process.env.ELISSION_CHROMIUM,
      channel:'chromium',headless:true,ignoreHTTPSErrors:true,ignoreDefaultArgs:['--disable-extensions'],
      args:['--disable-extensions-except='+extension,'--load-extension='+extension,'--no-sandbox']
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker',{timeout:15000});
    const base = new URL(worker.url()).origin.replace(/^null$/,'chrome-extension://' + new URL(worker.url()).hostname);
    const controls = context.pages()[0];
    await controls.goto(base + '/popup.html');
    await controls.locator('#token').fill(bridge.pair());
    await controls.locator('#pair').click();
    await controls.getByText('Connected. Allow an individual tab when needed.').waitFor({timeout:8000});
    const target = await context.newPage();
    const fixtureUrl = 'http://127.0.0.1:' + fixture.address().port;
    await target.goto(fixtureUrl);
    await target.bringToFront();
    await assert.rejects(bridge.request('observe',{}),/Allow this tab/);
    const approved = await controls.evaluate(async fixtureUrl => {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      if (!tab.url?.startsWith(fixtureUrl)) throw Error('Fixture tab is not active.');
      return chrome.runtime.sendMessage({action:'allow',tabId:tab.id});
    },fixtureUrl);
    assert.match(approved.message,/This document is allowed/);
    const snapshot = await bridge.request('observe',{});
    assert.equal(snapshot.title,'Fixture page');
    assert.deepEqual(snapshot.tables,[[['Animal','Capybara']]]);
    assert.deepEqual(await bridge.request('draft',{label:'Comments',text:'Test draft'}),{filled:true});
    assert.equal(await target.locator('textarea').inputValue(),'Test draft');
    await assert.rejects(bridge.request('draft',{label:'Comments',text:'Replacement'}),/empty textarea/);
    await target.reload();
    await assert.rejects(bridge.request('observe',{}),/Allow this tab/);
    await context.route('https://www.google.com/search?*',route => route.fulfill({body:'<!doctype html><title>Search fixture</title>'}));
    const navigation = await bridge.request('search',{query:'LELOUCH Vi Britannia'});
    assert.equal(new URL(navigation.url).searchParams.get('q'),'LELOUCH Vi Britannia');
    await context.route('https://leetcode.com/**',route => route.fulfill({contentType:'text/html',body:
      '<!doctype html><div data-track-load="description_content">Return the longest interval.</div>'
      + '<div id="editor">Editor</div><button data-e2e-locator="console-submit-button">Submit</button>'
      + '<a href="/problems/interval/submissions/111/">Previous</a><div data-e2e-locator="submission-result">Accepted</div>'
      + '<script>window.value="starter"; window.monaco={editor:{getEditors:()=>[{getDomNode:()=>document.querySelector("#editor"),getModel:()=>({getLanguageId:()=>"python",getFullModelRange:()=>({}),getValue:()=>window.value}),pushUndoStop:()=>{},executeEdits:(_,edits)=>{window.value=edits[0].text;return true;}}]}};'
      + 'document.querySelector("button").onclick=()=>{window.submissions=(window.submissions||0)+1; const link=document.createElement("a");link.href="/problems/interval/submissions/"+(111+window.submissions)+"/";link.textContent="New submission";document.body.appendChild(link);};</script>'}));
    const editor = await context.newPage();
    await editor.goto('https://leetcode.com/problems/interval/');
    await editor.bringToFront();
    const lc = await bridge.request('leetcode_open',{slug:'interval',chrome:true,describe:true});
    assert.match(lc.description,/longest interval/);
    const solution = 'class Solution:\n    pass';
    assert.deepEqual(await bridge.request('leetcode_editor',{target:lc,code:solution}),{filled:true});
    assert.equal(await editor.evaluate(() => window.value),solution);
    assert.equal(await editor.evaluate(() => window.submissions || 0),0);
    const receipt = await bridge.request('leetcode_submit',{target:lc});
    assert.equal(receipt.verified,true);
    assert.equal(receipt.id,'112');
    assert.equal(receipt.status,null);
    assert.equal(await editor.evaluate(() => window.submissions),1);
    const second = await bridge.request('leetcode_submit',{target:lc});
    assert.equal(second.id,'113');
    assert.equal(await editor.evaluate(() => window.submissions),2);
    console.log('PASS Chromium fixture workflow opens a problem, inserts code, and observes separate new receipts');
    console.log('PASS Chromium fixture navigation verified the exact encoded Google query');
    console.log('PASS Chromium extension pairing, per-document approval, table extraction, verified textarea fill, and navigation revocation');
  } finally {
    await context?.close();
    await bridge.close();
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
    await fs.rm(temporary,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
