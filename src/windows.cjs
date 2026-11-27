const {spawn} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const {existsSync} = require('node:fs');
const scripts = path.join(__dirname,'..','windows');
const workers = new Set();
function worker(mode, args = [], signal) {
  if (process.platform !== 'win32') throw Error('This operation requires Windows.');
  const packaged = path.join(scripts,'Elission.Windows.exe');
  const executable = existsSync(packaged) ? packaged : path.join(scripts,'bin','Release','net48','Elission.Windows.exe');
  const child = spawn(executable, [mode,...args], {
    cwd:scripts, windowsHide:true, signal, stdio:['pipe','pipe','pipe']
  });
  workers.add(child);
  child.once('close',() => workers.delete(child));
  return child;
}
async function shutdown(graceful) {
  await Promise.all([...workers].map(child => new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    },1200);
    child.once('close',() => { clearTimeout(timeout); resolve(); });
    if (graceful.includes(child)) child.stdin.end();
    else child.kill();
  })));
}
function run(script, args, request, signal, timeout = 25000, onAudio) {
  return new Promise((resolve,reject) => {
    const deadline = AbortSignal.timeout(timeout);
    const child = worker(script,args,signal ? AbortSignal.any([signal,deadline]) : deadline);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', data => { stdout += data; });
    let partial = '';
    child.stderr.setEncoding('utf8').on('data', chunk => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop();
      for (const raw of lines) {
        const line = raw.trim();
        if (line === 'ready') onAudio?.({ready:true});
        else if (line.startsWith('partial:')) {
          try { onAudio?.({partial:JSON.parse(line.slice(8))}); } catch { /* Ignore invalid partial telemetry. */ }
        }
        else if (/^level:\d+$/.test(line)) onAudio?.({level:Number(line.slice(6)) / 100});
        else stderr += line + '\n';
      }
    });
    child.stdin.on('error', () => {});
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(Error(stderr.replace(/\r/g,'').split('\n').find(line => line.trim()) || 'Windows operation did not complete.'));
    });
    child.stdin.end(request === undefined ? undefined : JSON.stringify(request),'utf8');
  });
}
async function shortcuts() {
  const roots = [process.env.APPDATA,process.env.ProgramData].filter(Boolean).map(root => path.join(root,'Microsoft','Windows','Start Menu','Programs'));
  const entries = new Map();
  for (const root of roots) {
    const files = await fs.readdir(root,{recursive:true,withFileTypes:true}).catch(() => []);
    for (const entry of files) {
      if (!entry.isFile() || !/\.lnk$/i.test(entry.name)) continue;
      const name = entry.name.slice(0,-4);
      if (!entries.has(name.toLowerCase())) entries.set(name.toLowerCase(), {name,path:path.join(entry.parentPath, entry.name)});
    }
  }
  return [...entries.values()].sort((a,b) => a.name.localeCompare(b.name));
}
module.exports = {worker,run,shortcuts,shutdown};
