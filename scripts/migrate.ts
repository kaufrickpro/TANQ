import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import crypto from 'crypto';

const DEFAULT_EMAIL_TEMPLATES = [
  {
    key: 'submission_received',
    subject: 'Submission received: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>We received your submission, <strong>{{submission_title}}</strong>.</p><p>The ANQ Editorial Team</p>',
    description: 'Confirms receipt of a new submission to the author.',
    variables: ['author_name', 'submission_title'],
  },
  {
    key: 'submission_desk_rejected',
    subject: 'Editorial decision: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your submission, <strong>{{submission_title}}</strong>, will not proceed to peer review.</p><p>{{decision_letter}}</p><p>The ANQ Editorial Team</p>',
    description: 'Notifies an author of a desk rejection.',
    variables: ['author_name', 'submission_title', 'decision_letter'],
  },
  {
    key: 'reviewer_invitation',
    subject: 'Review invitation: {{submission_title}}',
    body: '<p>Dear {{reviewer_name}},</p><p>You are invited to review <strong>{{submission_title}}</strong>.</p><p>Please respond by following this link: <a href="{{invitation_url}}">{{invitation_url}}</a></p><p>Review deadline: {{review_deadline}}</p>',
    description: 'Invites a reviewer to accept or decline an assignment.',
    variables: ['reviewer_name', 'submission_title', 'invitation_url', 'review_deadline'],
  },
  {
    key: 'reviewer_invitation_response',
    subject: 'Reviewer {{response}}: {{submission_title}}',
    body: '<p>Dear {{editor_name}},</p><p>{{reviewer_name}} responded <strong>{{response}}</strong> to the review invitation for <strong>{{submission_title}}</strong>.</p>',
    description: 'Notifies an editor when a reviewer accepts or declines an invitation.',
    variables: ['editor_name', 'reviewer_name', 'submission_title', 'response'],
  },
  {
    key: 'reviewer_reminder',
    subject: 'Review reminder: {{submission_title}}',
    body: '<p>Dear {{reviewer_name}},</p><p>This is a reminder that your review of <strong>{{submission_title}}</strong> is due on {{review_deadline}}.</p>',
    description: 'Reminds a reviewer of an upcoming deadline.',
    variables: ['reviewer_name', 'submission_title', 'review_deadline'],
  },
  {
    key: 'reviewer_urgent_reminder',
    subject: 'Overdue review: {{submission_title}}',
    body: '<p>Dear {{reviewer_name}},</p><p>Your review of <strong>{{submission_title}}</strong> was due on {{review_deadline}}. Please submit it as soon as possible.</p>',
    description: 'Escalates an overdue review.',
    variables: ['reviewer_name', 'submission_title', 'review_deadline'],
  },
  {
    key: 'review_submitted',
    subject: 'Review submitted: {{submission_title}}',
    body: '<p>Dear {{editor_name}},</p><p>{{reviewer_name}} submitted a review for <strong>{{submission_title}}</strong>.</p>',
    description: 'Notifies an editor that a review was submitted.',
    variables: ['editor_name', 'reviewer_name', 'submission_title'],
  },
  {
    key: 'all_reviews_complete',
    subject: 'All reviews complete: {{submission_title}}',
    body: '<p>Dear {{editor_name}},</p><p>All assigned reviews for <strong>{{submission_title}}</strong> are complete and ready for an editorial decision.</p>',
    description: 'Notifies an editor that a review round is ready for decision.',
    variables: ['editor_name', 'submission_title'],
  },
  {
    key: 'decision_minor_revision',
    subject: 'Minor revision requested: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>A minor revision has been requested for <strong>{{submission_title}}</strong>.</p><p>{{decision_letter}}</p>',
    description: 'Sends a minor-revision decision to an author.',
    variables: ['author_name', 'submission_title', 'decision_letter'],
  },
  {
    key: 'decision_major_revision',
    subject: 'Major revision requested: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>A major revision has been requested for <strong>{{submission_title}}</strong>.</p><p>{{decision_letter}}</p>',
    description: 'Sends a major-revision decision to an author.',
    variables: ['author_name', 'submission_title', 'decision_letter'],
  },
  {
    key: 'decision_accept',
    subject: 'Submission accepted: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your submission, <strong>{{submission_title}}</strong>, has been accepted.</p><p>{{decision_letter}}</p>',
    description: 'Sends an acceptance decision to an author.',
    variables: ['author_name', 'submission_title', 'decision_letter'],
  },
  {
    key: 'decision_reject',
    subject: 'Editorial decision: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your submission, <strong>{{submission_title}}</strong>, has been rejected.</p><p>{{decision_letter}}</p>',
    description: 'Sends a rejection decision to an author.',
    variables: ['author_name', 'submission_title', 'decision_letter'],
  },
  {
    key: 'revision_received',
    subject: 'Revision received: {{submission_title}}',
    body: '<p>Dear {{editor_name}},</p><p>{{author_name}} submitted a revision for <strong>{{submission_title}}</strong>.</p>',
    description: 'Notifies an editor that an author revision was submitted.',
    variables: ['editor_name', 'author_name', 'submission_title'],
  },
  {
    key: 'production_ready',
    subject: 'Proofs ready: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Proofs for <strong>{{submission_title}}</strong> are ready: <a href="{{proof_url}}">{{proof_url}}</a></p>',
    description: 'Notifies an author that proofs are ready.',
    variables: ['author_name', 'submission_title', 'proof_url'],
  },
  {
    key: 'article_published',
    subject: 'Article published: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your article, <strong>{{submission_title}}</strong>, is published: <a href="{{article_url}}">{{article_url}}</a></p>',
    description: 'Notifies an author that an article was published.',
    variables: ['author_name', 'submission_title', 'article_url'],
  },
  {
    key: 'deadline_reminder',
    subject: 'Deadline reminder: {{submission_title}}',
    body: '<p>Dear {{recipient_name}},</p><p>The {{stage}} deadline for <strong>{{submission_title}}</strong> is {{deadline}}.</p>',
    description: 'Generic reminder for a submission workflow deadline.',
    variables: ['recipient_name', 'submission_title', 'stage', 'deadline'],
  },
  {
    key: 'discussion_message',
    subject: 'Discussion updated: {{discussion_subject}}',
    body: '<p>Discussion {{discussion_id}} ({{discussion_subject}}) was updated: {{discussion_action}}</p>',
    description: 'Notifies participants about a new discussion message.',
    variables: ['discussion_id', 'discussion_subject', 'discussion_action'],
  },
  {
    key: 'discussion_closed',
    subject: 'Discussion closed: {{discussion_subject}}',
    body: '<p>Discussion {{discussion_id}} ({{discussion_subject}}) was closed: {{discussion_action}}</p>',
    description: 'Notifies participants that a discussion was closed.',
    variables: ['discussion_id', 'discussion_subject', 'discussion_action'],
  },
  {
    key: 'withdrawal_request',
    subject: 'Withdrawal request: {{submission_title}}',
    body: '<p>A withdrawal request was submitted for <strong>{{submission_title}}</strong> by {{author_name}}.</p><p>Reason: {{reason}}</p><p>Please review it in the ANQ Editor Dashboard.</p>',
    description: 'Notifies the editorial team of an author withdrawal request.',
    variables: ['author_name', 'submission_title', 'reason'],
  },
  {
    key: 'withdrawal_approved',
    subject: 'Withdrawal approved: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your withdrawal request for <strong>{{submission_title}}</strong> has been approved.</p><p>{{editor_note}}</p>',
    description: 'Notifies an author that a withdrawal was approved.',
    variables: ['author_name', 'submission_title', 'editor_note'],
  },
  {
    key: 'withdrawal_rejected',
    subject: 'Withdrawal rejected: {{submission_title}}',
    body: '<p>Dear {{author_name}},</p><p>Your withdrawal request for <strong>{{submission_title}}</strong> has been rejected and the manuscript remains in review.</p><p>{{editor_note}}</p>',
    description: 'Notifies an author that a withdrawal was rejected.',
    variables: ['author_name', 'submission_title', 'editor_note'],
  },
] as const;

