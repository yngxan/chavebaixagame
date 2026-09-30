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
const VOICE_RADIUS = CHAT_RADIUS * 1.5;
const SFU_API = 'https://rtc.live.cloudflare.com/v1';
const SFU_APP_ID = process.env.CF_SFU_APP_ID || '';
const SFU_APP_SECRET = process.env.CF_SFU_APP_SECRET || '';
const TURN_KEY_ID = process.env.CF_TURN_KEY_ID || '';
const TURN_API_TOKEN = process.env.CF_TURN_API_TOKEN || '';
const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const TURN_CREDENTIAL_TTL = 86400;
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
  ) <= VOICE_RADIUS;
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
    const operation = path === '/sessions/new' ? path : path.replace(/^\/sessions\/[^/]+/, '/sessions/:sessionId');
    console.warn(`Cloudflare SFU recusou ${method} ${operation} (${response.status}${result.errorCode ? ` · ${result.errorCode}` : ''}).`);
    throw Object.assign(new Error('Não consegui completar a conexão central de voz.'), { statusCode: 502 });
  }
  return result;
}
async function getTurnIceServers(client) {
  if (!TURN_KEY_ID || !TURN_API_TOKEN) return { iceServers: DEFAULT_ICE_SERVERS, turnEnabled: false };
  if (client.turnIceServers?.length && client.turnIceExpiresAt > Date.now() + 30 * 60 * 1000) {
    return { iceServers: client.turnIceServers, turnEnabled: true };
  }
  if (client.turnIceRequest) return client.turnIceRequest;
  client.turnIceRequest = (async () => {
    const response = await fetch(`${SFU_API}/turn/keys/${encodeURIComponent(TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TURN_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL }),
      signal: AbortSignal.timeout(8000),
    });
    let result = {};
    try { result = await response.json(); } catch { /* resposta inválida */ }
    const servers = Array.isArray(result.iceServers) ? result.iceServers.filter(server => server?.urls) : [];
    if (!response.ok || !servers.length) {
      console.warn(`Cloudflare TURN não gerou credenciais (${response.status}). Usando STUN como fallback.`);
      return { iceServers: DEFAULT_ICE_SERVERS, turnEnabled: false };
    }
    client.turnIceServers = servers;
    client.turnIceExpiresAt = Date.now() + TURN_CREDENTIAL_TTL * 1000;
    return { iceServers: servers, turnEnabled: true };
  })().catch(error => {
    console.warn(`Cloudflare TURN indisponível (${error.name || 'erro'}). Usando STUN como fallback.`);
    return { iceServers: DEFAULT_ICE_SERVERS, turnEnabled: false };
  }).finally(() => { client.turnIceRequest = null; });
  return client.turnIceRequest;
}
async function closeSfuTracks(sessionId, mids) {
  if (!sessionId || !mids?.length || !hasSfuConfig()) return;
  try {
    await callSfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/close`, 'PUT', {
      tracks: mids.map(mid => ({ mid })), force: true,
    });
  } catch { /* sessões que expiraram já não têm mídia para encaminhar */ }
}
function queueVoiceMutation(client, operation) {
  const next = (client.voiceMutationQueue || Promise.resolve()).then(operation, operation);
  client.voiceMutationQueue = next.catch(() => {});
  return next;
}
async function cleanupSfuPublisher(client) {
  if (!client) return;
  await closeSfuTracks(client.voicePublishSessionId, client.voicePublishMid ? [client.voicePublishMid] : []);
  client.voicePublishSessionId = null;
  client.voicePublishMid = null;
  client.voiceReady = false;
}
async function cleanupSfuClient(client) {
  if (!client) return;
  const receiverSessionId = client.voiceReceiveSessionId;
  const receiverMids = [...(client.voiceSubscriptions?.values() || [])].flatMap(subscription => subscription.mids || []);
  await Promise.all([
    cleanupSfuPublisher(client),
    closeSfuTracks(receiverSessionId, receiverMids),
  ]);
  client.voiceReceiveSessionId = null;
  client.voiceSubscriptions?.clear();
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (request.method === 'GET' && url.pathname === '/api/voice/config') {
    const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    const mode = hasSfuConfig() ? 'sfu' : localHost ? 'direct' : 'unconfigured';
    return json(response, 200, { mode, centralized: mode === 'sfu' });
  }
  if (request.method === 'POST' && url.pathname === '/api/voice/ice-servers') {
    try {
      const data = await readJson(request, 2048);
      const client = clients.get(String(data.id || ''));
      if (!client) return json(response, 401, { error: 'Jogador não conectado.' });
      return json(response, 200, await getTurnIceServers(client));
    } catch (error) {
      return json(response, 502, { error: 'Não consegui preparar os servidores de rede para a voz.' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    if (clients.size >= MAX_PLAYERS) return json(response, 503, { error: 'Sala cheia (limite: 32 jogadores).' });
    const id = randomUUID();
    const existingPlayers = [...players.values()];
    const angle = existingPlayers.length * 2.399;
    const radius = 2.8 + Math.floor(existingPlayers.length / 10) * 0.5;
    const player = {
      id, name: 'CHAVE', appearance: { skin: '#f4c9a0', hair: '#e2ddce', hairAccent: '#f1e9df', facialHair: '#4a3028', shirt: '#8294b0', pants: '#25242b', shoe: '#414d69', eyeLeft: '#596881', eyeRight: '#8a4c59', gender: 'feminine', hairStyle: 'long', hairFall: 'open', beardStyle: 'none', key: true, hood: false },
      position: { x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }, rotation: 0, walking: false, jumping: true, speed: 0, voiceEnabled: false, voiceSessionId: null,
    };
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    clients.set(id, { response, lastStateAt: 0, lastChatAt: 0, lastEmoteAt: -Infinity, voiceSignalTimes: [], sfuSessionTimes: [], voicePublishSessionId: null, voicePublishMid: null, voiceReady: false, voiceReceiveSessionId: null, voiceMutationQueue: Promise.resolve(), voiceSubscriptions: new Map(), turnIceServers: null, turnIceExpiresAt: 0, turnIceRequest: null });
    players.set(id, player);
    send(response, { type: 'hello', id, spawn: player.position, players: existingPlayers });
    broadcast({ type: 'join', player }, id);
    response.on('close', () => {
      const current = clients.get(id);
      if (!current || current.response !== response) return;
      clients.delete(id);
      void queueVoiceMutation(current, () => cleanupSfuClient(current));
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
        skin: cleanColor(appearance.skin, '#f4c9a0'), hair: cleanColor(appearance.hair, '#17151d'), hairAccent: cleanColor(appearance.hairAccent, '#725047'), facialHair: cleanColor(appearance.facialHair, '#4a3028'),
        shirt: cleanColor(appearance.shirt, '#25232e'), pants: cleanColor(appearance.pants, '#25242b'), shoe: cleanColor(appearance.shoe, '#414d69'),
        eyeLeft: cleanColor(appearance.eyeLeft, '#596881'), eyeRight: cleanColor(appearance.eyeRight, '#8a4c59'),
        gender: ['masculine', 'feminine'].includes(appearance.gender) ? appearance.gender : 'masculine',
        hairStyle: ['short', 'fringe', 'medium', 'long', 'longBack', 'curly', 'curlyVolume', 'auburnBob', 'dreads', 'shaggy'].includes(appearance.hairStyle) ? appearance.hairStyle : 'fringe',
        hairFall: appearance.hairFall === 'overEyes' ? 'overEyes' : 'open',
        beardStyle: ['none', 'goatee', 'mustache', 'full', 'mustacheGoatee'].includes(appearance.beardStyle) ? appearance.beardStyle : 'none',
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
      await cleanupSfuPublisher(client);
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
      const data = await readJson(request, 8192);
      const id = String(data.id || '');
      const client = clients.get(id);
      if (!client || !players.has(id)) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!hasSfuConfig()) return json(response, 503, { error: 'Voz centralizada ainda não configurada no servidor.' });
      return await queueVoiceMutation(client, async () => {
        const requestedIds = Array.isArray(data.toIds) ? data.toIds : data.to ? [data.to] : [];
        const toIds = [...new Set(requestedIds.map(value => String(value || '')).filter(toId => toId && toId !== id))].slice(0, MAX_PLAYERS - 1);
        if (!toIds.length) return json(response, 400, { error: 'Nenhum jogador para conectar.' });
        if (client.voiceReceiveSessionId && data.sessionId !== client.voiceReceiveSessionId) return json(response, 409, { error: 'A sessão de recepção mudou. Reconecte o áudio da sala.' });
        if (!client.voiceReceiveSessionId && data.sessionId) return json(response, 409, { error: 'A sessão de recepção expirou. Reconecte o áudio da sala.' });
        const sources = toIds.map(toId => ({ toId, player: players.get(toId), sourceClient: clients.get(toId) }))
          .filter(source => source.player?.voiceEnabled && source.player.voiceSessionId && source.sourceClient?.voiceReady && source.sourceClient.voicePublishSessionId === source.player.voiceSessionId && !client.voiceSubscriptions.has(source.toId));
        if (!sources.length) return json(response, 425, { error: 'Aguardando um microfone ativo para conectar o áudio.' });
        if (!client.voiceReceiveSessionId && !allowSfuSession(client)) return json(response, 429, { error: 'Muitas reconexões de voz. Aguarde um minuto.' });
        let sessionId = client.voiceReceiveSessionId;
        if (!sessionId) {
          const session = await callSfu('/sessions/new');
          if (typeof session.sessionId !== 'string') throw Object.assign(new Error('Sessão de recepção inválida.'), { statusCode: 502 });
          sessionId = session.sessionId;
          client.voiceReceiveSessionId = sessionId;
        }
        const sourceBySessionId = new Map(sources.map(source => [source.player.voiceSessionId, source.toId]));
        const subscription = await callSfu(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, 'POST', {
          tracks: sources.map(source => ({ location: 'remote', sessionId: source.player.voiceSessionId, trackName: 'lowkey-mic' })),
        });
        if (subscription.sessionDescription?.type !== 'offer' || typeof subscription.sessionDescription?.sdp !== 'string') {
          throw Object.assign(new Error('O SFU não conseguiu preparar o áudio.'), { statusCode: 502 });
        }
        const tracks = (subscription.tracks || []).map(track => {
          const playerId = sourceBySessionId.get(track.sessionId);
          if (playerId && typeof track.mid === 'string' && track.mid && !track.errorCode) {
            client.voiceSubscriptions.set(playerId, { sessionId, mids: [track.mid], publisherSessionId: track.sessionId });
          }
          return { playerId: playerId || null, publisherSessionId: track.sessionId || null, mid: track.mid || null, errorCode: track.errorCode || null, errorDescription: track.errorDescription || null };
        });
        if (!tracks.some(track => track.playerId && track.mid && !track.errorCode)) {
          if (client.voiceReceiveSessionId === sessionId && ![...client.voiceSubscriptions.values()].some(subscription => subscription.sessionId === sessionId)) client.voiceReceiveSessionId = null;
          throw Object.assign(new Error('O SFU não conseguiu assinar as vozes disponíveis.'), { statusCode: 502 });
        }
        return json(response, 200, { sessionId, sessionDescription: subscription.sessionDescription, tracks });
      });
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao assinar o áudio.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/renegotiate') {
    try {
      const data = await readJson(request, 128000);
      const id = String(data.id || '');
      const sessionId = String(data.sessionId || '');
      const client = clients.get(id);
      if (!client || !players.has(id)) return json(response, 401, { error: 'Jogador não conectado.' });
      if (data.sessionDescription?.type !== 'answer' || typeof data.sessionDescription?.sdp !== 'string' || data.sessionDescription.sdp.length > 100000) return json(response, 400, { error: 'Resposta de voz inválida.' });
      return await queueVoiceMutation(client, async () => {
        if (!client.voiceReceiveSessionId || client.voiceReceiveSessionId !== sessionId) return json(response, 409, { error: 'A sessão de recepção expirou.' });
        await callSfu(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, 'PUT', { sessionDescription: data.sessionDescription });
        response.writeHead(204);
        return response.end();
      });
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
      return await queueVoiceMutation(client, async () => {
        const subscription = client.voiceSubscriptions.get(toId);
        if (subscription && client.voiceReceiveSessionId === subscription.sessionId && (!data.sessionId || data.sessionId === subscription.sessionId)) {
          client.voiceSubscriptions.delete(toId);
          await closeSfuTracks(subscription.sessionId, subscription.mids);
        }
        response.writeHead(204);
        return response.end();
      });
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
      client.voicePublishSessionId = null;
      client.voicePublishMid = null;
      client.voiceReady = false;
      player.voiceSessionId = null;
      player.voiceEnabled = false;
      broadcast({ type: 'state', player }, player.id);
      await closeSfuTracks(publishSessionId, publishMid ? [publishMid] : []);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao desligar a voz.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/stop-listening') {
    try {
      const data = await readJson(request, 2048);
      const client = clients.get(String(data.id || ''));
      if (!client) return json(response, 401, { error: 'Jogador não conectado.' });
      return await queueVoiceMutation(client, async () => {
        const sessionId = client.voiceReceiveSessionId;
        if (sessionId && (!data.sessionId || data.sessionId === sessionId)) {
          const mids = [...client.voiceSubscriptions.values()].flatMap(subscription => subscription.mids || []);
          client.voiceReceiveSessionId = null;
          client.voiceSubscriptions.clear();
          await closeSfuTracks(sessionId, mids);
        }
        response.writeHead(204);
        return response.end();
      });
    } catch (error) {
      return json(response, error.statusCode || 502, { error: error.message || 'Falha ao fechar a recepção de voz.' });
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

  if (request.method === 'POST' && url.pathname === '/api/emote') {
    try {
      const data = await readJson(request, 1024);
      const id = String(data.id || '');
      const client = clients.get(id);
      const player = players.get(id);
      const emote = String(data.emote || '');
      const allowedEmotes = new Set(['wave', 'dance', 'clap', 'heart', 'smoke']);
      if (!client || !player) return json(response, 401, { error: 'Jogador não conectado.' });
      if (!allowedEmotes.has(emote)) return json(response, 400, { error: 'Emote inválido.' });
      const now = Date.now();
      if (now - client.lastEmoteAt < 650) return json(response, 429, { error: 'Espera um instante antes de outro emote.' });
      client.lastEmoteAt = now;
      broadcast({ type: 'emote', id, emote, time: now }, id);
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
