## Admin login (telefon Face ID / Fingerprint) demo

Bu demo WebAuthn (Passkey) bilan ishlaydi:

- **Kompyuter**: `login.html`da username kiritasiz
- **Server**: challenge beradi
- **Telefon**: Face ID / Fingerprint bilan tasdiqlaysiz (brauzerning o‘zi)
- **Server**: imzoni tekshiradi → **JWT cookie** beradi
- **Dashboard**: himoyalangan sahifa ochiladi

### Talab (secure context)

WebAuthn **faqat secure context**da ishlaydi:

- **`http://localhost`** (localhost istisno sifatida secure hisoblanadi) yoki
- **HTTPS**

### Ishga tushirish (localhost)

1) O‘rnatish:

```bash
npm i
```

2) Start:

```bash
npm start
```

3) Ochish:

- `http://localhost:4000/register.html` (passkey yaratish)
- `http://localhost:4000/login.html` (login)
- `http://localhost:4000/dashboard` (JWT bo‘lsa ochiladi)

### HTTPS (ixtiyoriy)

Agar o‘zingizda sertifikat bo‘lsa:

```bash
set SSL_KEY_PATH=C:\path\to\key.pem
set SSL_CERT_PATH=C:\path\to\cert.pem
set BASE_URL=https://localhost:4000
npm start
```

Eslatma:
- `BASE_URL` qiymati brauzerdagi origin bilan **bir xil** bo‘lishi kerak.
- Demo maqsadida userlar/passkey’lar **RAM**da saqlanadi (restart bo‘lsa o‘chadi).

