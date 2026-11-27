const test = require('node:test');
const assert = require('node:assert/strict');
const {once} = require('node:events');
const {WebSocket} = require('ws');
const {browserBridge,googleSearch,verifySearch} = require('../src/browser.cjs');
const {parsePlan,runPlan} = require('../src/tasks.cjs');
const {parse} = require('../src/core.cjs');

test('Google intent encodes the complete query and validates the destination and query',() => {
  assert.deepEqual(parse('Search Google for LELOUCH Vi Britannia'),{action:'web_google',value:'LELOUCH Vi Britannia'});
  const url = googleSearch('a & b + c');
  assert.equal(new URL(url).searchParams.get('q'),'a & b + c');
  assert.ok(verifySearch(url,'a & b + c'));
  assert.equal(verifySearch(url,'a & b'),false);
  assert.equal(verifySearch('https://example.test/search?q=a','a'),false);
});
test('the planner rejects unrecognized capabilities and stops at a failed checkpoint',async () => {
  assert.throws(() => parsePlan('[{"action":"shell","command":"dir"}]'),/unsupported/);
  assert.throws(() => parsePlan('[{"action":"inspect_tab","url":"https://example.test"}]'),/invalid/);
  const plan = parsePlan('[{"action":"inspect_tab"},{"action":"read_table"},{"action":"inspect_project"}]');
  const transitions = [];
  const result = await runPlan(plan,{
    signal:new AbortController().signal,
    onProgress:() => {},
    checkpoint:(_id,step,action,status) => transitions.push([step,action,status]),
    handlers:{inspect_tab:() => 'preview',read_table:() => { throw Error('No table'); },inspect_project:() => assert.fail()}
  });
  assert.deepEqual(result,{results:[{action:'inspect_tab',output:'preview'}],blocker:'No table'});
  assert.deepEqual(transitions.map(step => step[2]),['running','completed','running','blocked']);
});
test('browser bridge only accepts paired extensions and cancels in-flight work',async t => {
  const bridge = browserBridge(0);
  const port = await bridge.start();
  t.after(() => bridge.close());
  const token = bridge.pair();
  const address = 'ws://127.0.0.1:' + port + '/elission';
  const denied = new WebSocket(address,{origin:'https://example.test'});
  denied.on('error',() => {});
  await once(denied,'close').catch(() => {});
  assert.throws(() => bridge.request('observe',{}),/Connect/);
  const peer = new WebSocket(address,{origin:'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'});
  await once(peer,'open');
  peer.send(JSON.stringify({token}));
  const [ack] = await once(peer,'message');
  assert.equal(JSON.parse(ack).type,'ready');
  const message = once(peer,'message');
  const result = bridge.request('observe',{});
  const [raw] = await message;
  const job = JSON.parse(raw);
  assert.equal(job.action,'observe');
  peer.send(JSON.stringify({id:job.id,result:{title:'Test site'}}));
  assert.deepEqual(await result,{title:'Test site'});
  const control = new AbortController();
  const request = bridge.request('search',{query:'test'},control.signal);
  const rejected = assert.rejects(request,{name:'AbortError'});
  control.abort();
  await rejected;
  bridge.disconnect();
  assert.throws(() => bridge.request('observe',{}),/Connect/);
});

test('Java drafts create a new file and preserve an existing source file',async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const {createJavaFile} = require('../src/project.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'eli-java-'));
  t.after(() => fs.rm(directory,{recursive:true,force:true}));
  const filename = path.join(directory,'Example.java');
  await createJavaFile(filename,'Example','public class Example {}');
  await assert.rejects(createJavaFile(filename,'Example','class Example { int changed; }'),/already exists/);
  assert.equal(await fs.readFile(filename,'utf8'),'public class Example {}\n');
});

test('LeetCode understands the natural compound workflow and spoken problem numbers',() => {
  const {intent,findProblem} = require('../src/workflow.cjs');
  assert.deepEqual(intent('Open chrome, go to leetcode and solve problem 1124, submit it'),
    {query:'1124',chrome:true,solve:true,submit:true,count:1});
  assert.equal(intent('Solve lead code problem eleven twenty four, submit twice').query,'1124');
  assert.equal(intent('Solve LeetCode problem one one two four').query,'1124');
  assert.equal(intent('Solve LeetCode problem one thousand one hundred twenty four').query,'1124');
  assert.equal(intent('Solve LeetCode problem 1124 but do not submit').submit,false);
  assert.equal(intent('Submit the current LeetCode solution three times').count,3);
  const entries = [{stat:{frontend_question_id:1124,question__title:'Longest Well-Performing Interval',question__title_slug:'longest-well-performing-interval'}}];
  assert.equal(findProblem(entries,'1124').url,'https://leetcode.com/problems/longest-well-performing-interval/');
  assert.equal(findProblem(entries,'Longest Well Performing Interval').slug,'longest-well-performing-interval');
});
