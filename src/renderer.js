import './style.css';
import {hologram} from './hologram.js';

const $ = id => document.getElementById(id);
const api = window.eli;
const visual = hologram($('core'),$('wave'));
const settingsPanel = $('settings-panel');
const recordsPanel = $('records-panel');
const settingsForm = $('settings-form');
const memoryForm = $('memory-form');
let prefs, credential, compact = false, player, playerUrl, tab = 'turns', editId;
let state = {phase:'idle',message:'Standing by',transcript:'',response:''};
let windows = false, settingsVersion = 0, recordVersion = 0;
const reminderQueue = [];

function displayReminder() {
  $('reminder-text').textContent = reminderQueue[0] || '';
  $('reminder-banner').hidden = !reminderQueue.length;
}

function draw() {
  const {phase,message,transcript,response,microphone} = state;
  $('viewport').dataset.phase = phase;
  $('phase').textContent = phase;
  $('message').textContent = message;
  $('heard').textContent = transcript;
  $('answer').textContent = response;
  $('transcript').hidden = !transcript && !response;
  $('stop').hidden = !['activating','listening','thinking','speaking','executing'].includes(phase);
  const live = microphone || (phase === 'listening' && message === 'Microphone active');
  $('privacy-indicator').textContent = live ? 'MIC LIVE' : 'MIC OFF';
  $('privacy-indicator').dataset.live = Boolean(live);
  $('listen').setAttribute('aria-pressed',String(Boolean(live)));
  visual.phase(phase);
}
function showError(error) {
  state = {...state,phase:'error',message:error.message || String(error)};
  draw();
}
function call(method,...args) {
  return api[method](...args).catch(showError);
}
function setPrefs(value,hasKey) {
  prefs = value;
  credential = hasKey;
  $('hint').textContent = windows ? 'HOLD ' + prefs.key + ' + SAY “ELI”' : 'TYPE A COMMAND';
  $('provider').textContent = prefs.provider === 'off' ? 'Local commands' : prefs.provider === 'local' ? 'Local AI' : 'Cloud AI';
}
function cleanAudio() {
  if (!player) return;
  const audio = player;
  player = undefined;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  URL.revokeObjectURL(playerUrl);
  visual.detach();
}
async function play(payload) {
  cleanAudio();
  if (!payload) return;
  const {token,bytes} = payload;
  playerUrl = URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  const audio = player = new Audio(playerUrl);
  const complete = ok => {
    if (audio !== player) return;
    cleanAudio();
    void call('audio-ended',token,ok);
  };
  audio.addEventListener('ended',() => complete(true));
  audio.addEventListener('error',() => complete(false));
  try {
    await visual.attach(audio);
    if (player === audio) await audio.play();
  } catch { complete(false); }
}

for (const button of document.querySelectorAll('[data-close]'))
  button.addEventListener('click',() => $(button.dataset.close).close());

