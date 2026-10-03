import { loadEnvConfig } from '@next/env';
import { sql } from '@vercel/postgres';

loadEnvConfig(process.cwd());

async function main() {
  const result = await sql`
    UPDATE articles AS article
    SET doi = '10.5281/zenodo.22286685'
    FROM issues AS issue
    WHERE article.issue_id = issue.id
      AND issue.volume = 1
      AND issue.number = 2
      AND article.doi = 'do:10.5281/zenodo.22286685'
    RETURNING article.id
  `;

  console.log(`Corrected ${result.rowCount ?? 0} Issue 2 DOI record(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
