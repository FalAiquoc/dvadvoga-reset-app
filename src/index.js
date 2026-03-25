const fastify = require('fastify')({ logger: true });
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
require('dotenv').config();
const PORT = process.env.PORT || 3000;
const POSTE_IO_API = process.env.POSTE_IO_API || 'https://mail.dvadvoga.com.br/admin/api/v1';
const ADMIN_EMAIL = process.env.POSTE_IO_ADMIN_EMAIL;
const ADMIN_PWD = process.env.POSTE_IO_ADMIN_PWD;
const DB_PATH = process.env.DB_PATH || '/app/data/database.sqlite';
if (!fs.existsSync(path.dirname(DB_PATH))) { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); }
const db = new Database(DB_PATH);
db.exec(`CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)`);
fastify.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), prefix: '/resetarsenha/', });
fastify.register(require('@fastify/formbody'));
fastify.get('/resetarsenha/:token', (request, reply) => { return reply.sendFile('index.html'); });
fastify.post('/api/reset', async (request, reply) => {
    const { token, password } = request.body;
    const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(token);
    if (!row || Date.now() > row.expires_at) return reply.status(404).send({ error: 'Token inválido ou expirado.' });
    try {
        const auth = Buffer.from(`${ADMIN_EMAIL}:${ADMIN_PWD}`).toString('base64');
        await axios.patch(`${POSTE_IO_API}/boxes/${row.email}`, { password }, { headers: { 'Authorization': `Basic ${auth}` } });
        db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
        return { success: true };
    } catch (e) { return reply.status(500).send({ error: 'Erro no servidor de e-mail.' }); }
});
fastify.listen({ port: PORT, host: '0.0.0.0' });
