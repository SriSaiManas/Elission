'use strict';
const token = document.querySelector('#token');
const status = document.querySelector('#status');
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (response.error) throw Error(response.error);
  status.textContent = response.message;
}
function bind(id, action) {
  document.getElementById(id).addEventListener('click',async () => {
    try { await action(); } catch (error) { status.textContent = error.message; }
  });
}
bind('pair',async () => {
  const code = token.value.trim();
  token.value = '';
  await request({action:'pair',code});
});
bind('allow',async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  await request({action:'allow',tabId:tab?.id});
});
bind('google',async () => {
  const granted = await chrome.permissions.request({origins:['https://www.google.com/*']});
  status.textContent = granted ? 'Verified search enabled.' : 'Search permission was declined.';
});
bind('leetcode',async () => {
  const granted = await chrome.permissions.request({origins:['https://leetcode.com/*']});
  status.textContent = granted ? 'LeetCode workflows enabled.' : 'LeetCode permission was declined.';
});
bind('disconnect',() => request({action:'disconnect'}));
request({action:'status'}).catch(() => { status.textContent = 'Desktop connection unavailable.'; });
