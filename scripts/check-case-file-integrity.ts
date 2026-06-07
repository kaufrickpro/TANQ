import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import crypto from 'crypto';
import { get } from '@vercel/blob';
import { sql } from '@vercel/postgres';

async function run() {
  const result = await sql`
    SELECT id, blob_url, sha256
    FROM document_versions
    ORDER BY id ASC
  `;
  let failures = 0;
  for (const version of result.rows) {
    try {
      const blob = await get(version.blob_url, { access: 'private', useCache: false });
      if (!blob || blob.statusCode !== 200) {
        await sql`INSERT INTO integrity_checks (document_version_id, status, details) VALUES (${version.id}, 'missing', 'Blob not found')`;
        failures++;
        continue;
      }
      const hash = crypto.createHash('sha256');
      for await (const chunk of blob.stream as any) hash.update(chunk);
      const observed = hash.digest('hex');
      const status = !version.sha256 ? 'error' : observed === version.sha256 ? 'ok' : 'mismatch';
      await sql`
        INSERT INTO integrity_checks (document_version_id, status, observed_sha256, details)
        VALUES (
          ${version.id}, ${status}, ${observed},
          ${status === 'ok' ? null : status === 'error' ? 'Expected SHA-256 is missing' : 'SHA-256 mismatch'}
        )
      `;
      if (status !== 'ok') failures++;
    } catch (error: any) {
      await sql`
        INSERT INTO integrity_checks (document_version_id, status, details)
        VALUES (${version.id}, 'error', ${error.message || 'Integrity check failed'})
      `;
      failures++;
    }
  }
  console.log(`Checked ${result.rows.length} versions; failures: ${failures}`);
  await sql.end();
  if (failures > 0) process.exit(1);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
