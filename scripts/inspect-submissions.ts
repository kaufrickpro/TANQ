import { loadEnvConfig } from '@next/env';
import { sql } from '@vercel/postgres';

loadEnvConfig(process.cwd());

async function inspect() {
  try {
    const res = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'submissions';
    `;
    console.log('Columns of submissions table:');
    console.log(res.rows);

    const subs = await sql`SELECT * FROM submissions ORDER BY id DESC LIMIT 5;`;
    console.log('Last 5 submissions:');
    console.log(subs.rows);
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
}

inspect();
