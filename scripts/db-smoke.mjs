import { localPostgres } from '../tests/local-postgres.mjs';
import { PrismaClient } from '@prisma/client';
const database = await localPostgres({ seed: true });
const client = new PrismaClient({ datasources: { db: { url: database.url } } });
try { console.log('Local PostgreSQL lead count:', await client.lead.count()); console.log('Preserved note:', (await client.lead.findUnique({ where: { id: 'legacy-test' } })).notes); }
finally { await client.$disconnect(); await database.close(); }
