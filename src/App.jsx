import React, { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data?.details ? `\n${data.details}` : '';
    throw new Error((data?.error || `HTTP ${res.status}`) + details);
  }
  return data;
}

function Card({ title, children }) {
  return (
    <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}

function Tabs({ current, onChange }) {
  const base =
    'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer text-center';
  const active = 'bg-sky-500 text-slate-950';
  const inactive = 'bg-white/5 text-slate-200 hover:bg-white/10';
  return (
    <div className="mb-4 flex gap-2">
      <button
        type="button"
        className={`${base} ${current === 'login' ? active : inactive}`}
        onClick={() => onChange('login')}
      >
        Login
      </button>
      <button
        type="button"
        className={`${base} ${current === 'register' ? active : inactive}`}
        onClick={() => onChange('register')}
      >
        Passkey ro‘yxat
      </button>
      <button
        type="button"
        className={`${base} ${current === 'dashboard' ? active : inactive}`}
        onClick={() => onChange('dashboard')}
      >
        Dashboard
      </button>
    </div>
  );
}

function Input({ label, value, onChange, ...rest }) {
  return (
    <label className="mt-3 block text-sm text-slate-200">
      <span className="mb-1 block">{label}</span>
      <input
        className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none ring-0 transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/40"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </label>
  );
}

function Status({ children }) {
  return (
    <div className="mt-4 whitespace-pre-wrap rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-slate-100/90">
      {children}
    </div>
  );
}

async function fetchMe() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    throw new Error('JWT topilmadi yoki yaroqsiz');
  }
  return res.json();
}

export default function App() {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('admin');
  const [status, setStatus] = useState('Tayyor.');
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState(null);

  const setTabSafe = (t) => {
    setStatus('Tayyor.');
    setTab(t);
  };

  async function handleRegister() {
    if (!username.trim()) {
      setStatus('Username kiriting.');
      return;
    }
    setLoading(true);
    try {
      setStatus('1) Serverdan ro‘yxat challenge olinmoqda...');
      const options = await postJSON('/api/register/options', { username: username.trim() });

      setStatus('2) Face ID / Fingerprint orqali passkey yarating (brauzer oynasini kuzating)...');
      const attResp = await startRegistration(options);

      setStatus('3) Serverda attestatsiya tekshirilmoqda...');
      await postJSON('/api/register/verify', { username: username.trim(), response: attResp });

      setStatus('Tayyor. JWT berildi. Endi dashboardni ochishingiz mumkin.');
      setTabSafe('dashboard');
    } catch (e) {
      setStatus(`Xato: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim()) {
      setStatus('Username kiriting.');
      return;
    }
    setLoading(true);
    try {
      setStatus('3) Server challenge olinmoqda...');
      const options = await postJSON('/api/auth/options', { username: username.trim() });

      setStatus(
        '4) Telefoningizda Face ID / Fingerprint tasdiqlang (brauzer oynasini kuzating)...',
      );
      const assertion = await startAuthentication(options);

      setStatus('5) Imzo tekshirilmoqda va JWT olinmoqda...');
      await postJSON('/api/auth/verify', { username: username.trim(), response: assertion });

      setStatus('6) Dashboard ochilmoqda...');
      setTabSafe('dashboard');
      await handleLoadMe();
    } catch (e) {
      setStatus(`Xato: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMe() {
    setLoading(true);
    try {
      const data = await fetchMe();
      setMe(data);
      setStatus('JWT cookie mavjud, /api/me muvaffaqiyatli.');
    } catch (e) {
      setMe(null);
      setStatus(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
      setMe(null);
      setStatus('Chiqildi. JWT tozalandi.');
      setTabSafe('login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full px-4">
      <Card title="Admin login (Passkey, React + Tailwind)">
        <p className="mb-2 text-xs text-slate-300">
          Oqim: <span className="font-semibold">1)</span> username →{' '}
          <span className="font-semibold">2)</span> server challenge →{' '}
          <span className="font-semibold">3)</span> telefon Face ID / Fingerprint →{' '}
          <span className="font-semibold">4)</span> imzo tekshiriladi →{' '}
          <span className="font-semibold">5)</span> JWT →{' '}
          <span className="font-semibold">6)</span> dashboard.
        </p>
        <p className="mb-4 text-xs text-sky-300">
          Muhim: bu hammasi <span className="font-semibold">http://localhost</span> (yoki HTTPS)
          contextida WebAuthn bilan ishlayapti.
        </p>

        <Tabs current={tab} onChange={setTabSafe} />

        <Input
          label="Username"
          value={username}
          onChange={setUsername}
          placeholder="masalan: admin"
          autoComplete="username webauthn"
        />

        {tab === 'register' && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-sky-400 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-sky-500/30 disabled:opacity-60"
            >
              Passkey yaratish
            </button>
            <span className="text-xs text-slate-300">
              Buni odatda telefoningizda bir marta qilasiz. Keyin login paytida foydalaniladi.
            </span>
          </div>
        )}

        {tab === 'login' && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-sky-400 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-sky-500/30 disabled:opacity-60"
            >
              Face ID / Fingerprint bilan kirish
            </button>
            <button
              type="button"
              onClick={() => setTabSafe('register')}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-100"
            >
              Avval passkey ro‘yxatdan o‘tkazish
            </button>
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleLoadMe}
                disabled={loading}
                className="rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-60"
              >
                /api/me orqali JWT ni tekshirish
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-60"
              >
                Logout
              </button>
            </div>
            <Status>
              {me ? (
                <>
                  ✅ Auth OK{'\n'}username: {me.username}
                  {'\n'}sub: {me.sub}
                </>
              ) : (
                'JWT ma’lumoti hali yuklanmadi.'
              )}
            </Status>
          </div>
        )}

        <Status>{status}</Status>
      </Card>
    </div>
  );
}