if (api) {
  api['on-state'](next => { state = next; draw(); });
  api['on-mic-level'](level => visual.mic(level));
  api['on-play'](payload => void play(payload));
  api['on-reminder'](text => {
    reminderQueue.push(text);
    displayReminder();
  });
  $('dismiss-reminder').addEventListener('click',() => {
    reminderQueue.shift();
    displayReminder();
  });
  api.initial().then(initial => {
    windows = initial.platform === 'win32';
    setPrefs(initial.settings,initial.credential);
    state = initial.state;
    draw();
  }).catch(showError);

  for (const action of ['minimize','hide','listen','stop','fullscreen'])
    $(action).addEventListener('click',() => void call(action));
  $('compact').addEventListener('click',() => { compact = !compact; void call('compact',compact); });
  $('prompt').addEventListener('submit',event => {
    event.preventDefault();
    const text = $('input').value.trim();
    if (!text) return;
    $('input').value = '';
    void call('submit',text);
  });
  window.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !settingsPanel.open && !recordsPanel.open) void call('stop');
  });

  $('settings').addEventListener('click',async () => {
    if (!prefs) return;
    const generation = ++settingsVersion;
    for (const [key,value] of Object.entries(prefs)) {
      const field = settingsForm.elements.namedItem(key);
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value;
      else if (key !== 'voice') field.value = value;
    }
    const voices = settingsForm.elements.voice;
    voices.replaceChildren(new Option('Automatic', ''),...(prefs.voice ? [new Option(prefs.voice,prefs.voice,true,true)] : []));
    settingsForm.elements.secret.value = '';
    settingsForm.elements.secret.placeholder = credential ? 'Saved in Windows credential storage' : 'Optional for local providers';
    settingsForm.elements.clearSecret.checked = false;
    $('settings-error').textContent = '';
    settingsPanel.showModal();
    try {
      const names = await api.voices();
      if (generation !== settingsVersion || !settingsPanel.open) return;
      for (const name of names) if (name !== prefs.voice) voices.add(new Option(name,name));
    } catch (error) {
      if (generation === settingsVersion && settingsPanel.open) $('settings-error').textContent = error.message;
    }
  });
  settingsForm.addEventListener('submit',async event => {
    event.preventDefault();
    const result = {...prefs};
    for (const key of Object.keys(prefs)) {
      const field = settingsForm.elements.namedItem(key);
      if (!field) continue;
      result[key] = field.type === 'checkbox' ? field.checked : field.type === 'number' ? Number(field.value) : field.value.trim();
    }
    const secret = settingsForm.elements.clearSecret.checked ? '' : settingsForm.elements.secret.value.trim() || undefined;
    try {
      const saved = await api.settings(result,secret);
      setPrefs(saved.settings,saved.credential);
      settingsPanel.close();
    } catch (error) { $('settings-error').textContent = error.message; }
  });

  $('records').addEventListener('click',() => {
    $('records-error').textContent = '';
    recordsPanel.showModal();
    void refresh();
  });
  for (const button of document.querySelectorAll('[data-tab]')) {
    button.addEventListener('click',() => {
      tab = button.dataset.tab;
      editId = undefined;
      memoryForm.reset();
      void refresh();
    });
  }
  memoryForm.addEventListener('submit',async event => {
    event.preventDefault();
    try {
      await api.memory(editId,memoryForm.elements.type.value,memoryForm.elements.text.value);
      editId = undefined;
      memoryForm.reset();
      await refresh();
    } catch (error) { $('records-error').textContent = error.message; }
  });
} else {
  for (const element of document.querySelectorAll('button,input')) element.disabled = true;
  state.message = 'Open ELISSION.exe to use the desktop controls.';
  draw();
}

function element(tag,text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
function action(label,fn) {
  const button = element('button',label);
  button.type = 'button';
  button.addEventListener('click',async () => {
    try { await fn(); }
    catch (error) { $('records-error').textContent = error.message; }
  });
  return button;
}
async function refresh() {
  const generation = ++recordVersion;
  $('records-error').textContent = '';
  const key = tab;
  memoryForm.hidden = key !== 'memory';
  for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed',String(button.dataset.tab === key));
  try {
    const records = await api.records();
    if (generation !== recordVersion) return;
    const target = $('records-content');
    target.replaceChildren();
    if (key === 'turns' && records.turns.length)
      target.append(action('Clear history',async () => { await api.remove('turns'); await refresh(); }));
    if (!records[key].length) target.append(element('p','No entries.'));
    for (const row of records[key]) {
      const card = element('article','');
      card.className = 'record';
      if (key === 'turns') card.append(element('span',row.user),element('p',row.assistant));
      if (key === 'memory') {
        card.append(element('span',row.type),element('p',row.text),action('Edit',() => {
          editId = row.id;
          memoryForm.elements.type.value = row.type;
          memoryForm.elements.text.value = row.text;
          memoryForm.elements.text.focus();
        }));
      }
      if (key === 'log') card.append(element('span',row.action + ' · ' + row.status),element('p',new Date(row.time).toLocaleString()));
      if (key === 'reminders') card.append(element('span',new Date(row.due).toLocaleString()),element('p',row.text));
      if (key === 'memory' || key === 'reminders') {
        card.append(action('Delete',async () => {
          if (await api.remove(key,row.id)) await refresh();
        }));
      }
      target.append(card);
    }
  } catch (error) {
    if (generation === recordVersion) $('records-error').textContent = error.message;
  }
}
