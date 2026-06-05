import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function migrate() {
  console.log('🚀 Running TANQ database migration...\n');
  const { sql } = await import('@vercel/postgres');

  // ── Tables ────────────────────────────────────────────────────────────────

  console.log('Creating table: users');
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('admin', 'reviewer', 'author'))
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

  console.log('\nSeeding users...');
  await sql`
    INSERT INTO users (username, password_hash, name, email, role) VALUES
      ('editor',   'editor123',   'Prof. Dr. İbrahim Hakan Karataş', 'editor@okulyoneticileri.org.tr', 'admin'),
      ('reviewer', 'reviewer123', 'Dr. Alfred Buluma',               'reviewer@makerere.ac.ug',        'reviewer'),
      ('author',   'author123',   'Janeth Kilasi',                   'author@tanzania.org',            'author')
    ON CONFLICT (username) DO NOTHING;
  `;

  console.log('Seeding issues + articles...');
  const issueResult = await sql`
    INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
    VALUES (1, 1, 2026, 'March', 'Volume 1 Issue 1 – March 2026', NULL, 1)
    ON CONFLICT DO NOTHING
    RETURNING id;
  `;

  // Only seed articles if the issue was freshly inserted
  if (issueResult.rows.length > 0) {
    const issueId = issueResult.rows[0].id;

    await sql`
      INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published)
      VALUES
        (
          ${issueId},
          'Why The African Nexus Quarterly?',
          'Prof. Dr. İbrahim Hakan Karataş',
          'African Nexus Quarterly''s core wager is that an Africa-centered editorial lens—hosted in Türkiye yet oriented to the continent''s priorities—can help correct enduring asymmetries in how knowledge about Africa is produced, validated, indexed, and circulated.',
          'African Nexus, knowledge production, R&D capacity, global publishing, Türkiye-Africa relations',
          '10.58737/saj.2026.01.0041',
          '1-6',
          '/articles/01_TANQ-Editorial.pdf',
          'Editorial',
          '2026-03-01'
        ),
        (
          ${issueId},
          'Bridging the Gaps: Enhancing Teachers'' Proficiency in Marking and Feedback Practices for Uganda''s Competency-Based Curriculum',
          'Charles Kyasanku, Rose Costa Nakawuki',
          'Uganda''s Competency-Based Curriculum (CBC), introduced in 2020, aims to equip learners with 21st-century skills through learner-centred teaching, formative assessments, and criterion-referenced evaluation.',
          'Competency-based curriculum, formative assessment, teacher proficiency, marking and feedback, formative assessment literacy',
          '10.58737/saj.2026.01.0042',
          '1-18',
          '/articles/02_TANQ-Bridging the Gaps_.pdf',
          'Research Article',
          '2026-03-01'
        ),
        (
          ${issueId},
          'Women''s Participation in Peace and Security Efforts in East Africa: Challenges and Opportunities',
          'Busuulwa Huthaifah Abdallah, Charlotte Karungi Mafumbo, Harriet Ariko Akiror',
          'This paper examines the progress and gaps in women''s participation in political leadership and security sector integration across the East African Community partner states.',
          'participation, prevention, protection, relief and recovery, Women, Peace, Security, East Africa',
          '10.58737/saj.2026.01.0043',
          '1-11',
          '/articles/03_TANQ-WPS article.pdf',
          'Research Article',
          '2026-03-01'
        ),
        (
          ${issueId},
          'Symbolic Inclusion or Structural Institutionalisation? Indigenous Knowledge Systems and Curriculum Reform in Tanzanian Higher Education',
          'Janeth Kilasi, Irene Etumaro',
          'Across Africa, universities increasingly endorse Indigenous Knowledge Systems (IKS) as central to decolonising higher education.',
          'Indigenous Knowledge Systems, IKS, curriculum reform, higher education, Tanzania, decolonisation',
          '10.58737/saj.2026.01.0044',
          '1-15',
          '/articles/04_TANQ-Symbolic inclusions.pdf',
          'Research Article',
          '2026-03-01'
        ),
        (
          ${issueId},
          'Institutional Commitment vs. Capacity: Comprehensive Internationalisation Practices at Istanbul Medeniyet University',
          'İbrahim Hakan Karataş',
          'This study investigates how a newly established Turkish public university, İstanbul Medeniyet University (IMU), interprets and implements internationalisation strategies in alignment with national policy and global trends.',
          'Comprehensive internationalisation, higher education, Türkiye, institutional capacity, academic leadership, İstanbul Medeniyet University',
          '10.58737/saj.2026.01.0045',
          '1-15',
          '/articles/05_TANQ-IMU-Strategies.pdf',
          'Research Article',
          '2026-03-01'
        );
    `;
  } else {
    console.log('  ↳ Issues already exist, skipping article seed.');
  }

  console.log('Seeding journal_volumes...');
  await sql`
    INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
    VALUES (1, 2026, 'The African Nexus Quarterly, Volume 1', 'March 2026 inaugural volume', NULL)
    ON CONFLICT (volume, year) DO NOTHING;
  `;

  console.log('\n✅ Migration complete! All tables created and seeded.\n');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