const DEFAULT_DEADLINE_CONFIGS = [
  { stage: 'secretary_check', role: 'secretary', defaultDays: 3, reminderDays: [1] },
  { stage: 'editor_screening', role: 'editor', defaultDays: 7, reminderDays: [3, 1] },
  {
    stage: 'under_review',
    role: 'reviewer',
    defaultDays: 21,
    reminderDays: [7, 3, 1],
    autoEscalationAction: 'auto_uninvite_reviewer',
  },
  { stage: 'editor_decision', role: 'editor', defaultDays: 7, reminderDays: [3, 1] },
  { stage: 'author_revision', role: 'author', defaultDays: 30, reminderDays: [14, 7, 3] },
  { stage: 'production', role: 'editor', defaultDays: 14, reminderDays: [7, 3] },
] as const;

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
      role          TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'secretary', 'reviewer', 'author')),
      is_verified   BOOLEAN DEFAULT FALSE,
      verification_otp TEXT,
      otp_expires_at  TIMESTAMP
    );
  `;

  console.log('Updating users role constraint for separated editorial roles...');
  await sql`
    ALTER TABLE users 
      DROP CONSTRAINT IF EXISTS users_role_check,
      ADD CONSTRAINT users_role_check CHECK(role IN ('admin', 'editor', 'secretary', 'reviewer', 'author'));
  `;

  console.log('Adding columns to users table...');
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN DEFAULT FALSE;
  `;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise_keywords TEXT[] NOT NULL DEFAULT '{}';`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS institution TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS orcid_id TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_availability BOOLEAN NOT NULL DEFAULT TRUE;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_review_days NUMERIC;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_reviews_completed INTEGER NOT NULL DEFAULT 0;`;
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_avg_review_days_check;`;
  await sql`ALTER TABLE users ADD CONSTRAINT users_avg_review_days_check CHECK(avg_review_days IS NULL OR avg_review_days >= 0);`;
  await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_total_reviews_completed_check;`;
  await sql`ALTER TABLE users ADD CONSTRAINT users_total_reviews_completed_check CHECK(total_reviews_completed >= 0);`;

  console.log('Creating case-insensitive unique indexes for users table...');
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_reviewer_availability ON users(role, reviewer_availability) WHERE role = 'reviewer';`;
  await sql`CREATE INDEX IF NOT EXISTS idx_users_expertise_keywords ON users USING GIN(expertise_keywords);`;

  console.log('Creating table if not exists: invitations');
  await sql`
    CREATE TABLE IF NOT EXISTS invitations (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'secretary', 'reviewer')),
      token      TEXT,
      is_used    BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    ALTER TABLE invitations 
      DROP CONSTRAINT IF EXISTS invitations_role_check,
      ADD CONSTRAINT invitations_role_check CHECK(role IN ('admin', 'editor', 'secretary', 'reviewer'));
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
  await sql`ALTER TABLE articles ADD COLUMN IF NOT EXISTS source_document_version_id BIGINT;`;

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
  console.log('Updating submissions status CHECK constraint for case-file workflow...');
  await sql`
    ALTER TABLE submissions 
      DROP CONSTRAINT IF EXISTS submissions_status_check,
      ADD CONSTRAINT submissions_status_check CHECK(status IN (
        'draft','submitted','secretary_check','editor_screening','in_review','under_review',
        'editor_decision','revision_requested','author_revision','accepted','production',
        'rejected','published','withdrawn'
      ));
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
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS public_id UUID DEFAULT gen_random_uuid();`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_stage TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_round_id BIGINT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 0;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS closed_reason TEXT;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_stage_deadline TIMESTAMPTZ;`;
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_stage_entered_at TIMESTAMPTZ;`;
  await sql`UPDATE submissions SET current_stage = status WHERE current_stage IS NULL;`;
  await sql`UPDATE submissions SET public_id = gen_random_uuid() WHERE public_id IS NULL;`;
  await sql`ALTER TABLE submissions ALTER COLUMN public_id SET NOT NULL;`;
  await sql`ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_current_stage_check;`;
  await sql`
    ALTER TABLE submissions ADD CONSTRAINT submissions_current_stage_check
      CHECK(current_stage IN (
        'draft','submitted','secretary_check','editor_screening','in_review','under_review',
        'editor_decision','revision_requested','author_revision','accepted','production',
        'rejected','published','withdrawn'
      ));
  `;
  await sql`
    UPDATE submissions
    SET submitted_at = CASE
      WHEN date_submitted ~ '^\d{4}-\d{2}-\d{2}$' THEN date_submitted::date::timestamptz
      ELSE NOW()
    END
    WHERE submitted_at IS NULL AND status != 'draft';
  `;
  await sql`
    UPDATE submissions
    SET current_stage_entered_at = COALESCE(submitted_at, NOW())
    WHERE current_stage_entered_at IS NULL;
  `;
  await sql`ALTER TABLE submissions ALTER COLUMN current_stage_entered_at SET DEFAULT NOW();`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_public_id
      ON submissions(public_id);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_submissions_author_email_lower
      ON submissions(LOWER(TRIM(author_email)));
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_submissions_current_stage
      ON submissions(current_stage, id DESC);
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_submissions_stage_deadline
      ON submissions(current_stage_deadline, current_stage)
      WHERE current_stage_deadline IS NOT NULL;
  `;

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

  // ── Immutable manuscript case files ──────────────────────────────────────

  console.log('Creating immutable manuscript case-file tables...');
  await sql`
    CREATE TABLE IF NOT EXISTS submission_documents (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      kind                  TEXT NOT NULL,
      label                 TEXT NOT NULL,
      visibility            TEXT NOT NULL DEFAULT 'editorial'
                            CHECK(visibility IN ('author','reviewer','editorial','evidence')),
      created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name       TEXT NOT NULL,
      created_by_role       TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(submission_id, kind)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS document_versions (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      document_id           BIGINT NOT NULL REFERENCES submission_documents(id) ON DELETE RESTRICT,
      version_number        INTEGER NOT NULL CHECK(version_number > 0),
      blob_url              TEXT NOT NULL UNIQUE,
      blob_pathname         TEXT NOT NULL UNIQUE,
      original_filename     TEXT NOT NULL,
      content_type          TEXT NOT NULL,
      size_bytes            BIGINT NOT NULL CHECK(size_bytes >= 0),
      sha256                TEXT,
      etag                  TEXT,
      uploaded_by_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploaded_by_name      TEXT NOT NULL,
      uploaded_by_role      TEXT NOT NULL,
      upload_note           TEXT,
      review_round_id       BIGINT,
      legacy_import         BOOLEAN NOT NULL DEFAULT FALSE,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(document_id, version_number),
      CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$')
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS review_rounds (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      round_number          INTEGER NOT NULL CHECK(round_number > 0),
      manuscript_version_id BIGINT NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
      status                TEXT NOT NULL DEFAULT 'open'
                            CHECK(status IN ('open','awaiting_editor','closed','cancelled')),
      opened_by_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      opened_by_name        TEXT NOT NULL,
      opened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at             TIMESTAMPTZ,
      UNIQUE(submission_id, round_number)
    );
  `;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_review_round_id_fkey'
      ) THEN
        ALTER TABLE document_versions
          ADD CONSTRAINT document_versions_review_round_id_fkey
          FOREIGN KEY (review_round_id) REFERENCES review_rounds(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'articles_source_document_version_id_fkey'
      ) THEN
        ALTER TABLE articles
          ADD CONSTRAINT articles_source_document_version_id_fkey
          FOREIGN KEY (source_document_version_id) REFERENCES document_versions(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'submissions_current_round_id_fkey'
      ) THEN
        ALTER TABLE submissions
          ADD CONSTRAINT submissions_current_round_id_fkey
          FOREIGN KEY (current_round_id) REFERENCES review_rounds(id) ON DELETE RESTRICT;
      END IF;
    END $$;
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS review_assignments (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      review_round_id       BIGINT NOT NULL REFERENCES review_rounds(id) ON DELETE RESTRICT,
      reviewer_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewer_name         TEXT NOT NULL,
      reviewer_email        TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'assigned'
                            CHECK(status IN ('assigned','submitted','cancelled')),
      assigned_by_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_by_name      TEXT NOT NULL,
      assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at          TIMESTAMPTZ,
      UNIQUE(review_round_id, reviewer_email)
    );
  `;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS invitation_token_hash TEXT;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS invitation_sent_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS response_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS decline_reason TEXT;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS coi_declaration TEXT;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS coi_declared BOOLEAN NOT NULL DEFAULT FALSE;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS review_deadline TIMESTAMPTZ;`;
  await sql`ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS is_alternate BOOLEAN NOT NULL DEFAULT FALSE;`;
  await sql`
    ALTER TABLE review_assignments 
      DROP CONSTRAINT IF EXISTS review_assignments_status_check,
      ADD CONSTRAINT review_assignments_status_check CHECK(status IN (
        'assigned','invited','accepted','declined','expired','alternate','submitted','cancelled'
      ));
  `;
  await sql`ALTER TABLE review_assignments DROP CONSTRAINT IF EXISTS review_assignments_reminder_count_check;`;
  await sql`ALTER TABLE review_assignments ADD CONSTRAINT review_assignments_reminder_count_check CHECK(reminder_count >= 0);`;

  await sql`
    CREATE TABLE IF NOT EXISTS review_reports (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      review_round_id       BIGINT NOT NULL REFERENCES review_rounds(id) ON DELETE RESTRICT,
      assignment_id         BIGINT NOT NULL UNIQUE REFERENCES review_assignments(id) ON DELETE RESTRICT,
      recommendation        TEXT NOT NULL
                            CHECK(recommendation IN ('accept','minor_revision','major_revision','reject')),
      score                 INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      comments_to_author    TEXT NOT NULL,
      confidential_comments TEXT,
      submitted_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      submitted_by_name     TEXT NOT NULL,
      submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS review_addenda (
      id                    BIGSERIAL PRIMARY KEY,
      report_id             BIGINT NOT NULL REFERENCES review_reports(id) ON DELETE RESTRICT,
      body                  TEXT NOT NULL,
      created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name       TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS review_report_releases (
      id                    BIGSERIAL PRIMARY KEY,
      report_id             BIGINT NOT NULL UNIQUE REFERENCES review_reports(id) ON DELETE RESTRICT,
      released_by_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      released_by_name      TEXT NOT NULL,
      released_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS editorial_decisions (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      review_round_id       BIGINT REFERENCES review_rounds(id) ON DELETE RESTRICT,
      decision              TEXT NOT NULL
                            CHECK(decision IN ('technical_revision','minor_revision','major_revision','accept','reject','withdraw')),
      letter                TEXT NOT NULL,
      decided_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_by_name       TEXT NOT NULL,
      decided_by_role       TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS submission_events (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      sequence_number       INTEGER NOT NULL CHECK(sequence_number > 0),
      event_type            TEXT NOT NULL,
      actor_user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name            TEXT NOT NULL,
      actor_role            TEXT NOT NULL,
      from_stage            TEXT,
      to_stage              TEXT,
      summary               TEXT NOT NULL,
      payload               JSONB NOT NULL DEFAULT '{}',
      previous_hash         TEXT,
      event_hash            TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(submission_id, sequence_number),
      UNIQUE(submission_id, event_hash)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS evidence_exports (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','processing','ready','failed','expired')),
      requested_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_by_name     TEXT NOT NULL,
      include_identities    BOOLEAN NOT NULL DEFAULT FALSE,
      blob_url              TEXT,
      blob_pathname         TEXT,
      manifest_sha256       TEXT,
      error_message         TEXT,
      requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at          TIMESTAMPTZ,
      expires_at            TIMESTAMPTZ
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS evidence_shares (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      token_hash            TEXT NOT NULL UNIQUE,
      auditor_email         TEXT NOT NULL,
      include_identities    BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at            TIMESTAMPTZ NOT NULL,
      revoked_at            TIMESTAMPTZ,
      created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by_name       TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS evidence_share_otps (
      id                    BIGSERIAL PRIMARY KEY,
      share_id              BIGINT NOT NULL REFERENCES evidence_shares(id) ON DELETE RESTRICT,
      otp_hash              TEXT NOT NULL,
      expires_at            TIMESTAMPTZ NOT NULL,
      consumed_at           TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS evidence_share_accesses (
      id                    BIGSERIAL PRIMARY KEY,
      share_id              BIGINT NOT NULL REFERENCES evidence_shares(id) ON DELETE RESTRICT,
      action                TEXT NOT NULL CHECK(action IN ('otp_requested','viewed','downloaded','denied')),
      ip_address            TEXT,
      user_agent            TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id                    BIGSERIAL PRIMARY KEY,
      template_key          TEXT NOT NULL UNIQUE,
      subject               TEXT NOT NULL,
      body_html             TEXT NOT NULL,
      description           TEXT,
      variables             TEXT[] NOT NULL DEFAULT '{}',
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         INTEGER REFERENCES submissions(id) ON DELETE RESTRICT,
      recipient_email       TEXT NOT NULL,
      template              TEXT NOT NULL,
      payload               JSONB NOT NULL DEFAULT '{}',
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','sent','failed')),
      attempts              INTEGER NOT NULL DEFAULT 0,
      last_error            TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at               TIMESTAMPTZ
    );
  `;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS rendered_subject TEXT;`;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS rendered_html TEXT;`;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS dedupe_key TEXT;`;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;`;
  await sql`ALTER TABLE notification_outbox ADD COLUMN IF NOT EXISTS provider_message_id TEXT;`;
  await sql`UPDATE notification_outbox SET available_at = created_at WHERE available_at IS NULL;`;
  await sql`ALTER TABLE notification_outbox ALTER COLUMN available_at SET DEFAULT NOW();`;
  await sql`ALTER TABLE notification_outbox ALTER COLUMN available_at SET NOT NULL;`;
  await sql`UPDATE notification_outbox SET attempts = 0 WHERE attempts IS NULL;`;
  await sql`ALTER TABLE notification_outbox ALTER COLUMN attempts SET DEFAULT 0;`;
  await sql`ALTER TABLE notification_outbox ALTER COLUMN attempts SET NOT NULL;`;
  await sql`ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_status_check;`;
  await sql`
    ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_status_check
      CHECK(status IN ('pending','processing','sent','failed'));
  `;
  await sql`ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_attempts_check;`;
  await sql`ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_attempts_check CHECK(attempts >= 0);`;

  await sql`
    CREATE TABLE IF NOT EXISTS revision_responses (
      id                                  BIGSERIAL PRIMARY KEY,
      submission_id                       BIGINT NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      review_round_id                     BIGINT NOT NULL REFERENCES review_rounds(id) ON DELETE RESTRICT,
      status                              TEXT NOT NULL DEFAULT 'draft'
                                          CHECK(status IN ('draft','submitted')),
      response_items                      JSONB NOT NULL DEFAULT '[]',
      response_document_version_id        BIGINT REFERENCES document_versions(id) ON DELETE RESTRICT,
      tracked_changes_document_version_id BIGINT REFERENCES document_versions(id) ON DELETE RESTRICT,
      clean_document_version_id           BIGINT REFERENCES document_versions(id) ON DELETE RESTRICT,
      created_by                          BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at                        TIMESTAMPTZ,
      UNIQUE(submission_id, review_round_id),
      CHECK(jsonb_typeof(response_items) = 'array'),
      CHECK(status != 'submitted' OR submitted_at IS NOT NULL)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS discussions (
      id                    BIGSERIAL PRIMARY KEY,
      submission_id         BIGINT NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
      stage                 TEXT NOT NULL,
      subject               TEXT NOT NULL,
      visibility            TEXT NOT NULL
                            CHECK(visibility IN ('editorial','author_editor','all_parties')),
      created_by_user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_by_name       TEXT NOT NULL,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      is_closed             BOOLEAN NOT NULL DEFAULT FALSE
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS discussion_messages (
      id                    BIGSERIAL PRIMARY KEY,
      discussion_id         BIGINT NOT NULL REFERENCES discussions(id) ON DELETE RESTRICT,
      sender_user_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
      sender_name           TEXT NOT NULL,
      body                  TEXT NOT NULL,
      attachment_version_id BIGINT REFERENCES document_versions(id) ON DELETE RESTRICT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS deadline_configs (
      id                     BIGSERIAL PRIMARY KEY,
      stage                  TEXT NOT NULL,
      role                   TEXT NOT NULL,
      default_days           INTEGER NOT NULL CHECK(default_days > 0),
      reminder_days_before   INTEGER[] NOT NULL DEFAULT '{7,3,1}',
      auto_escalation_action TEXT,
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(stage, role)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS integrity_checks (
      id                    BIGSERIAL PRIMARY KEY,
      document_version_id   BIGINT NOT NULL REFERENCES document_versions(id) ON DELETE RESTRICT,
      status                TEXT NOT NULL CHECK(status IN ('ok','missing','mismatch','error')),
      observed_sha256       TEXT,
      details               TEXT,
      checked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  console.log('Creating case-file indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_submission ON submission_documents(submission_id, kind);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_documents_created_by ON submission_documents(created_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_versions_submission_created ON document_versions(submission_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_versions_document_number ON document_versions(document_id, version_number DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_versions_review_round ON document_versions(review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_versions_uploaded_by ON document_versions(uploaded_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rounds_submission ON review_rounds(submission_id, round_number DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rounds_manuscript_version ON review_rounds(manuscript_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_rounds_opened_by ON review_rounds(opened_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_reviewer_email ON review_assignments(LOWER(TRIM(reviewer_email)), status);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_submission ON review_assignments(submission_id, review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_reviewer_user ON review_assignments(reviewer_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_assigned_by ON review_assignments(assigned_by_user_id);`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_invitation_token_hash ON review_assignments(invitation_token_hash) WHERE invitation_token_hash IS NOT NULL;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_invitation_expiry ON review_assignments(status, invitation_expires_at) WHERE invitation_expires_at IS NOT NULL;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_assignments_review_deadline ON review_assignments(review_deadline, status) WHERE review_deadline IS NOT NULL;`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_submission ON review_reports(submission_id, review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_review_round ON review_reports(review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reports_submitted_by ON review_reports(submitted_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_addenda_report ON review_addenda(report_id, created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_addenda_created_by ON review_addenda(created_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_releases_released_by ON review_report_releases(released_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_decisions_submission ON editorial_decisions(submission_id, created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_decisions_review_round ON editorial_decisions(review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_decisions_decided_by ON editorial_decisions(decided_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_submission_sequence ON submission_events(submission_id, sequence_number);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_actor_user ON submission_events(actor_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_submission_id ON reviews(submission_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_email ON reviews(LOWER(TRIM(reviewer_email)));`;
  await sql`CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_submission ON withdrawal_requests(submission_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_exports_submission ON evidence_exports(submission_id, requested_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_exports_requested_by ON evidence_exports(requested_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_shares_submission ON evidence_shares(submission_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_shares_created_by ON evidence_shares(created_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_share_otps_share ON evidence_share_otps(share_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_evidence_accesses_share ON evidence_share_accesses(share_id, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notification_outbox_submission ON notification_outbox(submission_id, status);`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_dedupe_key ON notification_outbox(dedupe_key) WHERE dedupe_key IS NOT NULL;`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_notification_outbox_claim
      ON notification_outbox(available_at, id)
      WHERE status IN ('pending','failed','processing') AND attempts < 3;
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_submission ON revision_responses(submission_id, review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_round ON revision_responses(review_round_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_response_version ON revision_responses(response_document_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_tracked_version ON revision_responses(tracked_changes_document_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_clean_version ON revision_responses(clean_document_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_revision_responses_created_by ON revision_responses(created_by);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_discussions_submission_stage ON discussions(submission_id, stage, created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_discussions_created_by ON discussions(created_by_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_discussion_messages_discussion ON discussion_messages(discussion_id, created_at);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_discussion_messages_sender ON discussion_messages(sender_user_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_discussion_messages_attachment ON discussion_messages(attachment_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_integrity_checks_version ON integrity_checks(document_version_id, checked_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_articles_issue ON articles(issue_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_articles_source_version ON articles(source_document_version_id);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_submissions_current_round ON submissions(current_round_id);`;

  console.log('Seeding default notification templates and deadline configurations...');
  for (const template of DEFAULT_EMAIL_TEMPLATES) {
    await sql`
      INSERT INTO email_templates (
        template_key, subject, body_html, description, variables
      )
      VALUES (
        ${template.key}, ${template.subject}, ${template.body}, ${template.description},
        ARRAY(
          SELECT value
          FROM jsonb_array_elements_text(${JSON.stringify(template.variables)}::jsonb) AS value
        )
      )
      ON CONFLICT (template_key) DO NOTHING
    `;
  }
  for (const config of DEFAULT_DEADLINE_CONFIGS) {
    await sql`
      INSERT INTO deadline_configs (
        stage, role, default_days, reminder_days_before, auto_escalation_action
      )
      VALUES (
        ${config.stage}, ${config.role}, ${config.defaultDays},
        ARRAY(
          SELECT value::integer
          FROM jsonb_array_elements_text(${JSON.stringify(config.reminderDays)}::jsonb) AS value
        ),
        ${'autoEscalationAction' in config ? config.autoEscalationAction : null}
      )
      ON CONFLICT (stage, role) DO NOTHING
    `;
  }
  await sql`
    UPDATE deadline_configs
    SET auto_escalation_action = 'auto_uninvite_reviewer'
    WHERE stage = 'under_review'
      AND role = 'reviewer'
      AND auto_escalation_action IS NULL
  `;

  console.log('Backfilling legacy manuscript pointers into case files...');
  await sql`
    INSERT INTO submission_documents (
      submission_id, kind, label, visibility, created_by_name, created_by_role, created_at
    )
    SELECT s.id, 'manuscript', 'Blinded Manuscript', 'reviewer', s.author_name, 'author',
           COALESCE(s.submitted_at, NOW())
    FROM submissions s
    WHERE s.file_path <> ''
    ON CONFLICT (submission_id, kind) DO NOTHING;
  `;
  await sql`
    INSERT INTO document_versions (
      submission_id, document_id, version_number, blob_url, blob_pathname,
      original_filename, content_type, size_bytes, uploaded_by_name, uploaded_by_role,
      upload_note, legacy_import, created_at
    )
    SELECT s.id, d.id, 1, s.file_path,
           regexp_replace(s.file_path, '^https?://[^/]+/', ''),
           COALESCE(NULLIF(regexp_replace(s.file_path, '^.*/', ''), ''), 'legacy-manuscript'),
           'application/octet-stream', 0, s.author_name, 'author',
           'Imported from legacy submissions.file_path; checksum pending verification.',
           TRUE, COALESCE(s.submitted_at, NOW())
    FROM submissions s
    JOIN submission_documents d ON d.submission_id = s.id AND d.kind = 'manuscript'
    WHERE s.file_path <> ''
      AND NOT EXISTS (
        SELECT 1 FROM document_versions v WHERE v.document_id = d.id
      );
  `;

  console.log('Backfilling legacy reviews into pinned review rounds...');
  await sql`
    INSERT INTO review_rounds (
      submission_id, round_number, manuscript_version_id, status,
      opened_by_name, opened_at
    )
    SELECT s.id, 1, latest_version.id,
           CASE
             WHEN BOOL_AND(NULLIF(TRIM(r.date_reviewed), '') IS NOT NULL) THEN 'awaiting_editor'
             ELSE 'open'
           END,
           'TANQ Migration', COALESCE(s.submitted_at, NOW())
    FROM submissions s
    JOIN reviews r ON r.submission_id = s.id
    JOIN LATERAL (
      SELECT v.id
      FROM document_versions v
      JOIN submission_documents d ON d.id = v.document_id
      WHERE v.submission_id = s.id AND d.kind = 'manuscript'
      ORDER BY v.version_number DESC
      LIMIT 1
    ) latest_version ON TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM review_rounds rr WHERE rr.submission_id = s.id
    )
    GROUP BY s.id, latest_version.id, s.submitted_at;
  `;
  await sql`
    UPDATE submissions s
    SET current_round_id = rr.id
    FROM review_rounds rr
    WHERE rr.submission_id = s.id
      AND rr.round_number = 1
      AND s.current_round_id IS NULL
      AND EXISTS (SELECT 1 FROM reviews r WHERE r.submission_id = s.id);
  `;
  await sql`
    INSERT INTO review_assignments (
      submission_id, review_round_id, reviewer_name, reviewer_email,
      status, assigned_by_name, assigned_at, submitted_at
    )
    SELECT DISTINCT ON (r.submission_id, LOWER(TRIM(r.reviewer_email)))
           r.submission_id, rr.id, r.reviewer_name, LOWER(TRIM(r.reviewer_email)),
           CASE WHEN NULLIF(TRIM(r.date_reviewed), '') IS NULL THEN 'assigned' ELSE 'submitted' END,
           'TANQ Migration', COALESCE(s.submitted_at, NOW()),
           CASE
             WHEN r.date_reviewed ~ '^\d{4}-\d{2}-\d{2}$' THEN r.date_reviewed::date::timestamptz
             WHEN NULLIF(TRIM(r.date_reviewed), '') IS NOT NULL THEN NOW()
             ELSE NULL
           END
    FROM reviews r
    JOIN submissions s ON s.id = r.submission_id
    JOIN review_rounds rr ON rr.submission_id = r.submission_id AND rr.round_number = 1
    WHERE NOT EXISTS (
      SELECT 1
      FROM review_assignments ra
      WHERE ra.review_round_id = rr.id
        AND LOWER(TRIM(ra.reviewer_email)) = LOWER(TRIM(r.reviewer_email))
    )
    ORDER BY r.submission_id, LOWER(TRIM(r.reviewer_email)), r.id DESC;
  `;
  await sql`
    INSERT INTO review_reports (
      submission_id, review_round_id, assignment_id, recommendation, score,
      comments_to_author, submitted_by_name, submitted_at
    )
    SELECT DISTINCT ON (ra.id)
           ra.submission_id, ra.review_round_id, ra.id, r.recommendation, r.score,
           r.comments, r.reviewer_name,
           CASE
             WHEN r.date_reviewed ~ '^\d{4}-\d{2}-\d{2}$' THEN r.date_reviewed::date::timestamptz
             ELSE NOW()
           END
    FROM review_assignments ra
    JOIN reviews r
      ON r.submission_id = ra.submission_id
     AND LOWER(TRIM(r.reviewer_email)) = LOWER(TRIM(ra.reviewer_email))
    WHERE NULLIF(TRIM(r.date_reviewed), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM review_reports rp WHERE rp.assignment_id = ra.id
      )
    ORDER BY ra.id, r.id DESC;
  `;

  console.log('Creating initial audit events for legacy case files...');
  await sql`
    INSERT INTO submission_events (
      submission_id, sequence_number, event_type, actor_name, actor_role,
      to_stage, summary, payload, previous_hash, event_hash, created_at
    )
    SELECT s.id, 1, 'legacy_history_imported', 'TANQ Migration', 'system',
           s.current_stage,
           'Legacy submission imported; activity before this event may be incomplete.',
           jsonb_build_object('legacy_file_path_present', s.file_path <> ''),
           NULL,
           encode(sha256(
             convert_to(
               s.id::text || '|1|legacy_history_imported|' ||
               COALESCE(s.current_stage, '') || '|TANQ Migration',
               'UTF8'
             )
           ), 'hex'),
           COALESCE(s.submitted_at, NOW())
    FROM submissions s
    WHERE NOT EXISTS (
      SELECT 1 FROM submission_events e WHERE e.submission_id = s.id
    );
  `;

  console.log('Protecting immutable evidence tables from update/delete...');
  await sql`
    CREATE OR REPLACE FUNCTION prevent_immutable_case_file_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_TABLE_NAME = 'document_versions' AND TG_OP = 'UPDATE'
      THEN
        IF OLD.legacy_import = TRUE
           AND OLD.sha256 IS NULL
           AND NEW.sha256 IS NOT NULL
           AND (
             to_jsonb(NEW) - ARRAY['sha256','size_bytes','etag','content_type','blob_pathname']::text[]
           ) = (
             to_jsonb(OLD) - ARRAY['sha256','size_bytes','etag','content_type','blob_pathname']::text[]
           )
        THEN
          RETURN NEW;
        END IF;
      END IF;
      RAISE EXCEPTION 'immutable case-file records cannot be updated or deleted';
    END;
    $$;
  `;
  for (const table of [
    'document_versions',
    'review_reports',
    'review_addenda',
    'review_report_releases',
    'editorial_decisions',
    'submission_events',
    'evidence_share_accesses',
    'integrity_checks',
  ]) {
    await sql.query(`DROP TRIGGER IF EXISTS protect_immutable_rows ON ${table}`);
    await sql.query(`
      CREATE TRIGGER protect_immutable_rows
      BEFORE UPDATE OR DELETE ON ${table}
      FOR EACH ROW EXECUTE FUNCTION prevent_immutable_case_file_mutation()
    `);
  }

  console.log('\n✅ Migration complete! Database tables verified and updated.\n');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
