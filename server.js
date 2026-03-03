const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------
// Config
// ---------------------------
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
const baseUrlObj = new URL(BASE_URL);
const EXPECTED_ORIGIN = `${baseUrlObj.protocol}//${baseUrlObj.host}`;
const RP_ID = process.env.RP_ID || baseUrlObj.hostname; // usually "localhost"
const RP_NAME = process.env.RP_NAME || 'Admin Demo';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const COOKIE_NAME = 'token';
const COOKIE_SECURE = baseUrlObj.protocol === 'https:';

// ---------------------------
// In-memory user store (demo)
// username -> { id, username, credentials: [authenticator], currentChallenge? }
// ---------------------------
const users = new Map();

function getOrCreateUser(username) {
  if (!users.has(username)) {
    users.set(username, {
      id: uuidv4(),
      username,
      credentials: [],
      currentChallenge: undefined,
    });
  }
  return users.get(username);
}

function issueJwt(res, user) {
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE,
    path: '/',
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.redirect('/login.html');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.redirect('/login.html');
  }
}

// ---------------------------
// API: Registration (passkey create)
// ---------------------------
app.post('/api/register/options', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });

  const user = getOrCreateUser(username);

  const options = generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: user.id,
    userName: user.username,
    attestationType: 'none',
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred',
    },
    excludeCredentials: user.credentials.map((c) => ({
      id: c.credentialID,
      type: 'public-key',
      transports: c.transports,
    })),
  });

  user.currentChallenge = options.challenge;
  res.json(options);
});

app.post('/api/register/verify', async (req, res) => {
  const { username, response } = req.body || {};
  if (!username || !response) return res.status(400).json({ error: 'bad request' });

  const user = users.get(username);
  if (!user?.currentChallenge) return res.status(400).json({ error: 'no challenge in progress' });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'verification failed', details: String(e?.message || e) });
  } finally {
    user.currentChallenge = undefined;
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo) return res.status(400).json({ error: 'not verified' });

  const { credentialPublicKey, credentialID, counter } = registrationInfo;
  const transports = response?.response?.transports || undefined;

  // Prevent duplicates
  const exists = user.credentials.some((c) => c.credentialID.equals(credentialID));
  if (!exists) {
    user.credentials.push({
      credentialID,
      credentialPublicKey,
      counter,
      transports,
    });
  }

  issueJwt(res, user);
  res.json({ ok: true });
});

// ---------------------------
// API: Authentication (challenge + signature verify)
// ---------------------------
app.post('/api/auth/options', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });

  const user = users.get(username);
  if (!user || user.credentials.length === 0) {
    return res.status(404).json({ error: 'user has no passkey, register first' });
  }

  const options = generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: 'required',
    allowCredentials: user.credentials.map((c) => ({
      id: c.credentialID,
      type: 'public-key',
      transports: c.transports,
    })),
  });

  user.currentChallenge = options.challenge;
  res.json(options);
});

app.post('/api/auth/verify', async (req, res) => {
  const { username, response } = req.body || {};
  if (!username || !response) return res.status(400).json({ error: 'bad request' });

  const user = users.get(username);
  if (!user?.currentChallenge) return res.status(400).json({ error: 'no challenge in progress' });

  const credID = response?.id;
  if (!credID) return res.status(400).json({ error: 'missing credential id' });

  // Find matching authenticator
  const credIDBuf = isoBase64URL.toBuffer(credID);
  const authenticator = user.credentials.find((c) => c.credentialID.equals(credIDBuf));
  if (!authenticator) return res.status(400).json({ error: 'unknown credential' });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      authenticator,
      requireUserVerification: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'verification failed', details: String(e?.message || e) });
  } finally {
    user.currentChallenge = undefined;
  }

  const { verified, authenticationInfo } = verification;
  if (!verified || !authenticationInfo) return res.status(400).json({ error: 'not verified' });

  authenticator.counter = authenticationInfo.newCounter;

  issueJwt(res, user);
  res.json({ ok: true });
});

// ---------------------------
// API: session helpers
// ---------------------------
app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ username: payload.username, sub: payload.sub });
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
});

// ---------------------------
// SPA fallback (React build)
// ---------------------------
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (req.method !== 'GET') return next();
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------
// Start server (HTTP by default; HTTPS if certs provided)
// ---------------------------
const PORT = Number(process.env.PORT || 4000);
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

const server =
  SSL_KEY_PATH && SSL_CERT_PATH
    ? https.createServer(
        {
          key: fs.readFileSync(SSL_KEY_PATH),
          cert: fs.readFileSync(SSL_CERT_PATH),
        },
        app,
      )
    : http.createServer(app);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[ready] ${SSL_KEY_PATH && SSL_CERT_PATH ? 'https' : 'http'}://localhost:${PORT}\n` +
      `BASE_URL=${EXPECTED_ORIGIN} RP_ID=${RP_ID}`,
  );
});

