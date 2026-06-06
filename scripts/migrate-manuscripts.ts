import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { put, head, del } from '@vercel/blob';
import crypto from 'crypto';

async function migrateManuscripts() {
  console.log('🔄 Running public to private manuscript migration script...\n');
  const { sql } = await import('@vercel/postgres');

  // 1. Inventory submissions
  const result = await sql`SELECT id, file_path FROM submissions`;
  const submissions = result.rows;

  const toMigrate = submissions.filter((sub) => {
    // If it doesn't have the private randomized folder path "manuscripts/", it is public
    return sub.file_path && !sub.file_path.includes('/manuscripts/');
  });

  if (toMigrate.length === 0) {
    console.log('✅ All manuscripts are already private. No migration needed.');
    process.exit(0);
  }

  console.log(`Found ${toMigrate.length} public manuscripts to migrate.\n`);

  const successes: Array<{ id: number; oldUrl: string; newUrl: string }> = [];
  const failures: Array<{ id: number; url: string; reason: string }> = [];

  for (const sub of toMigrate) {
    const publicUrl = sub.file_path;
    console.log(`Migrating submission #${sub.id}: ${publicUrl}`);

    try {
      // 2. Fetch/Download the public file
      const downloadRes = await fetch(publicUrl);
      if (!downloadRes.ok) {
        throw new Error(`HTTP error downloading public original: ${downloadRes.status} ${downloadRes.statusText}`);
      }

      const fileBuffer = Buffer.from(await downloadRes.arrayBuffer());
      const originalFileName = publicUrl.split('/').pop() || 'manuscript.pdf';
      const safeName = originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const randomPath = `manuscripts/${crypto.randomUUID()}/${safeName}`;

      // 3. Upload to private Vercel Blob
      console.log(`  Uploading to private storage as: ${randomPath}`);
      const privateBlob = await put(randomPath, fileBuffer, { access: 'private' });
      const privateUrl = privateBlob.url;

      // 4. Verify the private copy (Check size)
      console.log(`  Verifying private copy size...`);
      const privateMeta = await head(privateUrl);
      if (privateMeta.size !== fileBuffer.length) {
        throw new Error(`Verification failed: uploaded size ${privateMeta.size} does not match expected size ${fileBuffer.length} bytes`);
      }
      console.log(`  Verification successful (${privateMeta.size} bytes).`);

      // 5. Update the database
      console.log(`  Updating database record...`);
      await sql`
        UPDATE submissions 
        SET file_path = ${privateUrl} 
        WHERE id = ${sub.id}
      `;

      // 6. Delete public original only after verification
      console.log(`  Deleting public original blob...`);
      try {
        await del(publicUrl);
      } catch (delErr: any) {
        console.warn(`  ⚠️ Failed to delete public original ${publicUrl}: ${delErr.message}. Original remains but DB updated.`);
      }

      successes.push({ id: sub.id, oldUrl: publicUrl, newUrl: privateUrl });
      console.log(`  ✅ Submission #${sub.id} migrated successfully.\n`);
    } catch (err: any) {
      console.error(`  ❌ Failed to migrate submission #${sub.id}:`, err.message);
      failures.push({ id: sub.id, url: publicUrl, reason: err.message });
      console.log('');
    }
  }

  // 7. Produce reports
  console.log('==================================================');
  console.log('MIGRATION COMPLETE SUMMARY');
  console.log(`Total Inventory: ${toMigrate.length}`);
  console.log(`Successes      : ${successes.length}`);
  console.log(`Failures       : ${failures.length}`);
  console.log('==================================================\n');

  if (failures.length > 0) {
    console.error('❌ MIGRATION FAILURE REPORT:');
    for (const fail of failures) {
      console.error(`- Submission #${fail.id} (${fail.url}): ${fail.reason}`);
    }
    console.log('\nOutstanding public files were NOT deleted and must be migrated manually.');
    process.exit(1);
  } else {
    console.log('🎉 All manuscripts successfully migrated to private Vercel Blob storage.');
    process.exit(0);
  }
}

migrateManuscripts().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
