const http = require('node:http');
const {randomBytes, randomUUID, timingSafeEqual} = require('node:crypto');
const {WebSocketServer} = require('ws');

function googleSearch(query) {
  const normalized = query.trim();
  if (!normalized || normalized.length > 500) throw Error('Enter a search query between 1 and 500 characters.');
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q',normalized);
  return url.href;
}
function verifySearch(url, query) {
  try {
    const requested = new URL(url);
    return requested.origin === 'https://www.google.com' && requested.pathname === '/search'
      && requested.searchParams.get('q') === query.trim();
  } catch { return false; }
}

function browserBridge(port = 18461) {
  let token, expiresAt, connection;
  const pending = new Map();
  const server = http.createServer((_request,response) => response.writeHead(404).end());
  const sockets = new WebSocketServer({noServer:true,maxPayload:96 * 1024,perMessageDeflate:false});

  server.on('upgrade',(request,socket,head) => {
    const origin = request.headers.origin || '';
    if (!token || Date.now() >= expiresAt || request.url !== '/elission' || !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)
) return socket.destroy();
    sockets.handleUpgrade(request,socket,head,peer => {
      const timer = setTimeout(() => peer.close(1008),3000);
      peer.on('error',() => {});
      peer.on('close',() => {
        clearTimeout(timer);
        if (connection !== peer) return;
        connection = undefined;
        for (const job of pending.values()) job.reject(Error('Browser extension disconnected.'));
      });
      peer.on('message',raw => {
        let message;
        try { message = JSON.parse(raw); } catch { return peer.close(1007); }
        if (!message || typeof message !== 'object') return peer.close(1007);
        if (connection !== peer) {
          const supplied = typeof message.token === 'string' ? Buffer.from(message.token) : Buffer.alloc(0);
          if (!token || Date.now() >= expiresAt || supplied.length !== token.length || !timingSafeEqual(supplied,token) || (connection && connection !== peer)) return peer.close(1008);
          clearTimeout(timer);
          token = undefined;
          connection = peer;
          peer.send(JSON.stringify({type:'ready'}));
          return;
        }
        if (message.type === 'ping') return peer.send(JSON.stringify({type:'pong'}));
        const job = pending.get(message.id);
        if (!job) return;
        if (message.error) job.reject(Error(typeof message.error === 'string' ? message.error.slice(0,300) : 'Browser action failed.'));
        else job.resolve(message.result);
      });
    });
  });

  function disconnect() {
    token = undefined;
    for (const job of pending.values()) job.reject(Error('Browser access was disconnected.'));
    for (const socket of sockets.clients) socket.terminate();
    connection = undefined;
  }

  return {
    start: () => new Promise((resolve,reject) => {
      server.once('error',reject);
      server.listen(port,'127.0.0.1',() => {
        server.removeListener('error',reject);
        resolve(server.address().port);
      });
    }),
    pair:() => {
      if (!server.listening) throw Error('The browser bridge is unavailable.');
      disconnect();
      expiresAt = Date.now() + 120000;
      token = Buffer.from(randomBytes(24).toString('base64url'));
      return token.toString();
    },
    connected: () => connection?.readyState === 1,
    disconnect,
    close:() => {
      disconnect();
      sockets.close();
      return new Promise(resolve => server.close(() => resolve()));
    },
    request(action, args, signal) {
      signal?.throwIfAborted();
      if (connection?.readyState !== 1) throw Error('Connect the ELISSION browser extension in Settings.');
      if (!['search','observe','draft'].includes(action) || pending.size >= 4) throw Error('Browser action unavailable.');
      const id = randomUUID();
      const peer = connection;
      return new Promise((resolve,reject) => {
        function finish(callback,value) {
          clearTimeout(timer);
          signal?.removeEventListener('abort',abort);
          pending.delete(id);
          callback(value);
        }
        function abort() {
          if (peer.readyState === 1) peer.send(JSON.stringify({type:'cancel',id}),() => {});
          finish(reject,signal.reason);
        }
        const timer = setTimeout(() => {
          if (peer.readyState === 1) peer.send(JSON.stringify({type:'cancel',id}),() => {});
          finish(reject,Error('The browser did not verify this action before the timeout.'));
        },18000);
        pending.set(id,{resolve:value => finish(resolve,value), reject:error => finish(reject,error)});
        signal?.addEventListener('abort',abort,{once:true});
        peer.send(JSON.stringify({type:'job',id,action,args}),error => {
          if (error) finish(reject,Error('Could not send the browser action.'));
        });
      });
    }
  };
}
module.exports = {browserBridge, googleSearch, verifySearch};
