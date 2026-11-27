const test = require('node:test');
const assert = require('node:assert/strict');
const {querySearch,parseSearchResults} = require('../src/search.cjs');
const {parse} = require('../src/core.cjs');

test('spoken requests route to research or existing actions',() => {
  assert.deepEqual(parse('Hey Eli, could you please look up Lelouch?'),{action:'web',value:'Lelouch?'});
  assert.deepEqual(parse('Could you open Chrome'),{action:'open',value:'Chrome'});
});
test('search extracts titles and snippets, deduplicates, and omits ads and unsafe links',async () => {
  const markup = '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2F">A &amp; B</a><a class="result__snippet">Some <b>text</b>.</a></div>'
    + '<div class="result"><a class="result__a" href="https://example.org/">Same result</a></div>'
    + '<div class="result"><a class="result__a" href="javascript:evil()">Invalid</a></div>'
    + '<div class="result result--ad"><a class="result__a" href="https://example.com/">Ad</a></div>';
  const expected = [{title:'A & B',url:'https://example.org/',snippet:'Some text.'}];
  assert.deepEqual(parseSearchResults(markup),expected);
  const response = await querySearch('anime + manga',null,url => {
    assert.equal(url.origin,'https://html.duckduckgo.com');
    assert.equal(url.searchParams.get('q'),'anime + manga');
    return new Response(markup,{headers:{'content-type':'text/html'}});
  });
  assert.deepEqual(response,expected);
  await assert.rejects(querySearch('nothing',null,() => new Response('<html></html>',{headers:{'content-type':'text/html'}})),/did not return readable results/);
});
