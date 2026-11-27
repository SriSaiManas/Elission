const {DatabaseSync} = require('node:sqlite');
const {safeStorage} = require('electron');
const path = require('node:path');
const defaults = {provider:'off',modelVerified:false,endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4.1-mini',key:'I',wakeEnabled:true,hotkey:'Control+Space',voice:'',rate:-10,pitch:-12,style:'low',verbosity:'concise',speak:true,continuous:true,spokenInterrupt:false,sharePreferences:false,history:true,top:true,position:'center'};
function store(directory) {
  const db = new DatabaseSync(path.join(directory,'elission.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS turns (id INTEGER PRIMARY KEY, user TEXT NOT NULL, assistant TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY, type TEXT NOT NULL, text TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY, action TEXT NOT NULL, status TEXT NOT NULL, time TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY, text TEXT NOT NULL, due INTEGER NOT NULL);
  `);
  function protect(text) {
    if (process.platform !== 'win32') return text;
    if (!safeStorage.isEncryptionAvailable()) throw Error('Windows data protection is unavailable.');
    return 'dpapi:' + safeStorage.encryptString(text).toString('base64');
  }
  function reveal(text) {
    return process.platform === 'win32' && text.startsWith('dpapi:')
      ? safeStorage.decryptString(Buffer.from(text.slice(6),'base64')) : text;
  }
  const readText = row => ({...row,text:reveal(row.text)});
  const put = db.prepare('INSERT INTO config VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  const read = key => db.prepare('SELECT value FROM config WHERE key=?').get(key)?.value;
  return {
    db,
    settings:() => ({...defaults,...JSON.parse(read('settings') || '{}')}),
    saveConfiguration(settings, credential) {
      let encrypted;
      if (credential) {
        if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) {
          throw Error('OS-backed credential storage is unavailable.');
        }
        encrypted = safeStorage.encryptString(credential).toString('base64');
      }
      db.exec('BEGIN');
      try {
        put.run('settings',JSON.stringify(settings));
        if (encrypted) put.run('credential',encrypted);
        else if (credential === '') db.prepare("DELETE FROM config WHERE key='credential'").run();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    hasCredential:() => !!read('credential'),
    credential:() => {
      const encrypted = read('credential');
      return encrypted ? safeStorage.decryptString(Buffer.from(encrypted,'base64')) : '';
    },
    turns:() => db.prepare('SELECT user,assistant FROM turns ORDER BY id DESC LIMIT 16').all().reverse().map(row => ({user:reveal(row.user),assistant:reveal(row.assistant)})),
    addTurn:(user, reply) => db.prepare('INSERT INTO turns(user,assistant) VALUES (?,?)').run(protect(user),protect(reply)),
    memories:() => db.prepare('SELECT * FROM memory ORDER BY id DESC LIMIT 100').all().map(readText),
    addMemory:(type,text) => db.prepare('INSERT INTO memory(type,text) VALUES (?,?)').run(type,protect(text)),
    rankApp:text => {
      const existing = db.prepare("SELECT id,text FROM memory WHERE type='app'").all().find(row => reveal(row.text) === text);
      db.exec('BEGIN');
      try {
        db.prepare("INSERT INTO memory(type,text) VALUES ('app',?)").run(protect(text));
        if (existing) db.prepare('DELETE FROM memory WHERE id=?').run(existing.id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    updateMemory:(id,type,text) => db.prepare('UPDATE memory SET type=?,text=? WHERE id=?').run(type,protect(text),id),
    addReminder:(text,due) => db.prepare('INSERT INTO reminders(text,due) VALUES (?,?)').run(protect(text),due),
    reminders:() => db.prepare('SELECT * FROM reminders ORDER BY due').all().map(readText),
    dueReminders:() => db.prepare('SELECT * FROM reminders WHERE due<=? ORDER BY due LIMIT 10').all(Date.now()).map(readText),
    log:(action,status) => db.prepare('INSERT INTO log(action,status,time) VALUES (?,?,?)').run(action,status,new Date().toISOString())
  };
}
module.exports = {store, defaults};
