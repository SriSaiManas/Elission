const fs = require('node:fs/promises');
const path = require('node:path');

const skipped = new Set(['node_modules','dist','build','target','vendor','coverage','bin','obj']);
async function inspectProject(directory,signal) {
  const root = await fs.realpath(directory);
  const queue = [{directory:root,depth:0}];
  const files = [];
  while (queue.length && files.length < 250) {
    signal?.throwIfAborted();
    const item = queue.shift();
    const entries = await fs.readdir(item.directory,{withFileTypes:true});
    for (const entry of entries) {
      if (files.length === 250) break;
      if (entry.name.startsWith('.') || skipped.has(entry.name)) continue;
      const location = path.join(item.directory,entry.name);
      if (entry.isDirectory() && item.depth < 3 && queue.length < 250) {
        const canonical = await fs.realpath(location);
        const relative = path.relative(root,canonical);
        if (relative && !/^(\.\.(?:[\\/]|$))/.test(relative) && !path.isAbsolute(relative) && canonical === location) {
          queue.push({directory:canonical,depth:item.depth + 1});
        }
      }
      if (entry.isFile()) files.push(path.relative(root,location));
    }
  }
  return {files,truncated:queue.length > 0 || files.length === 250};
}
async function createJavaFile(filename,className,source) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(className) || path.basename(filename) !== className + '.java') {
    throw Error('Save the generated class as ' + className + '.java.');
  }
  if (typeof source !== 'string' || source.length > 16000 || !new RegExp('\\bclass\\s+' + className + '\\b').test(source)) {
    throw Error('The model did not return a valid class draft. No file was written.');
  }
  const canonical = await fs.realpath(path.dirname(filename));
  const target = path.join(canonical,path.basename(filename));
  try { await fs.writeFile(target,source.trim() + '\n',{flag:'wx',encoding:'utf8'}); }
  catch (error) {
    if (error.code === 'EEXIST') throw Error('That file already exists. Choose a new file to preserve your project.');
    throw error;
  }
  return target;
}
module.exports = {inspectProject, createJavaFile};
