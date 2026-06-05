import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { hashPassword } from '../src/lib/password';

async function migrate() {
  console.log('🚀 Running TANQ database migration...\n');
  const { sql } = await import('@vercel/postgres');

  // ── Clean Database ─────────────────────────────────────────────────────────
  console.log('Dropping existing tables to clean database completely...');
  await sql`DROP TABLE IF EXISTS reviews, articles, submissions, journal_volumes, issues, invitations, users CASCADE;`;

  // ── Tables ────────────────────────────────────────────────────────────────

  console.log('Creating table: users');
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

  console.log('Creating table: invitations');
  await sql`
    CREATE TABLE IF NOT EXISTS invitations (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('admin', 'reviewer')),
      token      TEXT UNIQUE NOT NULL,
      is_used    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  console.log('Creating table: issues');
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

  console.log('Creating table: journal_volumes');
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

  console.log('Creating table: articles');
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

  console.log('Creating table: submissions');
  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id             SERIAL PRIMARY KEY,
      title          TEXT NOT NULL,
      abstract       TEXT NOT NULL,
      keywords       TEXT NOT NULL,
      author_name    TEXT NOT NULL,
      author_email   TEXT NOT NULL,
      file_path      TEXT NOT NULL,
      status         TEXT DEFAULT 'submitted'
                     CHECK(status IN ('submitted','in_review','revision_requested','accepted','rejected','published')),
      date_submitted TEXT NOT NULL
    );
  `;

  console.log('Creating table: reviews');
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

  // ── Seed Data ─────────────────────────────────────────────────────────────

  console.log('\nSeeding admin user...');
  const adminHash = await hashPassword('Admin123');

  await sql`
    INSERT INTO users (username, password_hash, name, email, role, is_verified) VALUES
      ('admin', ${adminHash}, 'Admin', 'admin@tanq.com', 'admin', TRUE)
    ON CONFLICT (username) DO UPDATE SET 
      password_hash = EXCLUDED.password_hash,
      email = EXCLUDED.email,
      is_verified = TRUE;
  `;

  console.log('\n✅ Migration complete! Database cleaned and admin user seeded.\n');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
