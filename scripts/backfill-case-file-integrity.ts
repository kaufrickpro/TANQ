import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import crypto from 'crypto';
import { get, head } from '@vercel/blob';
import { sql } from '@vercel/postgres';

async function run() {
  const result = await sql`
    SELECT id, blob_url
    FROM document_versions
    WHERE legacy_import = TRUE
      AND sha256 IS NULL
    ORDER BY id ASC
  `;
  if (result.rows.length === 0) {
    console.log('No legacy document versions require integrity backfill.');
    await sql.end();
    return;
  }

  try {
    for (const version of result.rows) {
      const blob = await get(version.blob_url, { access: 'private', useCache: false });
      if (!blob || blob.statusCode !== 200) {
        console.error(`Missing legacy blob for document version ${version.id}`);
        continue;
      }
      const hash = crypto.createHash('sha256');
      for await (const chunk of blob.stream as any) hash.update(chunk);
      const metadata = await head(version.blob_url);
      await sql`
        UPDATE document_versions
        SET sha256 = ${hash.digest('hex')},
            size_bytes = ${metadata.size},
            etag = ${metadata.etag},
            content_type = ${metadata.contentType},
            blob_pathname = ${metadata.pathname}
        WHERE id = ${version.id}
          AND legacy_import = TRUE
          AND sha256 IS NULL
      `;
      console.log(`Backfilled document version ${version.id}`);
    }
  } finally {
    await sql.end();
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
