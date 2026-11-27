const {contextBridge,ipcRenderer} = require('electron');
const methods = ['initial','submit','listen','stop','hide','minimize','fullscreen','compact','audio-ended','voices','settings','records','memory','remove'];
const api = Object.fromEntries(methods.map(name => [name,(...args) => ipcRenderer.invoke(name,...args)]));
for (const channel of ['state','play','mic-level','reminder','open-settings','activation-status']) {
  api['on-' + channel] = callback => ipcRenderer.on(channel,(_event,payload) => callback(payload));
}
contextBridge.exposeInMainWorld('eli',api);
