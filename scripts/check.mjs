import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for(const dir of ['api','src','agent','scripts','public','test'])for(const file of await readdir(dir))if(/\.(mjs|js)$/.test(file))execFileSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
console.log('JavaScript syntax checked.');
