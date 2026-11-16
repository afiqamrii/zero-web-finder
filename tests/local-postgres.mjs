import net from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// Test-only PostgreSQL wire bridge. One client connection at a time, bound only
// to loopback. The application and tests use connection_limit=1. Never deploy.
export async function localPostgres({ port = 0, seed = false } = {}) {
  const db = new PGlite();
  await db.waitReady;
  const migrations = (await readdir('prisma/migrations', { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const migration of migrations) {
    await db.exec(await readFile(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
    // Insert the old record before upgrades so every subsequent migration must preserve it.
    if (seed && migration === '202610160001_baseline') await db.exec(`INSERT INTO "Lead" (id,"placeId",name,address,"mapsUrl",category,notes,"updatedAt") VALUES ('legacy-test','legacy-place','Preserved test business','Kuala Lumpur','','Café','Keep this original note',now());`);
  }
  const packet = (type, payload) => { const p = Buffer.from(payload); const b = Buffer.alloc(5 + p.length); b[0] = type.charCodeAt(0); b.writeInt32BE(p.length + 4, 1); p.copy(b, 5); return b; };
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    let startup = true, buffer = Buffer.alloc(0), queue = Promise.resolve();
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (startup) {
          if (buffer.length < 4) break;
          const length = buffer.readInt32BE(0); if (buffer.length < length) break;
          const frame = buffer.subarray(0, length); buffer = buffer.subarray(length);
          if (frame.readInt32BE(4) === 80877103) { socket.write('N'); continue; }
          socket.write(packet('R', Buffer.alloc(4)));
          for (const [k, v] of [['server_version', '17.5'], ['client_encoding', 'UTF8'], ['server_encoding', 'UTF8'], ['DateStyle', 'ISO, MDY'], ['integer_datetimes', 'on'], ['standard_conforming_strings', 'on']]) socket.write(packet('S', `${k}\0${v}\0`));
          socket.write(packet('K', Buffer.alloc(8))); socket.write(packet('Z', 'I')); startup = false;
        } else {
          if (buffer.length < 5) break;
          const length = buffer.readInt32BE(1) + 1; if (buffer.length < length) break;
          const frame = Buffer.from(buffer.subarray(0, length)); buffer = buffer.subarray(length);
          if (frame[0] === 88) { socket.end(); break; }
          queue = queue.then(async () => { const result = await db.execProtocolRaw(frame); if (result.length) socket.write(Buffer.from(result)); }).catch(error => { console.error('Local test database protocol error:', error.message); socket.destroy(); });
        }
      }
    });
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  return { db, url: `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?connection_limit=1&sslmode=disable`, close: async () => { for (const s of sockets) s.destroy(); await new Promise(resolve => server.close(resolve)); await db.close(); } };
}
