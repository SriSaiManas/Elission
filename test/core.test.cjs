const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {parse,calculate,isWake,stripWake,streamChat} = require('../src/core.cjs');

test('wake requires a discrete phrase and preserves text without a prefix', () => {
  assert.ok(isWake(' Eli! '));
  assert.ok(isWake('Ellie.'));
  assert.equal(isWake('Eli open Chrome'),false);
  assert.equal(isWake('I met Eli'),false);
  assert.equal(stripWake('Eli, stop'),'stop');
  assert.equal(stripWake('Eli'), 'Eli');
});

test('allowlisted commands preserve structured parameters', () => {
  const commands = [
    ['open Chrome','open','Chrome'],['open a folder','pick','folder'],['close Notepad','close','Notepad'],
    ['switch to Calculator','switch','Calculator'],['search installed apps for chrome','apps','chrome'],
    ['volume 35%','volume','35'],['brightness 60','brightness','60'],['mute audio','mute','mute'],
    ['next track','media','next track'],['screenshot','screenshot','screenshot'],
    ["what's my CPU usage?",'status','CPU'],['check battery','status','battery'],['current time','date','time'],
    ['search the web for eclipses','web','eclipses'],['summarize this document','summarize','summarize'],
    ['remember I prefer metric units','remember','I prefer metric units'],['note buy a cable','note','buy a cable'],
    ['remind me in 2 minutes to check the oven','reminder','2 minutes to check the oven'],
    ['move this file','move','move']
  ];
  for (const [text,action,value] of commands) assert.deepEqual(parse(text),{action,value},text);
  for (const text of ['Explain battery chemistry', 'Run a terminal command', 'delete C:\\Users', 'install Chrome'])
    assert.equal(parse(text),undefined,text);
});

test('arithmetic honors precedence and refuses arbitrary syntax', () => {
  assert.equal(calculate('(12 + 4) * 3'),48);
  assert.equal(calculate('2 * -3 + 15 % 2'),-5);
  assert.throws(() => calculate('2 / 0'));
  assert.throws(() => calculate('5 ** 4'));
  assert.throws(() => calculate('JSON.stringify(2)'));
  assert.throws(() => calculate('(4 + 2'));
});

async function server(t, handler) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0,'127.0.0.1',resolve));
  t.after(() => { instance.closeAllConnections(); instance.close(); });
  return 'http://127.0.0.1:' + instance.address().port;
}
const request = {model:'test-model',messages:[{role:'user',content:'hello'}],signal:AbortSignal.timeout(3000)};

test('streaming parses split SSE, keeps text as data, and authenticates', async t => {
  const endpoint = await server(t,async (req,res) => {
    assert.equal(req.headers.authorization,'Bearer test-key');
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.deepEqual(JSON.parse(body),{model:request.model,messages:request.messages,stream:true});
    res.writeHead(200,{'Content-Type':'text/event-stream'});
    res.write('data: {"choices":[{"delta":{"content":"Part');
    setImmediate(() => res.end(' one"}}]}\r\ndata: {"choices":[{"delta":{"content":" and two"}}]}\n\ndata: [DONE]\n'));
  });
  const parts = [];
  assert.equal(await streamChat({...request,endpoint,key:'test-key',onPart:value => parts.push(value)}),'Part one and two');
  assert.deepEqual(parts,['Part one','Part one and two']);
});

test('nonstreaming server fallback and cancellation work', async t => {
  const endpoint = await server(t,(req,res) => {
    if (req.url === '/pending') return;
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({choices:[{message:{content:'result'}}]}));
  });
  const parts = [];
  assert.equal(await streamChat({...request,endpoint,onPart:value => parts.push(value)}),'result');
  assert.deepEqual(parts,['result']);
  await assert.rejects(streamChat({...request,endpoint:endpoint + '/pending',signal:AbortSignal.timeout(35),onPart:() => {}}),{name:'TimeoutError'});
});

test('transport rejects unsafe endpoints, redirects, and provider errors', async t => {
  const endpoint = await server(t,(req,res) => {
    if (req.url === '/redirect') {
      res.writeHead(302,{Location:'/unexpected'});
      res.end();
    } else {
      res.writeHead(403);
      res.end();
    }
  });
  const options = {...request,onPart:() => {}};
  await assert.rejects(streamChat({...options,endpoint:'http://example.com'}),/HTTPS/);
  await assert.rejects(streamChat({...options,endpoint:'https://abc:xyz@example.com'}),/embedded credentials/);
  await assert.rejects(streamChat({...options,endpoint:endpoint + '/redirect'}));
  await assert.rejects(streamChat({...options,endpoint}),/403/);
});
