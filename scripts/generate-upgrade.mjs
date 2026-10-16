import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('.local', { recursive: true });
const old = execFileSync('git', ['show', 'HEAD:prisma/schema.prisma'], { encoding: 'utf8' });
if (old.includes('model Campaign')) throw new Error('The growth schema is already committed. Do not regenerate the historical baseline.');
writeFileSync('.local/legacy.prisma', old);
for (const [folder, args] of [
  ['202610160001_baseline', ['--from-empty', '--to-schema-datamodel', '.local/legacy.prisma']],
  ['202610160002_growth_workspace', ['--from-schema-datamodel', '.local/legacy.prisma', '--to-schema-datamodel', 'prisma/schema.prisma']],
]) {
  mkdirSync(`prisma/migrations/${folder}`, { recursive: true });
  writeFileSync(`prisma/migrations/${folder}/migration.sql`, execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', ...args, '--script'], { encoding: 'utf8' }));
}
console.log('Generated baseline and additive upgrade SQL. No database was accessed.');
