import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const MAX_PLAYERS = 32;
const CHAT_RADIUS = 12;
const SFU_API = 'https://rtc.live.cloudflare.com/v1';
const SFU_APP_ID = process.env.CF_SFU_APP_ID || '';
const SFU_APP_SECRET = process.env.CF_SFU_APP_SECRET || '';
const clients = new Map();
const players = new Map();
const allowedFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/three.min.js', 'three.min.js'],
  ['/THREE-LICENSE.txt', 'THREE-LICENSE.txt'],
  ['/LEIA-ME.md', 'LEIA-ME.md'],
]);

const send = (response, message) => response.write(`data: ${JSON.stringify(message)}\n\n`);
function broadcast(message, exceptId = null) {
  for (const [id, client] of clients) if (id !== exceptId) send(client.response, message);
}
function broadcastWithinChatRadius(message, origin) {
  for (const [id, client] of clients) {
    const recipient = players.get(id);
    if (!recipient) continue;
    const dx = origin.position.x - recipient.position.x;
    const dy = origin.position.y - recipient.position.y;
    const dz = origin.position.z - recipient.position.z;
    if (Math.hypot(dx, dy, dz) <= CHAT_RADIUS) send(client.response, message);
  }
}
function withinVoiceRadius(origin, recipient) {
  return Math.hypot(
    origin.position.x - recipient.position.x,
    origin.position.y - recipient.position.y,
    origin.position.z - recipient.position.z,
  ) <= CHAT_RADIUS;
}
function cleanName(value) {
  return String(value || 'CHAVE').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 16) || 'CHAVE';
}
function cleanColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function readJson(request, limit = 8192) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(Object.assign(new Error('Payload muito grande'), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}
function json(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
function hasSfuConfig() { return Boolean(SFU_APP_ID && SFU_APP_SECRET); }
function allowSfuSession(client) {
  const now = Date.now();
  client.sfuSessionTimes = (client.sfuSessionTimes || []).filter(time => now - time < 60000);
  if (client.sfuSessionTimes.length >= 40) return false;
  client.sfuSessionTimes.push(now);
  return true;
}
async function callSfu(path, method = 'POST', body) {
  if (!hasSfuConfig()) throw Object.assign(new Error('Voz centralizada ainda não configurada.'), { statusCode: 503 });
  let response;
  try {
    response = await fetch(`${SFU_API}/apps/${encodeURIComponent(SFU_APP_ID)}${path}`, {
      method,
      headers: { authorization: `Bearer ${SFU_APP_SECRET}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw Object.assign(new Error('O serviço central de voz está indisponível.'), { statusCode: 502 });
  }
  let result = {};
  try { result = await response.json(); } catch { /* a resposta sem JSON será tratada abaixo */ }
  if (!response.ok || result.errorCode || result.errors?.length) {
    console.warn(`Cloudflare SFU recusou a operação (${response.status}${result.errorCode ? ` · ${result.errorCode}` : ''}).`);
    throw Object.assign(new Error('Não consegui completar a conexão central de voz.'), { statusCode: 502 });
  }
  return result;
}
async function closeSfuTracks(sessionId, mids) {
  if (!sessionId || !mids?.length || !hasSfuConfig()) return;
  try {
    await callSfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/close`, 'PUT', {
      tracks: mids.map(mid => ({ mid })), force: true,
    });
  } catch { /* sessões que expiraram já não têm mídia para encaminhar */ }
}
async function cleanupSfuClient(client) {
  if (!client) return;
  await Promise.all([
    closeSfuTracks(client.voicePublishSessionId, client.voicePublishMid ? [client.voicePublishMid] : []),
    ...[...(client.voiceSubscriptions?.values() || [])].map(subscription => closeSfuTracks(subscription.sessionId, subscription.mids)),
  ]);
  client.voicePublishSessionId = null;
  client.voicePublishMid = null;
  client.voiceReady = false;
  client.voiceSubscriptions?.clear();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/voice/config') {
    const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    const mode = hasSfuConfig() ? 'sfu' : localHost ? 'direct' : 'unconfigured';
    return json(response, 200, { mode, centralized: mode === 'sfu' });
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    if (clients.size >= MAX_PLAYERS) return json(response, 503, { error: 'Sala cheia (limite: 32 jogadores).' });
    const id = randomUUID();
    const existingPlayers = [...players.values()];
    const angle = existingPlayers.length * 2.399;
    const radius = 2.8 + Math.floor(existingPlayers.length / 10) * 0.5;
    const player = {
      id, name: 'CHAVE', appearance: { skin: '#f4c9a0', hair: '#703ac1', shirt: '#712cb5', pants: '#25242b', key: true, hood: false },
      position: { x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }, rotation: 0, walking: false, jumping: true, speed: 0, voiceEnabled: false, voiceSessionId: null,
    };
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    clients.set(id, { response, lastStateAt: 0, lastChatAt: 0, voiceSignalTimes: [], sfuSessionTimes: [], voicePublishSessionId: null, voicePublishMid: null, voiceReady: false, voiceSubscriptions: new Map() });
    players.set(id, player);
    send(response, { type: 'hello', id, spawn: player.position, players: existingPlayers });
    broadcast({ type: 'join', player }, id);
    response.on('close', () => {
      const current = clients.get(id);
      if (!current || current.response !== response) return;
      clients.delete(id);
      void cleanupSfuClient(current);
      players.delete(id);
      broadcast({ type: 'leave', id });
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/state') {
    try {
      const data = await readJson(request);
      const client = clients.get(String(data.id || ''));
      const player = players.get(String(data.id || ''));
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      const now = Date.now();
      if (now - client.lastStateAt < 40) { response.writeHead(204); return response.end(); }
      client.lastStateAt = now;
      const appearance = data.appearance || {};
      const position = data.position || {};
      player.name = cleanName(data.name);
      player.appearance = {
        skin: cleanColor(appearance.skin, '#f4c9a0'), hair: cleanColor(appearance.hair, '#17151d'),
        shirt: cleanColor(appearance.shirt, '#25232e'), pants: cleanColor(appearance.pants, '#25242b'),
        key: Boolean(appearance.key), hood: Boolean(appearance.hood),
      };
      player.position = {
        x: Math.max(-500, Math.min(500, finite(position.x))),
        y: Math.max(-100, Math.min(100, finite(position.y))),
        z: Math.max(-500, Math.min(500, finite(position.z))),
      };
      player.rotation = finite(data.rotation);
      player.speed = Math.max(0, Math.min(9, finite(data.speed)));
      player.walking = Boolean(data.walking) && player.speed > 0.2;
      player.jumping = Boolean(data.jumping) || player.position.y > 0.05;
      player.voiceEnabled = hasSfuConfig() ? Boolean(client.voiceReady && client.voicePublishSessionId) : Boolean(data.voiceEnabled);
      broadcast({ type: 'state', player }, player.id);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      if (!response.headersSent) return json(response, error.statusCode || 400, { error: error.message });
      return response.destroy();
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/publish') {
    try {
      const data = await readJson(request, 32768);
      const id = String(data.id || '');
      const client = clients.get(id);
      const player = players.get(id);
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!hasSfuConfig()) return json(response, 503, { error: 'Voz centralizada ainda não configurada no servidor.' });
      if (!allowSfuSession(client)) return json(response, 429, { error: 'Muitas reconexões de voz. Aguarde um minuto.' });
      if (data.sessionDescription?.type !== 'offer' || typeof data.sessionDescription?.sdp !== 'string' || !data.sessionDescription.sdp || data.sessionDescription.sdp.length > 24000 || typeof data.mid !== 'string' || data.mid.length > 12) {
        return json(response, 400, { error: 'Oferta de voz inválida.' });
      }
      await cleanupSfuClient(client);
      const session = await callSfu('/sessions/new');
      if (typeof session.sessionId !== 'string') throw Object.assign(new Error('Sessão de voz inválida.'), { statusCode: 502 });
      client.voicePublishSessionId = session.sessionId;
      client.voicePublishMid = data.mid;
      let publication;
      try {
        publication = await callSfu(`/sessions/${encodeURIComponent(session.sessionId)}/tracks/new`, 'POST', {
          sessionDescription: data.sessionDescription,
          tracks: [{ location: 'local', mid: data.mid, trackName: 'lowkey-mic' }],
        });
      } catch (error) {
        await closeSfuTracks(session.sessionId, [data.mid]);
        client.voicePublishSessionId = null;
        client.voicePublishMid = null;
        throw error;
      }
      if (publication.tracks?.some(track => track.errorCode) || publication.sessionDescription?.type !== 'answer' || typeof publication.sessionDescription?.sdp !== 'string') {
        await closeSfuTracks(session.sessionId, (publication.tracks || []).map(track => track.mid).filter(mid => typeof mid === 'string'));
        client.voicePublishSessionId = null;
        client.voicePublishMid = null;
        throw Object.assign(new Error('O SFU não aceitou o microfone.'), { statusCode: 502 });
      }
      if (clients.get(id) !== client || players.get(id) !== player) {
        await closeSfuTracks(session.sessionId, [data.mid]);
        return json(response, 401, { error: 'Jogador saiu da sala.' });
      }
      player.voiceSessionId = session.sessionId;
      player.voiceEnabled = false;
      broadcast({ type: 'state', player }, player.id);
      return json(response, 200, { sessionId: session.sessionId, sessionDescription: publication.sessionDescription });
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao publicar o microfone.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/ready') {
    try {
      const data = await readJson(request, 2048);
      const id = String(data.id || '');
      const client = clients.get(id);
      const player = players.get(id);
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!client.voicePublishSessionId || player.voiceSessionId !== client.voicePublishSessionId) return json(response, 409, { error: 'O microfone ainda não foi publicado.' });
      client.voiceReady = true;
      player.voiceEnabled = true;
      broadcast({ type: 'state', player }, player.id);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 400, { error: error.message || 'Falha ao ativar a voz.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/subscribe') {
    try {
      const data = await readJson(request, 2048);
      const id = String(data.id || '');
      const toId = String(data.to || '');
      const client = clients.get(id);
      const listener = players.get(id);
      const speaker = players.get(toId);
      const speakerClient = clients.get(toId);
      if (!client || !listener) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!hasSfuConfig()) return json(response, 503, { error: 'Voz centralizada ainda não configurada no servidor.' });
      if (!speaker || !speakerClient || !speaker.voiceEnabled || !speaker.voiceSessionId || !speakerClient.voicePublishSessionId) return json(response, 409, { error: 'Esse jogador não está transmitindo voz.' });
      if (!listener.voiceEnabled || !withinVoiceRadius(listener, speaker)) return json(response, 403, { error: 'Jogador fora do raio de voz.' });
      if (client.voiceSubscriptions.has(toId)) return json(response, 409, { error: 'A conexão de áudio já foi iniciada.' });
      if (!allowSfuSession(client)) return json(response, 429, { error: 'Muitas conexões de voz. Aguarde um minuto.' });
      const publishingSessionId = speaker.voiceSessionId;
      const session = await callSfu('/sessions/new');
      if (typeof session.sessionId !== 'string') throw Object.assign(new Error('Sessão de recepção inválida.'), { statusCode: 502 });
      const subscription = await callSfu(`/sessions/${encodeURIComponent(session.sessionId)}/tracks/new`, 'POST', {
        tracks: [{ location: 'remote', sessionId: speaker.voiceSessionId, trackName: 'lowkey-mic' }],
      });
      if (subscription.tracks?.some(track => track.errorCode) || subscription.sessionDescription?.type !== 'offer' || typeof subscription.sessionDescription?.sdp !== 'string') {
        await closeSfuTracks(session.sessionId, (subscription.tracks || []).map(track => track.mid).filter(mid => typeof mid === 'string'));
        throw Object.assign(new Error('O SFU não conseguiu preparar o áudio.'), { statusCode: 502 });
      }
      const mids = (subscription.tracks || []).map(track => track.mid).filter(mid => typeof mid === 'string');
      if (clients.get(id) !== client || players.get(id) !== listener || clients.get(toId) !== speakerClient || players.get(toId) !== speaker || !listener.voiceEnabled || !speaker.voiceEnabled || speaker.voiceSessionId !== publishingSessionId || !withinVoiceRadius(listener, speaker)) {
        await closeSfuTracks(session.sessionId, mids);
        return json(response, 409, { error: 'A sala ou a distância mudou durante a conexão.' });
      }
      client.voiceSubscriptions.set(toId, { sessionId: session.sessionId, mids });
      return json(response, 200, { sessionId: session.sessionId, sessionDescription: subscription.sessionDescription });
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao assinar o áudio.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/renegotiate') {
    try {
      const data = await readJson(request, 32768);
      const id = String(data.id || '');
      const toId = String(data.to || '');
      const sessionId = String(data.sessionId || '');
      const client = clients.get(id);
      const listener = players.get(id);
      const speaker = players.get(toId);
      const subscription = client?.voiceSubscriptions.get(toId);
      if (!client || !listener) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!subscription || subscription.sessionId !== sessionId || !speaker?.voiceEnabled || !withinVoiceRadius(listener, speaker)) return json(response, 403, { error: 'A assinatura de voz não está mais autorizada.' });
      if (data.sessionDescription?.type !== 'answer' || typeof data.sessionDescription?.sdp !== 'string' || data.sessionDescription.sdp.length > 24000) return json(response, 400, { error: 'Resposta de voz inválida.' });
      await callSfu(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, 'PUT', { sessionDescription: data.sessionDescription });
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao confirmar o áudio.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/unsubscribe') {
    try {
      const data = await readJson(request, 2048);
      const client = clients.get(String(data.id || ''));
      const toId = String(data.to || '');
      if (!client) return json(response, 401, { error: 'Jogador não conectado.' });
      const subscription = client.voiceSubscriptions.get(toId);
      if (subscription && (!data.sessionId || data.sessionId === subscription.sessionId)) {
        client.voiceSubscriptions.delete(toId);
        await closeSfuTracks(subscription.sessionId, subscription.mids);
      }
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao fechar o áudio.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/stop') {
    try {
      const data = await readJson(request, 2048);
      const id = String(data.id || '');
      const client = clients.get(id);
      const player = players.get(id);
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      const publishSessionId = client.voicePublishSessionId;
      const publishMid = client.voicePublishMid;
      const subscriptions = [...client.voiceSubscriptions.values()];
      client.voicePublishSessionId = null;
      client.voicePublishMid = null;
      client.voiceReady = false;
      client.voiceSubscriptions.clear();
      player.voiceSessionId = null;
      player.voiceEnabled = false;
      broadcast({ type: 'state', player }, player.id);
      await Promise.all([
        closeSfuTracks(publishSessionId, publishMid ? [publishMid] : []),
        ...subscriptions.map(subscription => closeSfuTracks(subscription.sessionId, subscription.mids)),
      ]);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao desligar a voz.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const data = await readJson(request, 2048);
      const client = clients.get(String(data.id || ''));
      const player = players.get(String(data.id || ''));
      const text = String(data.text || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 90);
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!text) return json(response, 400, { error: 'Escreva uma mensagem.' });
      const now = Date.now();
      if (now - client.lastChatAt < 500) return json(response, 429, { error: 'Espera um pouquinho antes de mandar outra mensagem.' });
      client.lastChatAt = now;
      broadcastWithinChatRadius({ type: 'chat', id: player.id, name: player.name, text, time: now }, player);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice-signal') {
    try {
      if (hasSfuConfig()) return json(response, 410, { error: 'A sala usa voz centralizada.' });
      const data = await readJson(request, 16384);
      const fromId = String(data.id || '');
      const toId = String(data.to || '');
      const client = clients.get(fromId);
      const sender = players.get(fromId);
      const recipient = players.get(toId);
      const recipientClient = clients.get(toId);
      const kind = String(data.kind || '');
      const allowedKinds = new Set(['offer', 'answer', 'candidate']);
      if (!client || !sender) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!recipient || !recipientClient) return json(response, 404, { error: 'Jogador não encontrado.' });
      if (!recipient.voiceEnabled) return json(response, 409, { error: 'O outro jogador ainda não ativou a voz.' });
      if (!allowedKinds.has(kind) || !data.payload || typeof data.payload !== 'object') {
        return json(response, 400, { error: 'Sinal de voz inválido.' });
      }
      if (kind === 'candidate' ? typeof data.payload.candidate !== 'string' : data.payload.type !== kind || typeof data.payload.sdp !== 'string') {
        return json(response, 400, { error: 'Descrição de voz inválida.' });
      }
      if (JSON.stringify(data.payload).length > 12000) return json(response, 413, { error: 'Sinal de voz muito grande.' });
      if (!withinVoiceRadius(sender, recipient)) return json(response, 403, { error: 'Jogador fora do raio de voz.' });
      const now = Date.now();
      const signalTimes = (client.voiceSignalTimes || []).filter(time => now - time < 1000);
      if (signalTimes.length >= 80) return json(response, 429, { error: 'Muitos sinais de voz; aguarde um instante.' });
      signalTimes.push(now);
      client.voiceSignalTimes = signalTimes;
      send(recipientClient.response, { type: 'voice-signal', from: fromId, kind, payload: data.payload });
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 400, { error: error.message });
    }
  }

  if (request.method !== 'GET') return json(response, 405, { error: 'Método não permitido.' });
  const file = allowedFiles.get(url.pathname);
  if (!file) return json(response, 404, { error: 'Não encontrado.' });
  try {
    const contents = await readFile(join(ROOT, file));
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': file === 'index.html' ? 'no-store' : 'public, max-age=3600' });
    response.end(contents);
  } catch {
    json(response, 500, { error: 'Não consegui abrir os arquivos do jogo.' });
  }
});

setInterval(() => {
  for (const client of clients.values()) client.response.write(': keepalive\n\n');
}, 25000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LowKey Praça 001 — sala multiplayer pronta.`);
  console.log(`Neste computador: http://localhost:${PORT}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`Na mesma rede Wi-Fi: http://${address.address}:${PORT}`);
    }
  }
  console.log('Para jogar, todos devem abrir o mesmo endereço no navegador. Feche esta janela para encerrar a sala.');
});

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const client of clients.values()) client.response.end();
  server.close(() => process.exit(0));
});
