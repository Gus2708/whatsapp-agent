import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const getEnv = (key: string): string => {
  if (process.env[key]) {
    return process.env[key]!.trim();
  }
  if (process.env[`NEXT_PUBLIC_${key}`]) {
    return process.env[`NEXT_PUBLIC_${key}`]!.trim();
  }

  // Fallback buscando en archivos de entorno locales
  try {
    const candidates = [
      path.resolve(process.cwd(), '.env.local'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const match = content.match(new RegExp('^' + key + '=(.*)$', 'm'));
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  } catch {
    // Suppress filesystem reading error
  }

  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});
