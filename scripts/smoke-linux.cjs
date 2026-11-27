const { _electron } = require('playwright-core');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  assert.equal(process.platform,'linux','This smoke suite is configured for a Linux display.');
  const executablePath = process.env.ELISSION_ELECTRON || require('electron');
  const application = path.resolve(process.env.ELISSION_APP_DIR || path.join(__dirname,'..'));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(),'eli-smoke-'));
  const calls = [];
  const provider = http.createServer(async (req,res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({data:[{id:'test-model'}]}));
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push(JSON.parse(body));
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    if (body.includes('cancel prompt')) return res.write(': waiting\n\n');
    res.write('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n');
    setTimeout(() => { res.end('data: {"choices":[{"delta":{"content":" and final answer."}}]}\n\ndata: [DONE]\n\n'); },400);
  });
  await new Promise(resolve => provider.listen(0,'127.0.0.1',resolve));
  let app;
  const errors = [];
  async function launch() {
    app = await _electron.launch({executablePath,args:[
      '--no-sandbox','--user-data-dir='+profile,'--use-angle=swiftshader','--enable-unsafe-swiftshader',application
    ]});
    const page = await app.firstWindow({timeout:10000});
    page.setDefaultTimeout(10000);
    page.on('pageerror',error => errors.push(String(error)));
    page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.waitForLoadState('domcontentloaded');
    assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()),false);
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
    await page.getByText('Standing by',{exact:true}).waitFor();
    return page;
  }
  try {
    let page = await launch();
    await page.locator('#core canvas').waitFor();
    assert.equal(await page.locator('#core canvas').count(),1);
    const enter = async text => {
      await page.getByRole('textbox',{name:'Message or command'}).fill(text);
      await page.getByRole('button',{name:'Send'}).click();
    };
    await enter('calculate (12 + 4) * 3');
    await page.locator('#answer').getByText('48',{exact:true}).waitFor();
    await enter('remember metric units');
    await page.getByText('Preference saved.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Activity',exact:true}).click();
    await page.getByRole('button',{name:'Memory',exact:true}).click();
    await page.getByText('metric units',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Text',{exact:true}).fill('metric preferred');
    await page.getByRole('button',{name:'Save memory',exact:true}).click();
    await page.getByText('metric preferred',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Operations',exact:true}).click();
    await page.getByText('calculate · completed',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Close activity'}).click();
    console.log('PASS renderer launch, WebGL canvas, IPC, command execution, editable memory, execution log');

    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.locator('[name=provider]').selectOption('local');
    await page.getByLabel('Chat completions URL').fill('http://127.0.0.1:' + provider.address().port + '/v1/chat/completions');
    await page.getByLabel('Model',{exact:true}).fill('missing-model');
    await page.getByRole('button',{name:'Save settings'}).click();
    await page.getByText(/Model unavailable on the local server/).waitFor();
    assert.equal(calls.length,0);
    await page.getByLabel('Model',{exact:true}).fill('test-model');
    await page.getByLabel('Speak responses').uncheck();
    await page.getByRole('button',{name:'Save settings'}).click();
    await page.getByText('Local AI',{exact:true}).waitFor();

    await enter('say hello');
    await page.getByText('First chunk',{exact:true}).waitFor();
    await page.getByText('First chunk and final answer.',{exact:true}).waitFor();
    assert.equal(calls[1].model,'test-model');
    assert.ok(calls[1].messages.some(message => message.content === '48'));
    assert.ok(!calls[1].messages.some(message => message.content.includes('metric preferred')));
    await enter('cancel prompt');
    await page.getByRole('button',{name:'Stop',exact:false}).click();
    await page.getByText('Standing by',{exact:true}).waitFor();
    console.log('PASS settings save, incremental chat display, recent turn context, preference opt-in, cancellation');

    await enter('remind me in 1 second to check the oven');
    await page.getByText('check the oven',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Dismiss reminder'}).click();
    await page.getByText('check the oven',{exact:true}).waitFor({state:'hidden'});
    console.log('PASS reminder scheduling and in-app delivery');

    await page.getByRole('button',{name:'Toggle compact mode'}).click();
    await page.waitForFunction(() => innerWidth <= 480 && innerHeight <= 500);
    await page.getByRole('button',{name:'Toggle compact mode'}).click();
    await page.waitForFunction(() => innerWidth > 480);
    await page.getByRole('button',{name:'Toggle full screen'}).click();
    await page.waitForFunction(() => innerWidth === screen.width);
    await page.getByRole('button',{name:'Toggle full screen'}).click();
    await page.waitForFunction(() => innerWidth < screen.width);
    await page.keyboard.press('Escape');
    await page.locator('#phase').getByText('sleep',{exact:true}).waitFor({state:'attached'});
    await new Promise(resolve => setTimeout(resolve,350));
    assert.equal(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].isVisible()),false);
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].show());
    await page.getByRole('button',{name:'Sleep and hide'}).click();
    const visible = await app.evaluate(async ({BrowserWindow}) => {
      await new Promise(resolve => setTimeout(resolve,350));
      return BrowserWindow.getAllWindows()[0].isVisible();
    });
    assert.equal(visible,false);
    await app.close();
    app = undefined;
    page = await launch();
    await page.getByText('Local AI',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Activity',exact:true}).click();
    await page.getByText('First chunk and final answer.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Memory',exact:true}).click();
    await page.getByText('metric preferred',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Close activity'}).click();
    if (process.env.ELISSION_LIVE_MODEL_URL && process.env.ELISSION_LIVE_MODEL) {
      await page.getByRole('button',{name:'Settings',exact:true}).click();
      await page.getByLabel('Chat completions URL').fill(process.env.ELISSION_LIVE_MODEL_URL);
      await page.getByLabel('Model',{exact:true}).fill(process.env.ELISSION_LIVE_MODEL);
      await page.getByLabel('Save conversations locally and include recent turns in AI context').uncheck();
      await page.getByRole('button',{name:'Save settings'}).click();
      await page.locator('#settings-panel').waitFor({state:'hidden',timeout:65000});
      const prompt = 'What is the capital of France? Answer in one word.';
      await enter(prompt);
      await page.locator('#heard').getByText(prompt,{exact:true}).waitFor();
      await page.waitForFunction(() => document.querySelector('#phase').textContent === 'idle'
        && document.querySelector('#answer').textContent.trim().length > 0,null,{timeout:30000});
      console.log('PASS real model connection verification and chat response:', (await page.locator('#answer').innerText()).slice(0,160));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS compact, fullscreen, sleep, persisted settings/history/memory, no renderer errors');
  } finally {
    await app?.close().catch(() => {});
    provider.closeAllConnections();
    await new Promise(resolve => provider.close(resolve));
    await fs.rm(profile,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
