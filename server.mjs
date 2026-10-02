import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import './world-systems.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const INFINITE_GLOCK_AMMO = true;
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
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PROFILE_FILE = join(ROOT, 'data', 'accounts.json');
const scrypt = promisify(scryptCallback);
const clients = new Map();
const players = new Map();
const vehicles = new Map(LowkeyWorld.initialVehicles().map(vehicle=>[vehicle.id,vehicle]));
const vehicleInputs = new Map();
const pendingHijacks=new Map();
const worldSnapshot = () => ({serverTime:Date.now(),segmentMs:LowkeyWorld.SEGMENT_MS,vehicles:[...vehicles.values()]});
function cancelVehicleHijack(vehicle){const pending=pendingHijacks.get(vehicle?.id);if(!pending)return;clearTimeout(pending.timer);pendingHijacks.delete(vehicle.id);vehicle.hijacking=null;const thief=clients.get(pending.thiefId);if(thief){thief.hijackingVehicleId=null;send(thief.response,{type:'vehicle-hijack-cancel',vehicleId:vehicle.id});}}
function releaseVehicle(player) {
  const vehicle=vehicles.get(player?.vehicleId);
  if(!vehicle)return;
  const driver=vehicle.driverId===player.id,seat=(vehicle.passengerIds||[]).indexOf(player.id);
  if(!driver&&seat<0)return;
  if(driver){vehicle.driverId=null;vehicle.speed=0;vehicleInputs.delete(vehicle.id);}else vehicle.passengerIds.splice(seat,1);
  player.vehicleId=null;player.vehicleSeat=null;
  const exit=LowkeyWorld.exitPosition(vehicle);if(exit)player.position=exit;
  player.walking=false;player.jumping=false;player.speed=0;player.motionTime=Date.now();player.motionReset=(player.motionReset||0)+1;
  lastKnownPositions.set(player.accountId,player.position);
}
const projectiles = new Map();
// Movement is client-predicted for responsiveness, but accepted positions stay server-bounded.
// Credits allow jump/knockback and short network jitter without permitting teleport speeds.
const SECURITY_WINDOW_MS = 15000;
const SECURITY_KICK_LIMIT = 5;
const SECURITY_COOLDOWN_MS = 30000;
const movementViolations = new Map();
const securityCooldowns = new Map();
const lastKnownPositions = new Map();
function noteMovementViolation(client, response, reason) {
  const now = Date.now(), recent = (movementViolations.get(client.accountId) || []).filter(at => now - at < SECURITY_WINDOW_MS);
  recent.push(now); movementViolations.set(client.accountId, recent);
  console.warn(`[anti-cheat] movimento rejeitado (${reason}); violações recentes: ${recent.length}`);
  if (recent.length < SECURITY_KICK_LIMIT) { response.writeHead(204); return response.end(); }
  securityCooldowns.set(client.accountId, now + SECURITY_COOLDOWN_MS);
  response.writeHead(403, { 'cache-control': 'no-store', 'retry-after': String(SECURITY_COOLDOWN_MS / 1000) });
  response.end(JSON.stringify({ error: 'Movimento inválido repetido. Aguarde 30 segundos para reconectar.' }));
  client.response.end();
}
// Closest point between the attack segment and a player's vertical body capsule.
function playerSegmentHit(from, to, position, radius) {
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,lengthSq=dx*dx+dy*dy+dz*dz;
  const low=position.y+.35,high=position.y+1.94,clamp=t=>Math.max(0,Math.min(1,t)),horizontal=dx*dx+dz*dz;
  const samples=[0,1];
  if(horizontal)samples.push(clamp(((position.x-from.x)*dx+(position.z-from.z)*dz)/horizontal));
  for(const y of [low,high])if(lengthSq)samples.push(clamp(((position.x-from.x)*dx+(y-from.y)*dy+(position.z-from.z)*dz)/lengthSq));
  let best=null,bestDistance=Infinity;
  for(const t of samples){const x=from.x+dx*t,y=from.y+dy*t,z=from.z+dz*t,vertical=y-Math.max(low,Math.min(high,y)),distance=(x-position.x)**2+vertical**2+(z-position.z)**2;if(distance<radius*radius&&distance<bestDistance){best=t;bestDistance=distance;}}
  return best;
}
const failedLogins = new Map();
const sessionAccounts = new Map();
const authRequests = new Map();
let database = null;
let localAccounts = { accounts: [], sessions: [] };
let localWriteQueue = Promise.resolve();
const allowedFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/three.min.js', 'three.min.js'],
  ['/stage-media.js', 'stage-media.js'],
  ['/motion-sync.js', 'motion-sync.js'],
  ['/world-systems.js', 'world-systems.js'],
  ['/vehicles-client.js', 'vehicles-client.js'],
  ['/environment.js', 'environment.js'],
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
function snowballVelocity(facing, cameraPitch, speed = 28) {
  const pitch = Math.max(-Math.PI / 2 + .04, Math.min(Math.PI / 2 - .04, finite(cameraPitch)));
  const horizontal = Math.cos(pitch);
  return { x: Math.sin(facing) * horizontal * speed, y: -Math.sin(pitch) * speed, z: Math.cos(facing) * horizontal * speed };
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
      try { const parsed = JSON.parse(body || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object'); resolve(parsed); }
      catch { reject(Object.assign(new Error('JSON inválido'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}
function json(response, statusCode, value) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}
const DEFAULT_APPEARANCE = { skin: '#f4c9a0', hair: '#e2ddce', hairAccent: '#f1e9df', facialHair: '#4a3028', shirt: '#8294b0', pants: '#25242b', shoe: '#414d69', shoeAccent: '#ba2744', eyeLeft: '#596881', eyeRight: '#8a4c59', gender: 'feminine', hairStyle: 'long', hairFall: 'open', beardStyle: 'none', headwear: 'none', shoeStyle: 'classic', key: true, hood: false };
const ALLOWED_GENDERS = new Set(['masculine', 'feminine']);
const ALLOWED_HAIR_STYLES = new Set(['short', 'fringe', 'medium', 'long', 'longBack', 'curly', 'curlyVolume', 'auburnBob', 'dreads', 'shaggy', 'fade', 'lowBlack', 'braids']);
const ALLOWED_BEARDS = new Set(['none', 'goatee', 'mustache', 'full', 'mustacheGoatee']);
function cleanAppearance(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    skin: cleanColor(value.skin, DEFAULT_APPEARANCE.skin), hair: cleanColor(value.hair, DEFAULT_APPEARANCE.hair),
    hairAccent: cleanColor(value.hairAccent, DEFAULT_APPEARANCE.hairAccent), facialHair: cleanColor(value.facialHair, DEFAULT_APPEARANCE.facialHair),
    shirt: cleanColor(value.shirt, DEFAULT_APPEARANCE.shirt), pants: cleanColor(value.pants, DEFAULT_APPEARANCE.pants), shoe: cleanColor(value.shoe, DEFAULT_APPEARANCE.shoe),
    shoeAccent: cleanColor(value.shoeAccent, DEFAULT_APPEARANCE.shoeAccent),
    eyeLeft: cleanColor(value.eyeLeft, DEFAULT_APPEARANCE.eyeLeft), eyeRight: cleanColor(value.eyeRight, DEFAULT_APPEARANCE.eyeRight),
    gender: ALLOWED_GENDERS.has(value.gender) ? value.gender : DEFAULT_APPEARANCE.gender,
    hairStyle: ALLOWED_HAIR_STYLES.has(value.hairStyle) ? value.hairStyle : DEFAULT_APPEARANCE.hairStyle,
    hairFall: value.hairFall === 'overEyes' ? 'overEyes' : 'open',
    beardStyle: ALLOWED_BEARDS.has(value.beardStyle) ? value.beardStyle : 'none',
    headwear: value.headwear === 'nyCap' ? 'nyCap' : 'none', shoeStyle: value.shoeStyle === 'jordan' ? 'jordan' : 'classic',
    key: typeof value.key === 'boolean' ? value.key : DEFAULT_APPEARANCE.key, hood: value.headwear !== 'nyCap' && (typeof value.hood === 'boolean' ? value.hood : DEFAULT_APPEARANCE.hood),
  };
}
function cleanProfile(value = {}, fallbackName = 'JOGADOR') {
  return { name: cleanName(value.name || fallbackName).toUpperCase(), eyeMode: value.eyeMode === 'both' ? 'both' : 'separate', hasChosenHairColor: Boolean(value.hasChosenHairColor), appearance: cleanAppearance(value.appearance) };
}
function normalizeUsername(value) { return String(value || '').trim().toLowerCase(); }
function validUsername(value) { return /^[a-z0-9_.-]{3,20}$/.test(value); }
function passwordHash(password, salt) { return scrypt(password, Buffer.from(salt, 'hex'), 64).then(result => Buffer.from(result).toString('hex')); }
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
function readCookie(request, name) {
  const cookies = String(request.headers.cookie || '').split(';');
  for (const cookie of cookies) { const [key, ...value] = cookie.trim().split('='); if (key === name) return value.join('='); }
  return '';
}
function sessionCookie(request, token, maxAge = Math.floor(SESSION_DURATION_MS / 1000)) {
  const secure = request.headers['x-forwarded-proto'] === 'https' || Boolean(request.socket.encrypted);
  return `lowkey_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
async function persistLocalAccounts() {
  const snapshot = JSON.stringify(localAccounts);
  localWriteQueue = localWriteQueue.catch(() => {}).then(async () => {
    await mkdir(dirname(PROFILE_FILE), { recursive: true });
    const temporary = `${PROFILE_FILE}.tmp`;
    await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, PROFILE_FILE);
  });
  return localWriteQueue;
}
async function initializeAccountStore() {
  if (process.env.RENDER === 'true' && !process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL antes de publicar o sistema de contas no Render.');
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    database = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
    database.on('error', () => console.error('Conexão ociosa com o banco de contas foi encerrada.'));
    await database.query(`CREATE TABLE IF NOT EXISTS lowkey_accounts (
      id UUID PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, profile JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query(`CREATE TABLE IF NOT EXISTS lowkey_sessions (
      token_hash TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES lowkey_accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await database.query('CREATE INDEX IF NOT EXISTS lowkey_sessions_expiry_idx ON lowkey_sessions (expires_at)');
    console.log('Armazenamento de contas conectado ao PostgreSQL.');
    return;
  }
  try {
    const saved = JSON.parse(await readFile(PROFILE_FILE, 'utf8'));
    localAccounts = { accounts: Array.isArray(saved.accounts) ? saved.accounts : [], sessions: Array.isArray(saved.sessions) ? saved.sessions : [] };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log('Armazenamento local de contas ativo (senhas protegidas por hash).');
}
await initializeAccountStore();
// Resolve the existing owner's account, never a client-supplied character name.
const administratorAccountId = (await findAccountByUsername('yngxan'))?.id || null;
let stageMedia = { videoId: null, playing: false, position: 0, updatedAt: Date.now(), playbackId: randomUUID(), duration: null, queue: [] };
const STAGE_FILE = join(ROOT, 'data', 'stage.json');
let stageMutationQueue = Promise.resolve();
if (database) {
  await database.query('CREATE TABLE IF NOT EXISTS lowkey_stage (id INTEGER PRIMARY KEY CHECK (id = 1), state JSONB NOT NULL)');
  const saved = await database.query('SELECT state FROM lowkey_stage WHERE id = 1');
  if (saved.rows[0]) stageMedia = { ...stageMedia, ...saved.rows[0].state };
} else {
  try { stageMedia = { ...stageMedia, ...JSON.parse(await readFile(STAGE_FILE, 'utf8')) }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
// Keep the server timeline across disconnects and deployments; late joiners use this timestamp.
if (!stageMedia.playing) stageMedia.updatedAt = Date.now();
function stageSnapshot(accountId) { const { queue, ...state } = stageMedia; return { ...state, queueCount: queue.length, ...(accountId === administratorAccountId ? { queue } : {}), serverTime: Date.now() }; }
function broadcastStage() { for (const client of clients.values()) send(client.response, { type: 'stage-media', stageMedia: stageSnapshot(client.accountId) }); }
async function persistStage(state) {
  if (database) await database.query('INSERT INTO lowkey_stage (id, state) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state', [state]);
  else { await mkdir(dirname(STAGE_FILE), { recursive: true }); await writeFile(`${STAGE_FILE}.tmp`, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 }); await rename(`${STAGE_FILE}.tmp`, STAGE_FILE); }
}
function mutateStage(operation) { const task = stageMutationQueue.catch(() => {}).then(operation); stageMutationQueue = task; return task; }
function nextStageVideo(state, now) { const queue = [...state.queue], item = queue.shift(); return { ...state, videoId: item?.videoId || null, playing: Boolean(item), position: 0, updatedAt: now, duration: null, playbackId: randomUUID(), queue }; }
setInterval(() => {
  void mutateStage(async () => {
    if (!stageMedia.playing || !stageMedia.duration || stageMedia.position + (Date.now() - stageMedia.updatedAt) / 1000 < stageMedia.duration) return;
    const next = nextStageVideo(stageMedia, Date.now()); await persistStage(next); stageMedia = next; broadcastStage();
  }).catch(() => console.error('Falha ao avançar a fila do palco.'));
}, 1000).unref();
function isAdministrator(account) { return Boolean(administratorAccountId && account?.id === administratorAccountId); }
function publicAccount(account) { return { id: account.id, username: account.username, profile: account.profile, role: isAdministrator(account) ? 'admin' : 'player' }; }
async function findAccountByUsername(username) {
  if (database) { const result = await database.query('SELECT id, username, password_salt AS "passwordSalt", password_hash AS "passwordHash", profile FROM lowkey_accounts WHERE username = $1', [username]); return result.rows[0] || null; }
  return localAccounts.accounts.find(account => account.username === username) || null;
}
async function findAccountById(id) {
  if (database) { const result = await database.query('SELECT id, username, profile FROM lowkey_accounts WHERE id = $1', [id]); return result.rows[0] || null; }
  return localAccounts.accounts.find(account => account.id === id) || null;
}
async function createAccount(account) {
  if (database) {
    const result = await database.query('INSERT INTO lowkey_accounts (id, username, password_salt, password_hash, profile) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, profile', [account.id, account.username, account.passwordSalt, account.passwordHash, account.profile]);
    return result.rows[0];
  }
  if (localAccounts.accounts.some(existing => existing.username === account.username)) throw Object.assign(new Error('Este usuário já existe.'), { code: '23505' });
  localAccounts.accounts.push(account);
  await persistLocalAccounts();
  return account;
}
async function updateAccountProfile(id, profile) {
  if (database) { const result = await database.query('UPDATE lowkey_accounts SET profile = $2 WHERE id = $1 RETURNING id', [id, profile]); if (!result.rowCount) return false; }
  else { const account = localAccounts.accounts.find(item => item.id === id); if (!account) return false; account.profile = profile; await persistLocalAccounts(); }
  for (const cached of sessionAccounts.values()) if (cached.account.id === id) cached.account.profile = profile;
  return true;
}
async function createAccountSession(accountId) {
  const token = randomBytes(32).toString('base64url'), hash = tokenHash(token), expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  if (database) await database.query('INSERT INTO lowkey_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [hash, accountId, expiresAt]);
  else { localAccounts.sessions = localAccounts.sessions.filter(session => Date.parse(session.expiresAt) > Date.now()); localAccounts.sessions.push({ tokenHash: hash, accountId, expiresAt: expiresAt.toISOString() }); await persistLocalAccounts(); }
  return token;
}
async function accountForRequest(request) {
  const token = readCookie(request, 'lowkey_session');
  if (!token || token.length > 100) return null;
  const hash = tokenHash(token);
  const cached = sessionAccounts.get(hash);
  if (cached && cached.validUntil > Date.now()) return cached.account;
  sessionAccounts.delete(hash);
  let account = null, expiresAt = 0;
  if (database) { const result = await database.query('SELECT a.id, a.username, a.profile, s.expires_at AS "expiresAt" FROM lowkey_sessions s JOIN lowkey_accounts a ON a.id = s.account_id WHERE s.token_hash = $1 AND s.expires_at > NOW()', [hash]); if (result.rows[0]) { account = publicAccount(result.rows[0]); expiresAt = new Date(result.rows[0].expiresAt).getTime(); } }
  else { const session = localAccounts.sessions.find(item => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now()); if (session) { const stored = await findAccountById(session.accountId); account = stored ? publicAccount(stored) : null; expiresAt = Date.parse(session.expiresAt); } }
  if (account) sessionAccounts.set(hash, { account, validUntil: Math.min(expiresAt, Date.now() + 30000) });
  return account;
}
async function deleteAccountSession(request) {
  const token = readCookie(request, 'lowkey_session');
  if (!token || token.length > 100) return;
  const hash = tokenHash(token);
  sessionAccounts.delete(hash);
  if (database) await database.query('DELETE FROM lowkey_sessions WHERE token_hash = $1', [hash]);
  else { const before = localAccounts.sessions.length; localAccounts.sessions = localAccounts.sessions.filter(session => session.tokenHash !== hash); if (before !== localAccounts.sessions.length) await persistLocalAccounts(); }
}
function authRateLimited(username) {
  const key = normalizeUsername(username), now = Date.now(), attempts = (failedLogins.get(key) || []).filter(at => now - at < 15 * 60 * 1000);
  if (attempts.length >= 8) { failedLogins.set(key, attempts); return true; }
  return false;
}
function noteFailedLogin(username) { const key = normalizeUsername(username), now = Date.now(), attempts = (failedLogins.get(key) || []).filter(at => now - at < 15 * 60 * 1000); attempts.push(now); failedLogins.set(key, attempts); }
function clientAddress(request) {
  const forwarded = process.env.RENDER === 'true' ? String(request.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim() : '';
  return forwarded || request.socket.remoteAddress || 'local';
}
function limitAuthRequests(request) {
  const key = clientAddress(request), now = Date.now(), attempts = (authRequests.get(key) || []).filter(at => now - at < 15 * 60 * 1000);
  if (attempts.length >= 100) return true;
  attempts.push(now); authRequests.set(key, attempts); return false;
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
  if (request.method === 'GET' && url.pathname === '/healthz') {
    try { if (database) await database.query({ text: 'SELECT 1', query_timeout: 3000 }); return json(response, 200, { ok: true }); }
    catch { return json(response, 503, { ok: false }); }
  }
  if (request.method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(url.pathname) && limitAuthRequests(request)) return json(response, 429, { error: 'Muitas tentativas de entrada. Aguarde alguns minutos.' });
  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const data = await readJson(request, 4096), username = normalizeUsername(data.username), password = String(data.password || '');
      if (!validUsername(username)) return json(response, 400, { error: 'Use um usuário de 3 a 20 caracteres: letras, números, ponto, traço ou underline.' });
      if (password.length < 8 || password.length > 128) return json(response, 400, { error: 'A senha precisa ter entre 8 e 128 caracteres.' });
      if (authRateLimited(username)) return json(response, 429, { error: 'Muitas tentativas para esse usuário. Aguarde 15 minutos.' });
      if (await findAccountByUsername(username)) return json(response, 409, { error: 'Este usuário já existe. Entre com a senha dele.' });
      const salt = randomBytes(16).toString('hex'), profile = cleanProfile({}, username.toUpperCase());
      const account = { id: randomUUID(), username, passwordSalt: salt, passwordHash: await passwordHash(password, salt), profile };
      let created;
      try { created = await createAccount(account); }
      catch (error) { if (error.code === '23505') return json(response, 409, { error: 'Este usuário já existe. Entre com a senha dele.' }); throw error; }
      failedLogins.delete(username);
      response.setHeader('set-cookie', sessionCookie(request, await createAccountSession(created.id)));
      return json(response, 201, { user: publicAccount(created) });
    } catch (error) {
      console.error('Falha no cadastro de conta.');
      return json(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Não consegui criar a conta agora.' });
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const data = await readJson(request, 4096), username = normalizeUsername(data.username), password = String(data.password || '');
      if (authRateLimited(username)) return json(response, 429, { error: 'Muitas tentativas para esse usuário. Aguarde 15 minutos.' });
      const account = validUsername(username) ? await findAccountByUsername(username) : null;
      const salt = account?.passwordSalt || account?.password_salt || '4a6f10a9d624e8e882f80c9a5d9a1578';
      const actualHash = account?.passwordHash || account?.password_hash || '0'.repeat(128);
      const candidate = Buffer.from(await passwordHash(password.slice(0, 128), salt), 'hex'), expected = Buffer.from(actualHash, 'hex');
      const matches = expected.length === candidate.length && timingSafeEqual(expected, candidate);
      if (!account || !matches) { noteFailedLogin(username); return json(response, 401, { error: 'Usuário ou senha incorretos.' }); }
      failedLogins.delete(username);
      response.setHeader('set-cookie', sessionCookie(request, await createAccountSession(account.id)));
      return json(response, 200, { user: publicAccount(account) });
    } catch (error) {
      console.error('Falha ao entrar em uma conta.');
      return json(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Não consegui entrar agora.' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    try { const account = await accountForRequest(request); return account ? json(response, 200, { user: publicAccount(account) }) : json(response, 401, { error: 'Entre na sua conta.' }); }
    catch { return json(response, 503, { error: 'O serviço de contas está indisponível.' }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    try {
      const account = await accountForRequest(request);
      await deleteAccountSession(request);
      response.setHeader('set-cookie', sessionCookie(request, '', 0));
      if (account) for (const client of clients.values()) if (client.accountId === account.id) client.response.end();
      return json(response, 200, { ok: true });
    } catch { return json(response, 503, { error: 'Não consegui sair da conta agora.' }); }
  }
  if (request.method === 'POST' && url.pathname === '/api/profile') {
    try {
      const account = await accountForRequest(request);
      if (!account) return json(response, 401, { error: 'Entre na sua conta.' });
      const data = await readJson(request, 4096), profile = cleanProfile(data, account.username.toUpperCase());
      if (!await updateAccountProfile(account.id, profile)) return json(response, 404, { error: 'Conta não encontrada.' });
      return json(response, 200, { profile });
    } catch (error) { return json(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Não consegui salvar o personagem.' }); }
  }
  const publicApiPaths = new Set(['/api/auth/register', '/api/auth/login', '/api/auth/me', '/api/auth/logout', '/api/voice/config']);
  let authenticatedAccount = null;
  if (url.pathname.startsWith('/api/') && !publicApiPaths.has(url.pathname) && url.pathname !== '/api/profile') {
    try { authenticatedAccount = await accountForRequest(request); }
    catch { return json(response, 503, { error: 'O serviço de contas está indisponível.' }); }
    if (!authenticatedAccount) return json(response, 401, { error: 'Entre na sua conta para jogar.' });
  }
  if (request.method === 'GET' && url.pathname === '/api/stage') return json(response, 200, stageSnapshot(authenticatedAccount.id));
  if (request.method === 'POST' && url.pathname === '/api/stage') {
    if (!isAdministrator(authenticatedAccount)) return json(response, 403, { error: 'Só o administrador controla o palco.' });
    try {
      const data = await readJson(request, 2048);
      await mutateStage(async () => {
        const now = Date.now(), position = stageMedia.position + (stageMedia.playing ? (now - stageMedia.updatedAt) / 1000 : 0);
        let next = { ...stageMedia, queue: [...stageMedia.queue] };
        const invalid = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
        if (['load', 'enqueue'].includes(data.action)) {
          if (!/^[A-Za-z0-9_-]{11}$/.test(data.videoId || '')) invalid('Vídeo do YouTube inválido.');
          if (data.action === 'load') next = { ...next, videoId: data.videoId, playing: true, position: 0, updatedAt: now, duration: null, playbackId: randomUUID() };
          else { if (next.queue.length >= 100) invalid('A fila aceita até 100 vídeos.'); next.queue.push({ id: randomUUID(), videoId: data.videoId }); if (!next.videoId) next = nextStageVideo(next, now); }
        } else if (['play', 'pause', 'stop'].includes(data.action)) {
          next = { ...next, playing: data.action === 'play' && Boolean(next.videoId), position: data.action === 'stop' ? 0 : position, updatedAt: now };
        } else if (data.action === 'next') next = nextStageVideo(next, now);
        else if (['remove', 'move'].includes(data.action)) {
          const index = next.queue.findIndex(item => item.id === data.itemId); if (index < 0) invalid('Este vídeo não está mais na fila.');
          if (data.action === 'remove') next.queue.splice(index, 1);
          else { if (![-1, 1].includes(data.direction)) invalid('Direção inválida.'); const target = index + data.direction; if (target < 0 || target >= next.queue.length) invalid('Limite da fila.'); [next.queue[index], next.queue[target]] = [next.queue[target], next.queue[index]]; }
        } else if (data.action === 'duration') {
          if (data.playbackId !== next.playbackId) throw Object.assign(new Error('O vídeo já mudou.'), { statusCode: 409 });
          if (!Number.isFinite(data.duration) || data.duration < 1 || data.duration > 86400) invalid('Duração inválida.');
          next.duration = data.duration;
        } else invalid('Ação inválida.');
        await persistStage(next); stageMedia = next; broadcastStage();
      });
      return json(response, 200, stageSnapshot(authenticatedAccount.id));
    } catch (error) { return json(response, error.statusCode || 503, { error: error.statusCode ? error.message : 'Não consegui salvar a fila do palco.' }); }
  }
  if (request.method === 'GET' && url.pathname === '/api/voice/config') {
    const localHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
    const mode = hasSfuConfig() ? 'sfu' : localHost ? 'direct' : 'unconfigured';
    return json(response, 200, { mode, centralized: mode === 'sfu' });
  }
  if (request.method === 'POST' && url.pathname === '/api/voice/ice-servers') {
    try {
      const data = await readJson(request, 2048);
      const client = clients.get(String(data.id || ''));
      if (!client || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
      return json(response, 200, await getTurnIceServers(client));
    } catch (error) {
      return json(response, 502, { error: 'Não consegui preparar os servidores de rede para a voz.' });
    }
  }
  if (request.method === 'GET' && url.pathname === '/api/events') {
    const cooldownUntil = securityCooldowns.get(authenticatedAccount.id) || 0;
    if (cooldownUntil > Date.now()) return json(response, 403, { error: 'Entrada pausada por movimento inválido. Tente novamente em instantes.' });
    if (cooldownUntil) securityCooldowns.delete(authenticatedAccount.id);
    const address = clientAddress(request), connectionsFromAddress = [...clients.values()].filter(client => client.address === address).length;
    if (connectionsFromAddress >= 8) return json(response, 429, { error: 'Este endereço já tem muitas conexões ativas na praça.' });
    if (clients.size >= MAX_PLAYERS) return json(response, 503, { error: 'Sala cheia (limite: 32 jogadores).' });
    const id = randomUUID();
    const existingPlayers = [...players.values()];
    const angle = existingPlayers.length * 2.399;
    const radius = 2.8 + Math.floor(existingPlayers.length / 10) * 0.5;
    const profile = cleanProfile(authenticatedAccount.profile, authenticatedAccount.username.toUpperCase());
    const player = {
      id, accountId: authenticatedAccount.id, name: profile.name, appearance: profile.appearance,
      position: lastKnownPositions.get(authenticatedAccount.id) || { x: Math.cos(angle) * radius, y: 18, z: 5 + Math.sin(angle) * radius }, rotation: 0, walking: false, jumping: true, speed: 0, voiceEnabled: false, voiceSessionId: null, health: 100, glockEquipped: false, vehicleId:null,vehicleSeat:null,lastVehicleImpactAt:0,
    };
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    clients.set(id, { response, accountId: authenticatedAccount.id, address, lastStateAt: 0, lastStateSequence: -1, motionAt: Date.now(), movementCredits: 4, lastChatAt: 0, lastEmoteAt: -Infinity, lastCombatAt: -Infinity, weapon: { mag: 20, reserve: 120, reloadingUntil: 0, lastShotAt: -Infinity, lastBurstAt: -Infinity, burst: 0 }, deadUntil: 0, respawnPosition: { x: Math.cos(angle) * radius, y: 0, z: 5 + Math.sin(angle) * radius }, voiceSignalTimes: [], sfuSessionTimes: [], voicePublishSessionId: null, voicePublishMid: null, voiceReady: false, voiceReceiveSessionId: null, voiceMutationQueue: Promise.resolve(), voiceSubscriptions: new Map(), turnIceServers: null, turnIceExpiresAt: 0, turnIceRequest: null });
    players.set(id, player);
    clients.get(id).compactMotion = url.searchParams.get('motion') === '2';
    send(response, { type: 'hello', id, spawn: player.position, players: existingPlayers, stageMedia: stageSnapshot(authenticatedAccount.id), weapon: { mag: 20, reserve: 120, reloading: false }, health: 100 });
    send(response, {type:'world-state',...worldSnapshot()});
    broadcast({ type: 'join', player }, id);
    response.on('close', () => {
      const current = clients.get(id);
      if (!current || current.response !== response) return;
      clients.delete(id);
      const departing=players.get(id),wasRiding=Boolean(departing?.vehicleId);
      for(const vehicle of vehicles.values())if(vehicle.hijacking?.thiefId===id)cancelVehicleHijack(vehicle);
      releaseVehicle(departing);
      if(wasRiding)broadcast({type:'world-state',...worldSnapshot()});
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
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
      const now = Date.now();
      if(client.hijackingVehicleId){response.writeHead(204);return response.end();}
      if(player.vehicleId){response.writeHead(204);return response.end();}
      if (client.deadUntil) {
        if (now < client.deadUntil) { response.writeHead(204); return response.end(); }
        client.deadUntil = 0;
        player.position = { ...client.respawnPosition };
        lastKnownPositions.set(client.accountId, player.position);
        player.health = 100;
        player.walking = false;
        player.jumping = false;
        player.speed = 0;
        player.motionTime = now;
        player.motionReset = (player.motionReset || 0) + 1;
        send(client.response, { type: 'weapon-health', targetId: player.id, health: 100, respawnPosition: player.position });
        broadcast({ type: 'state', player }, player.id);
        response.writeHead(204);
        return response.end();
      }
      const sequence = data.sequence;
      if (Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= client.lastStateSequence) { response.writeHead(204); return response.end(); }
      if (now - client.lastStateAt < 15) { response.writeHead(204); return response.end(); }
      if (Number.isSafeInteger(sequence) && sequence >= 0) client.lastStateSequence = sequence;
      client.lastStateAt = now;
      const appearance = data.appearance || {};
      const position = data.position || {};
      if (![position.x, position.y, position.z].every(value => typeof value === 'number' && Number.isFinite(value))) return noteMovementViolation(client, response, 'posição inválida');
      const nextPosition = { x: position.x, y: position.y, z: position.z };
      if (Math.abs(nextPosition.x) > 65 || Math.abs(nextPosition.z) > 65 || nextPosition.y < -52 || nextPosition.y > 22) return noteMovementViolation(client, response, 'limite do mapa');
      const elapsed = Math.min(1.5, Math.max(.04, (now - client.motionAt) / 1000));
      const dx = nextPosition.x - player.position.x, dy = nextPosition.y - player.position.y, dz = nextPosition.z - player.position.z;
      const horizontalDistance = Math.hypot(dx, dz), verticalDistance = Math.abs(dy);
      const movementCredits = Math.min(5, client.movementCredits + elapsed * 12.5);
      const initialSpawnFall = player.position.y >= 12 && nextPosition.y < player.position.y && nextPosition.y >= -1;
      const fallReset = player.position.y < -35 && nextPosition.y >= 12 && Math.hypot(nextPosition.x - client.respawnPosition.x, nextPosition.z - client.respawnPosition.z) <= 1.5;
      if ((!fallReset && horizontalDistance > movementCredits + .35) || (!initialSpawnFall && !fallReset && verticalDistance > elapsed * 18 + 1.8)) return noteMovementViolation(client, response, `velocidade impossível: horizontal=${horizontalDistance.toFixed(2)}, vertical=${verticalDistance.toFixed(2)}, intervalo=${elapsed.toFixed(3)}, altura=${player.position.y.toFixed(2)}→${nextPosition.y.toFixed(2)}`);
      client.motionAt = now;
      client.movementCredits = fallReset ? 4 : Math.max(0, movementCredits - horizontalDistance);
      lastKnownPositions.set(client.accountId, nextPosition);
      const oldProfile = JSON.stringify([player.name, player.appearance]);
      if (data.name !== undefined) player.name = cleanName(data.name);
      if (data.appearance !== undefined) player.appearance = cleanAppearance(appearance);
      player.position = nextPosition;
      const sampledAt = Number(data.sampledAt);
      const captureDelta = Number.isFinite(sampledAt) && Number.isFinite(client.lastSampleAt) && sampledAt > client.lastSampleAt
        ? Math.min(1500, sampledAt - client.lastSampleAt) : elapsed * 1000;
      client.lastSampleAt = Number.isFinite(sampledAt) ? sampledAt : undefined;
      player.motionTime = (player.motionTime || now - captureDelta) + captureDelta;
      const rotation = finite(data.rotation, player.rotation);
      player.rotation = Math.atan2(Math.sin(rotation), Math.cos(rotation));
      player.speed = Math.min(14, horizontalDistance / Math.max(.015, captureDelta / 1000));
      player.walking = horizontalDistance > .025;
      player.jumping = data.jumping === true;
      player.voiceEnabled = hasSfuConfig() ? Boolean(client.voiceReady && client.voicePublishSessionId) : Boolean(data.voiceEnabled);
      player.glockEquipped = Boolean(data.glockEquipped);
      player.glockPitch = Math.max(-Math.PI / 2 + .04, Math.min(Math.PI / 2 - .04, finite(data.glockPitch)));
      player.glockAiming = player.glockEquipped && data.glockAiming === true;
      const profileChanged = JSON.stringify([player.name, player.appearance]) !== oldProfile;
      const { appearance: fullAppearance, name: fullName, accountId: privateAccountId, ...motion } = player;
      for (const [recipientId, recipient] of clients) if (recipientId !== player.id) {
        send(recipient.response, { type: 'state', player: profileChanged || !recipient.compactMotion ? { ...motion, name: fullName, appearance: fullAppearance } : motion });
      }
      response.writeHead(204);
      return response.end();
    } catch (error) {
      if (!response.headersSent) return json(response, error.statusCode || 400, { error: error.message });
      return response.destroy();
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/vehicle') {
    try {
      const data=await readJson(request,2048),player=players.get(String(data.id||'')),client=clients.get(String(data.id||'')),now=Date.now();
      if(!player||!client||client.accountId!==authenticatedAccount.id)return json(response,401,{error:'Jogador não conectado.'});
      if(client.deadUntil)return json(response,409,{error:'Espere voltar à praça.'});
      if(data.action==='enter') {
        if(player.vehicleId)return json(response,409,{error:'Você já está em um veículo.'});
        const vehicle=vehicles.get(String(data.vehicleId||''));if(!vehicle)return json(response,404,{error:'Veículo não encontrado.'});
        if(vehicle.wrecked||vehicle.hijacking)return json(response,409,{error:'Esse veículo não pode ser ocupado agora.'});
        if(Math.hypot(player.position.x-vehicle.x,player.position.z-vehicle.z)>3.2||Math.abs(player.position.y-vehicle.y)>1.5)return json(response,403,{error:'Chegue mais perto para entrar.'});
        if(!vehicle.driverId){vehicle.driverId=player.id;player.vehicleSeat='driver';vehicleInputs.set(vehicle.id,{throttle:0,steer:0,brake:true,at:now,sequence:-1});}
        else if((vehicle.passengerIds||[]).length<1){vehicle.passengerIds||=[];vehicle.passengerIds.push(player.id);player.vehicleSeat='passenger';}
        else return json(response,409,{error:'O veículo está cheio. Tente puxar o motorista para fora.'});
        if(player.vehicleSeat==='driver')vehicle.speed=0;player.vehicleId=vehicle.id;player.glockEquipped=false;player.glockAiming=false;
        const pose=player.vehicleSeat==='driver'?LowkeyWorld.driverPose(vehicle):LowkeyWorld.passengerPose(vehicle,0);player.position={x:pose.x,y:pose.y,z:pose.z};player.rotation=pose.rotation;player.walking=false;player.jumping=false;player.speed=Math.abs(vehicle.speed);player.motionTime=now;player.motionReset=(player.motionReset||0)+1;
      } else if(data.action==='exit') {
        const vehicle=vehicles.get(player.vehicleId);if(!vehicle||vehicle.driverId!==player.id&&!(vehicle.passengerIds||[]).includes(player.id))return json(response,409,{error:'Você não está em um veículo.'});
        if(vehicle.hijacking)return json(response,409,{error:'Aguarde a ação terminar.'});
        if(Math.abs(vehicle.speed)>2.5)return json(response,409,{error:'Freie antes de sair.'});
        if(!LowkeyWorld.exitPosition(vehicle))return json(response,409,{error:'Sem espaço para sair. Afaste o veículo.'});
        releaseVehicle(player);client.motionAt=now;client.movementCredits=4;client.lastSampleAt=undefined;send(client.response,{type:'vehicle-exit',position:player.position});
      } else if(data.action==='steal') {
        if(player.vehicleId)return json(response,409,{error:'Saia do veículo atual primeiro.'});
        const vehicle=vehicles.get(String(data.vehicleId||''));if(!vehicle)return json(response,404,{error:'Veículo não encontrado.'});
        const victim=players.get(vehicle.driverId),victimClient=clients.get(vehicle.driverId);
        if(vehicle.wrecked)return json(response,409,{error:'Esse veículo está destruído.'});if(vehicle.hijacking)return json(response,409,{error:'Alguém já está tentando roubar esse veículo.'});
        if(!victim||!victimClient)return json(response,409,{error:'O veículo está livre.'});
        if(Math.hypot(player.position.x-vehicle.x,player.position.z-vehicle.z)>2.6||Math.abs(player.position.y-vehicle.y)>1.5)return json(response,403,{error:'Chegue mais perto do motorista para puxá-lo.'});
        if(Math.abs(vehicle.speed)>6)return json(response,409,{error:'O veículo está rápido demais para roubar.'});
        const outside=LowkeyWorld.exitPosition(vehicle);if(!outside)return json(response,409,{error:'Não há espaço ao lado do veículo para puxar o motorista.'});
        const hijack={thiefId:player.id,victimId:victim.id,startedAt:now,from:LowkeyWorld.driverPose(vehicle),outside};vehicle.hijacking=hijack;vehicle.speed=0;vehicleInputs.set(vehicle.id,{throttle:0,steer:0,brake:true,at:now,sequence:-1});client.hijackingVehicleId=vehicle.id;
        broadcast({type:'vehicle-hijack',vehicleId:vehicle.id,thiefId:player.id,victimId:victim.id,startedAt:now,duration:650});
        const timer=setTimeout(()=>{
          if(vehicle.hijacking!==hijack)return;
          const thief=players.get(hijack.thiefId),thiefClient=clients.get(hijack.thiefId),oldDriver=players.get(hijack.victimId);
          if(!thief||!thiefClient||!oldDriver||oldDriver.vehicleId!==vehicle.id){cancelVehicleHijack(vehicle);broadcast({type:'world-state',...worldSnapshot()});return;}
          const outside=hijack.outside;
          oldDriver.vehicleId=null;oldDriver.vehicleSeat=null;oldDriver.position=outside;oldDriver.rotation=vehicle.rotation;oldDriver.walking=false;oldDriver.jumping=true;oldDriver.motionTime=Date.now();oldDriver.motionReset=(oldDriver.motionReset||0)+1;
          const victimSeat=(vehicle.passengerIds||[]).indexOf(oldDriver.id);if(victimSeat>=0)vehicle.passengerIds.splice(victimSeat,1);
          const driverPose=LowkeyWorld.driverPose(vehicle);thief.vehicleId=vehicle.id;thief.vehicleSeat='driver';thief.position={x:driverPose.x,y:driverPose.y,z:driverPose.z};thief.rotation=vehicle.rotation;thief.walking=false;thief.jumping=false;thief.motionTime=Date.now();thief.motionReset=(thief.motionReset||0)+1;thief.glockEquipped=false;thief.glockAiming=false;
          vehicle.driverId=thief.id;vehicle.hijacking=null;pendingHijacks.delete(vehicle.id);thiefClient.hijackingVehicleId=null;
          victimClient.movementCredits=5;victimClient.motionAt=Date.now();victimClient.lastSampleAt=undefined;lastKnownPositions.set(oldDriver.accountId,outside);lastKnownPositions.set(thief.accountId,thief.position);
          send(victimClient.response,{type:'vehicle-exit',position:outside,impulse:{x:Math.cos(vehicle.rotation)*2.7,y:4.5,z:-Math.sin(vehicle.rotation)*2.7},pulled:true});send(thiefClient.response,{type:'vehicle-hijack-complete',vehicleId:vehicle.id});
          broadcast({type:'state',player:oldDriver});broadcast({type:'state',player:thief});broadcast({type:'world-state',...worldSnapshot()});
        },650).unref();pendingHijacks.set(vehicle.id,{...hijack,timer});broadcast({type:'world-state',...worldSnapshot()});response.writeHead(202);return response.end(JSON.stringify({ok:true,hijacking:true}));
      } else if(data.action==='input') {
        const vehicle=vehicles.get(player.vehicleId);
        if(!vehicle||vehicle.driverId!==player.id)return json(response,403,{error:'Você não dirige esse veículo.'});
        if(vehicle.wrecked||vehicle.hijacking)return json(response,409,{error:'O veículo não está disponível para dirigir.'});
        if(!Number.isFinite(data.throttle)||!Number.isFinite(data.steer)||Math.abs(data.throttle)>1||Math.abs(data.steer)>1||!Number.isSafeInteger(data.sequence))return json(response,400,{error:'Comando de direção inválido.'});
        const previous=vehicleInputs.get(vehicle.id);
        if(data.sequence<=(previous?.sequence??-1)||now-(previous?.at??0)<25){response.writeHead(204);return response.end();}
        vehicleInputs.set(vehicle.id,{throttle:data.throttle,steer:data.steer,brake:data.brake===true,at:now,sequence:data.sequence});
        response.writeHead(204);return response.end();
      } else return json(response,400,{error:'Ação de veículo inválida.'});
      broadcast({type:'state',player});broadcast({type:'world-state',...worldSnapshot()});
      return json(response,200,{ok:true});
    } catch(error){return json(response,error.statusCode||400,{error:error.message});}
  }

  if (request.method === 'POST' && url.pathname === '/api/voice/sfu/publish') {
    try {
      const data = await readJson(request, 32768);
      const id = String(data.id || '');
      const client = clients.get(id);
      const player = players.get(id);
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || client.accountId !== authenticatedAccount.id || !players.has(id)) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || client.accountId !== authenticatedAccount.id || !players.has(id)) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
      if (!allowedEmotes.has(emote)) return json(response, 400, { error: 'Emote inválido.' });
      if (player.vehicleId) return json(response, 409, { error: 'Saia do veículo para usar emotes.' });
      const now = Date.now();
      if (now - client.lastEmoteAt < 650) return json(response, 429, { error: 'Espera um instante antes de outro emote.' });
      client.lastEmoteAt = now;
      client.combatToken=null;
      broadcast({ type: 'emote', id, emote, time: now }, id);
      response.writeHead(204);
      return response.end();
    } catch (error) {
      return json(response, error.statusCode || 400, { error: error.message });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/reload') {
    try {
      const data = await readJson(request, 1024), id = String(data.id || ''), client = clients.get(id), player = players.get(id);
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
      if (client.deadUntil) return json(response, 409, { error: 'Espere voltar à praça.' });
      const weapon = client.weapon, now = Date.now();
      if (weapon.reloadingUntil > now) return json(response, 409, { error: 'A Glock já está recarregando.' });
      if (INFINITE_GLOCK_AMMO) { send(client.response, { type: 'weapon-state', mag: 20, reserve: 120, reloading: false }); response.writeHead(204); return response.end(); }
      if (weapon.mag >= 20 || weapon.reserve <= 0) return json(response, 409, { error: weapon.reserve <= 0 ? 'Sem munição reserva.' : 'O pente já está cheio.' });
      const reloadUntil = now + 1450;
      weapon.reloadingUntil = reloadUntil;
      send(client.response, { type: 'weapon-state', mag: weapon.mag, reserve: weapon.reserve, reloading: true });
      setTimeout(() => {
        if (clients.get(id) !== client || players.get(id) !== player || weapon.reloadingUntil !== reloadUntil) return;
        const loaded = Math.min(20 - weapon.mag, weapon.reserve);
        weapon.mag += loaded;
        weapon.reserve -= loaded;
        weapon.reloadingUntil = 0;
        send(client.response, { type: 'weapon-state', mag: INFINITE_GLOCK_AMMO ? 20 : weapon.mag, reserve: INFINITE_GLOCK_AMMO ? 120 : weapon.reserve, reloading: false });
      }, 1450).unref();
      response.writeHead(204);
      return response.end();
    } catch (error) { return json(response, error.statusCode || 400, { error: error.message || 'Não consegui recarregar.' }); }
  }

  if (request.method === 'POST' && url.pathname === '/api/combat') {
    try {
      const data = await readJson(request, 1024), id = String(data.id || ''), client = clients.get(id), player = players.get(id), action = String(data.action || '');
      if (!client || !player || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
      if (player.vehicleId) return json(response, 409, { error: 'Saia do veículo para atacar.' });
      if (client.deadUntil) return json(response, 409, { error: 'Espere voltar à praça.' });
      if (action === 'glock') {
        if (player.vehicleId) return json(response, 409, { error: 'Saia do veículo para atacar.' });
        const weapon = client.weapon, now = Date.now();
        if (weapon.reloadingUntil > now) return json(response, 409, { error: 'A Glock está recarregando.' });
        if (!INFINITE_GLOCK_AMMO && weapon.mag <= 0) return json(response, 409, { error: 'Pente vazio · aperte R para recarregar.' });
        if (now - weapon.lastShotAt < 138) return json(response, 429, { error: 'A Glock é semiautomática · toque de novo.' });
        const facing = Math.atan2(Math.sin(finite(data.facing, player.rotation)), Math.cos(finite(data.facing, player.rotation)));
        const firstPerson = data.firstPerson === true;
        const cameraYaw = Math.atan2(Math.sin(finite(data.cameraYaw, -facing)), Math.cos(finite(data.cameraYaw, -facing)));
        let pitch = Math.max(-Math.PI / 2 + .04, Math.min(Math.PI / 2 - .04, finite(data.pitch)));
        const snapshot=data.shotPosition;let shotPosition=player.position;
        if(snapshot&&[snapshot.x,snapshot.y,snapshot.z].every(Number.isFinite)&&Math.hypot(snapshot.x-player.position.x,snapshot.y-player.position.y,snapshot.z-player.position.z)<=1.8)shotPosition=snapshot;
        const supplied = data.launchOrigin;
        let origin = null;
        if (supplied && Number.isFinite(Number(supplied.x)) && Number.isFinite(Number(supplied.y)) && Number.isFinite(Number(supplied.z))) {
          const candidate = { x: Number(supplied.x), y: Number(supplied.y), z: Number(supplied.z) };
          if (Math.hypot(candidate.x - shotPosition.x, candidate.z - shotPosition.z) <= 1.5 && candidate.y - shotPosition.y >= .2 && candidate.y - shotPosition.y <= 2.8) origin = candidate;
        }
        let yaw = cameraYaw;
        if (!origin) origin = { x: shotPosition.x + Math.sin(facing) * .38, y: shotPosition.y + 1.43, z: shotPosition.z + Math.cos(facing) * .38 };
        const aimPoint=data.aimPoint;
        if(aimPoint&&[aimPoint.x,aimPoint.y,aimPoint.z].every(Number.isFinite)){
          const dx=aimPoint.x-origin.x,dy=aimPoint.y-origin.y,dz=aimPoint.z-origin.z,length=Math.hypot(dx,dy,dz);
          if(length>.1&&length<=90){yaw=Math.atan2(-dx,dz);pitch=Math.atan2(-dy,Math.hypot(dx,dz));}
        }
        const burst = now - weapon.lastBurstAt < 410 ? Math.min(weapon.burst + 1, 8) : 1;
        weapon.burst = burst;
        weapon.lastBurstAt = now;
        weapon.lastShotAt = now;
        if (!INFINITE_GLOCK_AMMO) weapon.mag -= 1;
        const spread = (.0015 + burst * .0017 + (player.speed > 5.2 ? .009 : player.speed > 2 ? .0035 : 0) + (player.position.y > .16 ? .013 : 0)) * (data.aiming === true ? .72 : 1);
        const angle = Math.random() * Math.PI * 2, radius = Math.sqrt(Math.random()) * spread;
        const shotYaw = yaw + Math.cos(angle) * radius;
        const shotPitch = pitch + Math.sin(angle) * radius;
        const direction = { x: -Math.sin(shotYaw) * Math.cos(shotPitch), y: -Math.sin(shotPitch), z: Math.cos(shotYaw) * Math.cos(shotPitch) };
        const range = 70, end = { x: origin.x + direction.x * range, y: origin.y + direction.y * range, z: origin.z + direction.z * range };
        let target = null, nearest = Infinity;
        for (const candidate of players.values()) {
          if (candidate.id === id || candidate.health <= 0 || candidate.position.y < -.2) continue;
          const hit = playerSegmentHit(origin, end, candidate.position, .34);
          if (hit !== null && hit < nearest) { target = candidate; nearest = hit; }
        }
        let hitPoint = end, headshot = false, damage = 0;
        if (target) {
          hitPoint = { x: origin.x + (end.x - origin.x) * nearest, y: origin.y + (end.y - origin.y) * nearest, z: origin.z + (end.z - origin.z) * nearest };
          headshot = hitPoint.y >= target.position.y + 1.63;
          damage = headshot ? 100 : 34;
          target.health = Math.max(0, (target.health ?? 100) - damage);
        }
        player.glockEquipped = true;
        send(client.response, { type: 'weapon-state', mag: weapon.mag, reserve: weapon.reserve, reloading: false });
        player.rotation=facing;player.glockPitch=finite(data.pitch);player.glockAiming=data.aiming===true;
        broadcast({ type: 'glock-shot', shooterId: id, facing, pitch:player.glockPitch, firstPerson, start: origin, end: hitPoint, hit: Boolean(target), targetId: target?.id || null, headshot, time: now });
        if (target) {
          const impulseLength = Math.hypot(direction.x, direction.z) || 1;
          const deadUntil = target.health <= 0 ? now + 2200 : 0;
          const targetClient = clients.get(target.id);
          if (targetClient && deadUntil) targetClient.deadUntil = deadUntil;
          if (targetClient) send(targetClient.response, { type: 'weapon-health', targetId: target.id, health: target.health, deadUntil, impulse: deadUntil ? null : { x: direction.x / impulseLength * .85, z: direction.z / impulseLength * .85 } });
          if (deadUntil) broadcast({ type: 'glock-elimination', shooterId: id, targetId: target.id, headshot, time: now });
        }
        response.writeHead(204);
        return response.end();
      }
      if (!['punch', 'snowball'].includes(action)) return json(response, 400, { error: 'Ação inválida.' });
      if(action==='punch'){
        const now=Date.now();
        client.punchClicks=(client.punchClicks||[]).filter(at=>now-at<1000);
        client.punchIds||=new Map();for(const [key,at] of client.punchIds)if(now-at>5000)client.punchIds.delete(key);
        const swingId=data.swingId;
        if(swingId!==undefined&&(!Number.isSafeInteger(swingId)||swingId<0))return json(response,400,{error:'Soco inválido.'});
        if(swingId!==undefined&&client.punchIds.has(swingId))return json(response,200,{ok:true,duplicate:true});
        if(client.punchClicks.length>=30)return json(response,429,{error:'Muitos ataques por segundo.'});
        client.punchClicks.push(now);if(swingId!==undefined)client.punchIds.set(swingId,now);
        const facing=Math.atan2(Math.sin(finite(data.facing,player.rotation)),Math.cos(finite(data.facing,player.rotation)));
        const pitch=Math.max(-Math.PI/2+.04,Math.min(Math.PI/2-.04,finite(data.pitch)));
        const aim={x:Math.sin(facing)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(facing)*Math.cos(pitch)};
        const origin={x:player.position.x,y:player.position.y+1.42,z:player.position.z},reach=2.7;
        const end={x:origin.x+aim.x*reach,y:origin.y+aim.y*reach,z:origin.z+aim.z*reach};
        let target=null,nearest=Infinity;
        for(const candidate of players.values()){
          if(candidate.id===id||candidate.health<=0||candidate.vehicleId)continue;
          const hit=playerSegmentHit(origin,end,candidate.position,.36);
          if(hit!==null&&hit<nearest){target=candidate;nearest=hit;}
        }
        player.rotation=facing;
        broadcast({type:'combat-start',id,kind:'punch',facing,pitch,firstPerson:data.firstPerson===true,swingId,time:now});
        let impulse=null,damage=0;
        if(target){
          const dx=target.position.x-player.position.x,dz=target.position.z-player.position.z,length=Math.hypot(dx,dz);
          const force=player.speed>6.8?6.5:4.8;
          impulse={x:(length>.001?dx/length:aim.x)*force,y:3.2,z:(length>.001?dz/length:aim.z)*force};
          damage=4;target.health=Math.max(0,target.health-damage);
          const victim=clients.get(target.id),deadUntil=target.health<=0?now+2200:0;
          if(victim){victim.movementCredits=Math.min(7,(victim.movementCredits||0)+2.5);if(deadUntil)victim.deadUntil=deadUntil;send(victim.response,{type:'weapon-health',targetId:target.id,health:target.health,deadUntil});}
          if(deadUntil)impulse=null;
        }
        broadcast({type:'combat-punch',id,swingId,targetId:target?.id||null,damage,health:target?.health,impulse,time:now});
        return json(response,200,{ok:true,swingId,hit:Boolean(target)});
      }
      const now = Date.now(), cooldown = 420;
      if (now - client.lastCombatAt < cooldown) return json(response, 429, { error: 'Espera um instante antes de atacar de novo.' });
      client.lastCombatAt = now;
      const combatToken=randomUUID();client.combatToken=combatToken;
      const facing = Math.atan2(Math.sin(finite(data.facing, player.rotation)), Math.cos(finite(data.facing, player.rotation)));
      const firstPerson = action === 'snowball' && data.firstPerson === true;
      const cameraYaw = firstPerson ? Math.atan2(Math.sin(finite(data.cameraYaw, -facing)), Math.cos(finite(data.cameraYaw, -facing))) : -facing;
      const yaw = firstPerson ? cameraYaw : -facing, cameraPitch = action === 'snowball' ? Math.max(-Math.PI / 2 + .04, Math.min(Math.PI / 2 - .04, finite(data.pitch))) : 0;
      const aim = { x: -Math.sin(yaw) * Math.cos(cameraPitch), y: -Math.sin(cameraPitch), z: Math.cos(yaw) * Math.cos(cameraPitch) };
      let handOrigin = null;
      if (firstPerson) {
        const supplied = data.launchOrigin;
        if (supplied && Number.isFinite(Number(supplied.x)) && Number.isFinite(Number(supplied.y)) && Number.isFinite(Number(supplied.z))) {
          const candidate = { x: Number(supplied.x), y: Number(supplied.y), z: Number(supplied.z) };
          const horizontalOffset = Math.hypot(candidate.x - player.position.x, candidate.z - player.position.z);
          const verticalOffset = candidate.y - player.position.y;
          if (horizontalOffset <= 1.5 && verticalOffset >= .2 && verticalOffset <= 2.8) handOrigin = candidate;
        }
        if (!handOrigin) return json(response, 400, { error: 'Não consegui localizar a mão para lançar.' });
      }
      player.rotation=facing;
      broadcast({type:'combat-start',id,kind:action,facing,pitch:action==='snowball'?cameraPitch:0,firstPerson,time:now});
      // Resolve the strike/release at the matching animation keyframe, once only.
      setTimeout(() => {
      if(clients.get(id)!==client||players.get(id)!==player||client.combatToken!==combatToken)return;
      const releasedAt=Date.now();
        const position = firstPerson
          ? { x: handOrigin.x + aim.x * .12, y: handOrigin.y + aim.y * .12, z: handOrigin.z + aim.z * .12 }
          : { x: player.position.x - Math.cos(yaw) * .34 + aim.x * .55, y: player.position.y + .94 + aim.y * .22, z: player.position.z - Math.sin(yaw) * .34 + aim.z * .55 };
        const velocity = snowballVelocity(firstPerson ? -cameraYaw : facing, cameraPitch);
        const projectile = { id: randomUUID(), ownerId: id, kind: action, position, velocity, lastAt: releasedAt, createdAt: releasedAt };
        projectiles.set(projectile.id, projectile);
        broadcast({ type: 'combat-throw', projectile: { id: projectile.id, ownerId: id, kind: action, position: projectile.position, velocity: projectile.velocity, time: releasedAt } });
      },65).unref();
      return json(response, 200, { ok: true });
    } catch (error) { return json(response, error.statusCode || 400, { error: error.message || 'Não consegui completar a ação.' }); }
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
      if (!client || !sender || client.accountId !== authenticatedAccount.id) return json(response, 401, { error: 'Jogador não conectado nesta conta.' });
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

let lastVehicleTick=Date.now(),lastVehicleBroadcast=0;
setInterval(()=>{
  const now=Date.now(),dt=Math.min(.1,(now-lastVehicleTick)/1000);lastVehicleTick=now;let occupied=false,changed=false;
  for(const vehicle of vehicles.values()) {
    if(!vehicle.driverId)continue;
    const player=players.get(vehicle.driverId),client=clients.get(vehicle.driverId);
    if(!player||!client){vehicle.driverId=null;vehicle.speed=0;vehicleInputs.delete(vehicle.id);changed=true;continue;}
    if(client.deadUntil){releaseVehicle(player);send(client.response,{type:'vehicle-exit',position:player.position});changed=true;continue;}
    occupied=true;
    if(vehicle.hijacking){const pending=pendingHijacks.get(vehicle.id);if(!pending||!players.has(pending.thiefId)){cancelVehicleHijack(vehicle);changed=true;}else{const victim=players.get(pending.victimId),progress=Math.max(0,Math.min(1,(now-pending.startedAt)/650));if(victim){victim.position={x:pending.from.x+(pending.outside.x-pending.from.x)*progress,y:pending.from.y+(pending.outside.y-pending.from.y)*progress+Math.sin(progress*Math.PI)*.24,z:pending.from.z+(pending.outside.z-pending.from.z)*progress};victim.motionTime=now;broadcast({type:'vehicle-hijack-motion',targetId:victim.id,vehicleId:vehicle.id,position:victim.position,rotation:vehicle.rotation,progress});}}}
    const input=vehicleInputs.get(vehicle.id),controls=vehicle.wrecked||vehicle.hijacking?{throttle:0,steer:0,brake:true}:input&&now-input.at<350?input:{throttle:0,steer:0,brake:true};
    const obstacles=[...LowkeyWorld.drivingObstacles];
    for(const other of vehicles.values())if(other.id!==vehicle.id&&Math.hypot(other.x-vehicle.x,other.z-vehicle.z)>(vehicle.kind==='car'?1.65:1.0)+(other.kind==='car'?1.65:1.0))obstacles.push({x:other.x,z:other.z,r:other.kind==='car'?1.65:1});
    const previousSpeed=vehicle.speed,steps=Math.max(1,Math.ceil(dt/.025));for(let i=0;i<steps;i++)LowkeyWorld.advanceVehicle(vehicle,controls,dt/steps,obstacles);
    if(Math.abs(previousSpeed)>8&&vehicle.speed===0&&!controls.brake){const other=[...vehicles.values()].find(candidate=>candidate.id!==vehicle.id&&Math.hypot(candidate.x-vehicle.x,candidate.z-vehicle.z)<(vehicle.kind==='car'?1.65:1)+(candidate.kind==='car'?1.65:1)+.35);if(other){const dx=vehicle.x-other.x,dz=vehicle.z-other.z,length=Math.hypot(dx,dz)||1,force=Math.min(11,5+Math.abs(previousSpeed)*.3),impulse={x:dx/length*force,y:8,z:dz/length*force};for(const crashed of [vehicle,other]){crashed.speed=0;if(crashed.kind==='car'){crashed.wrecked=true;crashed.health=0;}vehicleInputs.set(crashed.id,{throttle:0,steer:0,brake:true,at:now,sequence:vehicleInputs.get(crashed.id)?.sequence??-1});for(const id of [crashed.driverId,...(crashed.passengerIds||[])]){const occupant=players.get(id),occupantClient=clients.get(id);if(!occupant||!occupantClient)continue;const eject={x:Math.cos(crashed.rotation)*(occupant===player?1:-1)*4.5,y:7,z:-Math.sin(crashed.rotation)*(occupant===player?1:-1)*4.5};releaseVehicle(occupant);occupantClient.movementCredits=5;occupantClient.motionAt=now;send(occupantClient.response,{type:'vehicle-exit',position:occupant.position,impulse:eject,crashed:true});broadcast({type:'state',player:occupant});}changed=true;}if(vehicle.driverId!==player.id)continue;}}
    if(vehicle.kind==='car'&&!vehicle.wrecked&&!vehicle.hijacking&&Math.abs(previousSpeed)>10&&vehicle.speed===0&&!controls.brake){vehicle.wrecked=true;vehicle.health=0;vehicle.speed=0;vehicleInputs.set(vehicle.id,{throttle:0,steer:0,brake:true,at:now,sequence:input?.sequence??-1});for(const id of [vehicle.driverId,...(vehicle.passengerIds||[])]){const occupant=players.get(id),occupantClient=clients.get(id);if(!occupant||!occupantClient)continue;releaseVehicle(occupant);occupantClient.movementCredits=5;occupantClient.motionAt=now;send(occupantClient.response,{type:'vehicle-exit',position:occupant.position,impulse:{x:Math.cos(vehicle.rotation)*4,y:5,z:-Math.sin(vehicle.rotation)*4},crashed:true});broadcast({type:'state',player:occupant});}changed=true;if(vehicle.driverId!==player.id)continue;}
    for(const target of players.values()){
      if(target.vehicleId||target.health<=0||target.id===vehicle.driverId||Math.abs(target.position.y-vehicle.y)>1.25||now-(target.lastVehicleImpactAt||0)<1100)continue;
      const relative={x:target.position.x-vehicle.x,z:target.position.z-vehicle.z},c=Math.cos(vehicle.rotation),s=Math.sin(vehicle.rotation),localX=relative.x*c-relative.z*s,localZ=relative.x*s+relative.z*c;
      const hit=vehicle.kind==='car'?Math.abs(localX)<1.12&&Math.abs(localZ)<1.86:Math.hypot(localX,localZ)<.60;
      if(!hit||Math.abs(vehicle.speed)<4.5)continue;
      const direction=Math.sign(vehicle.speed)||1,damage=vehicle.kind==='car'?38:23,impulse={x:Math.sin(vehicle.rotation)*direction*Math.min(11,4.5+Math.abs(vehicle.speed)*.32),y:Math.min(10,5+Math.abs(vehicle.speed)*.20),z:Math.cos(vehicle.rotation)*direction*Math.min(11,4.5+Math.abs(vehicle.speed)*.32)};
      target.lastVehicleImpactAt=now;target.health=Math.max(0,target.health-damage);const targetClient=clients.get(target.id),deadUntil=target.health===0?now+2200:0;
      if(targetClient){targetClient.movementCredits=5;targetClient.motionAt=now;if(deadUntil)targetClient.deadUntil=deadUntil;send(targetClient.response,{type:'vehicle-impact',vehicleId:vehicle.id,kind:vehicle.kind,targetId:target.id,damage,impulse,time:now});send(targetClient.response,{type:'weapon-health',targetId:target.id,health:target.health,deadUntil});}
      broadcast({type:'vehicle-impact',vehicleId:vehicle.id,kind:vehicle.kind,targetId:target.id,damage,impulse,time:now});if(deadUntil)broadcast({type:'glock-elimination',shooterId:player.id,targetId:target.id,headshot:false,time:now});changed=true;
    }
    const driverPose=LowkeyWorld.driverPose(vehicle);player.position={x:driverPose.x,y:driverPose.y,z:driverPose.z};player.rotation=driverPose.rotation;player.speed=Math.abs(vehicle.speed);player.walking=false;player.jumping=false;player.motionTime=now;player.vehicleSeat='driver';lastKnownPositions.set(player.accountId,player.position);
    for(const passengerId of vehicle.passengerIds||[]){const passenger=players.get(passengerId);if(!passenger)continue;const pose=LowkeyWorld.passengerPose(vehicle);passenger.position={x:pose.x,y:pose.y,z:pose.z};passenger.rotation=pose.rotation;passenger.speed=Math.abs(vehicle.speed);passenger.walking=false;passenger.jumping=false;passenger.motionTime=now;passenger.vehicleSeat='passenger';lastKnownPositions.set(passenger.accountId,passenger.position);}
  }
  if(changed||(occupied&&now-lastVehicleBroadcast>=100)){lastVehicleBroadcast=now;broadcast({type:'world-state',...worldSnapshot()});}
},50).unref();
setInterval(()=>broadcast({type:'world-time',serverTime:Date.now(),segmentMs:LowkeyWorld.SEGMENT_MS}),30000).unref();

setInterval(() => {
  for (const client of clients.values()) client.response.write(': keepalive\n\n');
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, cached] of sessionAccounts) if (cached.validUntil <= Date.now()) sessionAccounts.delete(key);
  for (const [key, attempts] of authRequests) if (!attempts.some(at => at > cutoff)) authRequests.delete(key);
  for (const [key, attempts] of failedLogins) if (!attempts.some(at => at > cutoff)) failedLogins.delete(key);
  for (const [key, attempts] of movementViolations) if (!attempts.some(at => at > cutoff)) movementViolations.delete(key);
  for (const [key, until] of securityCooldowns) if (until <= Date.now()) securityCooldowns.delete(key);
}, 25000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [projectileId, projectile] of projectiles) {
    const dt = Math.min(.08, Math.max(.005, (now - projectile.lastAt) / 1000));
    projectile.lastAt = now;
    const from = projectile.position, to = { x: from.x + projectile.velocity.x * dt, y: from.y + projectile.velocity.y * dt, z: from.z + projectile.velocity.z * dt };
    projectile.velocity.y -= 9.8 * dt;
    let hit = null, bestDistance = Infinity;
    for (const target of players.values()) {
      if (target.id === projectile.ownerId || target.position.y < -.2) continue;
      const t=playerSegmentHit(from,to,target.position,.43);
      if(t!==null&&t<bestDistance){hit=target;bestDistance=t;}
    }
    projectile.position = to;
    if (hit) {
      const speed = 1.35, horizontalSpeed = Math.hypot(projectile.velocity.x, projectile.velocity.z) || 1;
      broadcast({ type: 'combat-impact', id: projectile.id, ownerId: projectile.ownerId, kind: projectile.kind, x: to.x, y: to.y, z: to.z, targetId: hit.id, impulse: { x: projectile.velocity.x / horizontalSpeed * speed, z: projectile.velocity.z / horizontalSpeed * speed }, time: now });
      projectiles.delete(projectileId);
    } else if (to.y <= .12 || now - projectile.createdAt > 6000 || Math.abs(to.x) > 140 || Math.abs(to.z) > 140) {
      broadcast({ type: 'combat-impact', id: projectile.id, ownerId: projectile.ownerId, kind: projectile.kind, x: to.x, y: Math.max(0, to.y), z: to.z, targetId: null, time: now });
      projectiles.delete(projectileId);
    }
  }
}, 40).unref();

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

