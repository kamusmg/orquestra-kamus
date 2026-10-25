import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loader leve de arquivo .env para o startup do Host.
 * Lê o arquivo .env no cwd ou pastas superiores sem logar chaves ou valores,
 * populando process.env (ex: ORQ_CEREBRO_PATH).
 */
export function loadHostEnv(startDir?: string): void {
  let moduleDir: string | undefined;
  try {
    moduleDir = fileURLToPath(new URL('.', import.meta.url));
  } catch {
    // Silencioso
  }

  const candidates = [
    startDir,
    process.cwd(),
    resolve(process.cwd(), '..'),
    resolve(process.cwd(), '..', '..'),
    resolve(process.cwd(), '..', '..', '..'),
    moduleDir,
    moduleDir ? resolve(moduleDir, '..') : undefined,
    moduleDir ? resolve(moduleDir, '..', '..') : undefined,
    moduleDir ? resolve(moduleDir, '..', '..', '..') : undefined,
  ].filter((dir): dir is string => Boolean(dir && existsSync(dir)));

  for (const dir of candidates) {
    const envFile = join(dir, '.env');
    if (existsSync(envFile)) {
      try {
        const content = readFileSync(envFile, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // Silencioso por design
      }
    }
  }
}
