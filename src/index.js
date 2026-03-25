const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const POSTE_IO_API = process.env.POSTE_IO_API || 'https://mail.dvadvoga.com.br/admin/api/v1';
const ADMIN_EMAIL = process.env.POSTE_IO_ADMIN_EMAIL;
const ADMIN_PWD = process.env.POSTE_IO_ADMIN_PWD;
const DB_PATH = process.env.DB_PATH || '/app/data/database.sqlite';

if (!fs.existsSync(path.dirname(DB_PATH))) { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); }
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, totp_secret TEXT)`);

fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/resetarsenha/', });
fastify.register(require('@fastify/formbody'));

fastify.get('/resetarsenha/:token', (request, reply) => { 
  return reply.sendFile('index.html'); 
});

fastify.get('/api/check-2fa/:token', async (request, reply) => {
  const { token } = request.params;
  const row = db.prepare('SELECT email FROM tokens WHERE token = ?').get(token);
  if (!row) return reply.status(404).send({ error: 'Token inválido' });
  
  const user = db.prepare('SELECT totp_secret FROM users WHERE email = ?').get(row.email);
  if (user && user.totp_secret) {
    return { has2fa: true };
  } else {
    const secret = authenticator.generateSecret();
    db.prepare('INSERT OR REPLACE INTO users (email, totp_secret) VALUES (?, ?)').run(row.email, secret);
    const otpauth = authenticator.keyuri(row.email, 'DV Advoga', secret);
    const qrImage = await qrcode.toDataURL(otpauth);
    return { has2fa: false, qrImage };
  }
});

fastify.post('/api/reset', async (request, reply) => {
  const { token, password, totp_token } = request.body;
  const row = db.prepare('SELECT email, expires_at FROM tokens WHERE token = ?').get(token);
  
  if (!row || Date.now() > row.expires_at) {
    return reply.status(404).send({ error: 'Token inválido ou expirado.' });
  }

  const user = db.prepare('SELECT totp_secret FROM users WHERE email = ?').get(row.email);
  if (user && user.totp_secret) {
    const isValid = authenticator.check(totp_token, user.totp_secret);
    if (!isValid) {
      return reply.status(400).send({ error: 'Código de segurança inválido.' });
    }
  }

  try {
    const auth = Buffer.from(`${ADMIN_EMAIL}:${ADMIN_PWD}`).toString('base64');
    await axios.post(`${POSTE_IO_API}/boxes`, 
      { name: row.email, password: password },
      { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' } }
    );
    
    db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
    return { success: true, message: 'Senha alterada com sucesso!' };
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'Erro ao comunicar com o servidor de e-mail.' });
  }
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { fastify.log.error(err); process.exit(1); }
  console.log(`Servidor rodando na porta ${PORT}`);
});
