import { loadEnvConfig } from '@next/env';
import { sql } from '@vercel/postgres';

// Load environment variables from .env.local / .env
loadEnvConfig(process.cwd());

async function checkConnection() {
  console.log('🔌 Testing database connection...');
  try {
    const start = Date.now();
    const res = await sql`SELECT NOW();`;
    const duration = Date.now() - start;
    
    console.log('✅ Connection successful!');
    console.log(`⏱️  Latency: ${duration}ms`);
    console.log(`📅 Database Server Time: ${res.rows[0].now}`);
  } catch (error) {
    console.error('❌ Connection failed!');
    console.error(error);
    process.exit(1);
  }
  process.exit(0);
}

checkConnection();
