import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import readline from 'readline';
import { Writable } from 'stream';
import { hashPassword } from '../src/lib/password';

const mutableStdout = new Writable({
  write: function(chunk, encoding, callback) {
    if (!(this as any).muted) {
      process.stdout.write(chunk, encoding);
    } else {
      // Print asterisk or nothing. Let's print nothing to keep it completely hidden.
    }
    callback();
  }
}) as Writable & { muted: boolean };
mutableStdout.muted = false;

const rl = readline.createInterface({
  input: process.stdin,
  output: mutableStdout,
  terminal: true
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

function askPassword(query: string): Promise<string> {
  return new Promise((resolve) => {
    mutableStdout.muted = false;
    process.stdout.write(query);
    mutableStdout.muted = true;
    rl.question('', (answer) => {
      mutableStdout.muted = false;
      console.log(''); // newline after enter
      resolve(answer);
    });
  });
}

async function bootstrap() {
  console.log('👑 TANQ Administrator Bootstrap CLI\n');
  const { sql } = await import('@vercel/postgres');

  try {
    const username = await askQuestion('Username (e.g. editor_admin): ');
    if (!username) {
      console.error('❌ Username is required');
      process.exit(1);
    }

    const name = await askQuestion('Full Name (e.g. Chief Editor): ');
    if (!name) {
      console.error('❌ Name is required');
      process.exit(1);
    }

    const email = await askQuestion('Email Address: ');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      console.error('❌ A valid email address is required');
      process.exit(1);
    }

    const password = await askPassword('Enter Administrator Password (min 16 characters): ');
    if (password.length < 16) {
      console.error('❌ Password must be at least 16 characters long');
      process.exit(1);
    }

    const confirmPassword = await askPassword('Confirm Administrator Password: ');
    if (password !== confirmPassword) {
      console.error('❌ Passwords do not match');
      process.exit(1);
    }

    console.log('\nHashing password securely...');
    const passwordHash = await hashPassword(password);

    console.log('Upserting administrator user in database...');
    // Non-destructive upsert: insert or update the admin account
    const userResult = await sql`
      INSERT INTO users (username, password_hash, name, email, role, is_verified, is_disabled)
      VALUES (${username}, ${passwordHash}, ${name}, ${email.toLowerCase()}, 'admin', TRUE, FALSE)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = 'admin',
        is_verified = TRUE,
        is_disabled = FALSE
      RETURNING id;
    `;

    const adminId = userResult.rows[0].id;
    console.log(`✅ Administrator "${username}" successfully bootstrapped.`);

    // Disable all other administrator accounts
    console.log('Disabling unknown/unapproved administrator accounts...');
    const disableResult = await sql`
      UPDATE users
      SET is_disabled = TRUE
      WHERE role = 'admin' AND username != ${username}
      RETURNING username;
    `;
    if (disableResult.rows.length > 0) {
      console.log('Disabled unknown admin accounts:', disableResult.rows.map(r => r.username));
    } else {
      console.log('No other administrator accounts found.');
    }

    // Revoke all administrator sessions in auth_sessions
    console.log('Revoking all administrator sessions...');
    const revokeResult = await sql`
      UPDATE auth_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE user_id IN (SELECT id FROM users WHERE role = 'admin') AND revoked_at IS NULL
      RETURNING id;
    `;
    console.log(`Revoked ${revokeResult.rows.length} administrator sessions.`);

    console.log('\n🎉 Bootstrap process completed successfully!\n');
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Bootstrap failed:', error);
    rl.close();
    process.exit(1);
  }
}

bootstrap();
