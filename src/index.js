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


// Important: Prefix '/' to work with Dokploy reverse proxy path stripping
fastify.register(require('@fastify/static'), { 
  root: path.join(__dirname, 'public'), 
  prefix: '/', 
});
fastify.register(require('@fastify/formbody'));


// Route for the reset page
fastify.get('/:token', (request, reply) => { 
  return reply.sendFile('index.html'); 
});


fastify.get('/api/check-2fa/:token', async (request, reply) => {
  const { token } = request.params;
  const row = db.prepare('SELECT email FROM tokens WHERE token = ?').get(token);
