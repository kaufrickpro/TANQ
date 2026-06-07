import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import crypto from 'crypto';

async function migrate() {
  console.log('🚀 Running TANQ database migration...\n');
  const { sql } = await import('@vercel/postgres');

  // ── Duplicate Check ────────────────────────────────────────────────────────
  // Check if users table exists and contains case-insensitive duplicate usernames or emails
  const tableExistsResult = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'users'
    );
  `;
  const usersTableExists = tableExistsResult.rows[0].exists;

  if (usersTableExists) {
    console.log('Checking for case-insensitive username or email conflicts...');
    const dupUsernames = await sql`
      SELECT LOWER(username) as username, COUNT(*) as count
      FROM users
      GROUP BY LOWER(username)
      HAVING COUNT(*) > 1
    `;
    const dupEmails = await sql`
      SELECT LOWER(email) as email, COUNT(*) as count
      FROM users
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `;

    if (dupUsernames.rows.length > 0 || dupEmails.rows.length > 0) {
      console.error('❌ Conflict detected: duplicate records exist case-insensitively. Aborting migration.');
      if (dupUsernames.rows.length > 0) {
        console.error('Duplicate Usernames:', dupUsernames.rows);
      }
      if (dupEmails.rows.length > 0) {
        console.error('Duplicate Emails:', dupEmails.rows);
      }
      throw new Error('Migration aborted due to duplicate usernames/emails.');
    }
    console.log('No username/email duplicates found.');
  }

  // ── Tables ────────────────────────────────────────────────────────────────

  console.log('Creating table if not exists: users');
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('admin', 'reviewer', 'author')),
      is_verified   BOOLEAN DEFAULT FALSE,
      verification_otp TEXT,
      otp_expires_at  TIMESTAMP
    );
  `;

  console.log('Adding columns to users table...');
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE;
  `;

  console.log('Creating case-insensitive unique indexes for users table...');
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
  `;

  console.log('Creating table if not exists: invitations');
  await sql`
    CREATE TABLE IF NOT EXISTS invitations (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('admin', 'reviewer')),
      token      TEXT,
      is_used    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Adding columns to invitations table...');
  await sql`
    ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token_hash TEXT UNIQUE;
  `;
  await sql`
    ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
  `;
  await sql`
    ALTER TABLE invitations ADD COLUMN IF NOT EXISTS used_at TIMESTAMP;
  `;
  await sql`
    ALTER TABLE invitations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;
  `;
  await sql`
    ALTER TABLE invitations ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `;

  // Check if token column still exists in invitations to perform hash migration
  const tokenColumnExistsResult = await sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'token'
    );
  `;
  const tokenColumnExists = tokenColumnExistsResult.rows[0].exists;

  if (tokenColumnExists) {
    console.log('Migrating existing invitation tokens to token_hash and revoking outstanding ones...');
    const existingInvites = await sql`SELECT id, token, is_used FROM invitations`;
    for (const invite of existingInvites.rows) {
      if (invite.token) {
        const tokenHash = crypto.createHash('sha256').update(invite.token).digest('hex');
        // Revoke outstanding invitations during rollout: outstanding means not yet used.
        const revokedAt = invite.is_used ? null : new Date().toISOString();
        const usedAt = invite.is_used ? new Date().toISOString() : null;
        await sql`
          UPDATE invitations
          SET token_hash = ${tokenHash},
              revoked_at = ${revokedAt},
              used_at = ${usedAt}
          WHERE id = ${invite.id}
        `;
      }
    }

    // Now set token_hash as NOT NULL and drop token column
    console.log('Finalizing invitations table modifications...');
    // Ensure all rows have token_hash before altering
    await sql`
      UPDATE invitations 
      SET token_hash = encode(sha256(random()::text::bytea), 'hex') 
      WHERE token_hash IS NULL;
    `;
    await sql`
      ALTER TABLE invitations ALTER COLUMN token_hash SET NOT NULL;
    `;
    await sql`
      ALTER TABLE invitations DROP COLUMN IF EXISTS token;
    `;
  }

  console.log('Creating table if not exists: auth_sessions');
  await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id            SERIAL PRIMARY KEY,
      token_hash    TEXT UNIQUE NOT NULL,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at    TIMESTAMP NOT NULL,
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      revoked_at    TIMESTAMP
    );
  `;

  console.log('Creating table if not exists: auth_rate_limits');
  await sql`
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key        TEXT PRIMARY KEY,
      count      INTEGER NOT NULL DEFAULT 1,
      expires_at TIMESTAMP NOT NULL
    );
  `;

  console.log('Creating table if not exists: issues');
  await sql`
    CREATE TABLE IF NOT EXISTS issues (
      id            SERIAL PRIMARY KEY,
      volume        INTEGER NOT NULL,
      number        INTEGER NOT NULL,
      year          INTEGER NOT NULL,
      month         TEXT NOT NULL,
      title         TEXT NOT NULL,
      issue_pdf_url TEXT,
      is_published  INTEGER DEFAULT 0
    );
  `;

  console.log('Creating table if not exists: journal_volumes');
  await sql`
    CREATE TABLE IF NOT EXISTS journal_volumes (
      id       SERIAL PRIMARY KEY,
      volume   INTEGER NOT NULL,
      year     INTEGER NOT NULL,
      title    TEXT NOT NULL,
      subtitle TEXT,
      pdf_url  TEXT,
      UNIQUE(volume, year)
    );
  `;

  console.log('Creating table if not exists: articles');
  await sql`
    CREATE TABLE IF NOT EXISTS articles (
      id             SERIAL PRIMARY KEY,
      issue_id       INTEGER REFERENCES issues(id),
      title          TEXT NOT NULL,
      authors        TEXT NOT NULL,
      abstract       TEXT NOT NULL,
      keywords       TEXT NOT NULL,
      doi            TEXT NOT NULL,
      pages          TEXT NOT NULL,
      pdf_url        TEXT NOT NULL,
      type           TEXT NOT NULL,
      date_published TEXT NOT NULL
    );
  `;

  console.log('Creating table if not exists: submissions');
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id             SERIAL PRIMARY KEY,
      title          TEXT NOT NULL,
      abstract       TEXT NOT NULL,
      keywords       TEXT NOT NULL,
      author_name    TEXT NOT NULL,
      author_email   TEXT NOT NULL,
      file_path      TEXT NOT NULL DEFAULT '',
      status         TEXT DEFAULT 'submitted'
                     CHECK(status IN ('draft','submitted','in_review','revision_requested','accepted','rejected','published','withdrawn')),
      date_submitted TEXT NOT NULL DEFAULT ''
    );
  `;

  // Drop the old status CHECK constraint if it exists (so we can add the new one)
  console.log('Updating submissions status CHECK constraint to include draft and withdrawn...');
  await sql`
    ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;
  `;
  await sql`
    ALTER TABLE submissions ADD CONSTRAINT submissions_status_check
      CHECK(status IN ('draft','submitted','in_review','revision_requested','accepted','rejected','published','withdrawn'));
  `;

  // Make file_path and date_submitted nullable-compatible with defaults for draft rows
  await sql`
    ALTER TABLE submissions ALTER COLUMN file_path SET DEFAULT '';
  `;
  await sql`
    ALTER TABLE submissions ALTER COLUMN date_submitted SET DEFAULT '';
  `;

  console.log('Adding wizard + withdrawal columns to submissions table...');
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS draft_step INTEGER DEFAULT 1;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submission_type TEXT DEFAULT 'Research Article';`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS topic TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'English';`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS short_title TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS co_authors JSONB DEFAULT '[]';`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS files_meta JSONB DEFAULT '{}';`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS project_number TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS ethics_statement TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS supporting_institution TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS acknowledgements TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS editor_note TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS checklist_confirmed BOOLEAN DEFAULT FALSE;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS withdrawal_status TEXT DEFAULT NULL;`;

  console.log('Creating table if not exists: withdrawal_requests');
  await sql`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id              SERIAL PRIMARY KEY,
      submission_id   INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      requested_by    TEXT NOT NULL,
      reason          TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','approved','rejected')),
      editor_note     TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ
    );
  `;

  console.log('Creating table if not exists: reviews');
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id              SERIAL PRIMARY KEY,
      submission_id   INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
      reviewer_name   TEXT NOT NULL,
      reviewer_email  TEXT NOT NULL,
      comments        TEXT NOT NULL,
      recommendation  TEXT NOT NULL
                      CHECK(recommendation IN ('accept','minor_revision','major_revision','reject')),
      score           INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      date_reviewed   TEXT NOT NULL
    );
  `;

  console.log('\n✅ Migration complete! Database tables verified and updated.\n');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
