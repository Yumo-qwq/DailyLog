import { readFileSync } from 'node:fs';

let env = '';
try {
  env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
} catch {
  // CI may supply the same Vite variables through its process environment.
}

function configured(name) {
  return Boolean(process.env[name] || env.match(new RegExp(`^${name}\\s*=\\s*[^#\\s]+`, 'm')));
}

if (!configured('VITE_SUPABASE_URL') || !configured('VITE_SUPABASE_PUBLISHABLE_KEY')) {
  throw new Error('Android 构建需要 .env.local 中的 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。');
}
