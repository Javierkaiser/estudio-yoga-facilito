import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const allowed = new Set(['packages/core/src/ledger.ts']);
const tablePattern = /\b(student_packages|credit_movements)\b/;

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('arquitectura del ledger', () => {
  it('solo el servicio de créditos lee y escribe las tablas de créditos', () => {
    const files = [
      ...walk(join(root, 'packages/core/src')),
      ...walk(join(root, 'apps')),
    ];

    const offenders = files
      .filter((file) => tablePattern.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .filter((file) => !allowed.has(file));

    expect(offenders).toEqual([]);
  });
});
