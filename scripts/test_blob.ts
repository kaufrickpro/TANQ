import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { put } from '@vercel/blob';

async function test() {
  try {
    console.log("Token in process.env.BLOB_READ_WRITE_TOKEN:", process.env.BLOB_READ_WRITE_TOKEN ? "present" : "missing");
    const blob = await put('test.txt', 'hello', { access: 'public' });
    console.log("Blob put succeeded:", blob);
  } catch (err: any) {
    console.error("Blob put failed:", err);
  }
}

test();
