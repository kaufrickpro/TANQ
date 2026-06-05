import { loadEnvConfig } from '@next/env';
import { sql } from '@vercel/postgres';

loadEnvConfig(process.cwd());

const issue = {
  volume: 1,
  number: 1,
  year: 2026,
  month: 'March',
  title: 'The African Nexus Quarterly, Volume 1 Issue 1',
  issuePdfUrl: null as string | null
};

const volume = {
  volume: 1,
  year: 2026,
  title: 'The African Nexus Quarterly, Volume 1',
  subtitle: 'Issue 01 · March 2026',
  pdfUrl: '/volumes/TANQ-Volume-1-2026.pdf'
};

const articles = [
  {
    title: 'Editorial: Why The African Nexus Quarterly?',
    authors: 'İbrahim Hakan Karataş',
    abstract:
      'African Nexus Quarterly introduces an Africa-centered editorial lens hosted in Türkiye and oriented to the continent’s priorities. It argues for a scholarly platform that helps correct asymmetries in how knowledge about Africa is produced, validated, indexed, and circulated.',
    keywords: 'African studies, knowledge production, scholarly publishing, open access, research capacity',
    doi: '',
    pages: '1-6',
    pdfUrl: '/articles/01_TANQ-Editorial.pdf',
    type: 'Editorial',
    datePublished: '2026-03-01'
  },
  {
    title:
      "Bridging the Gaps: Enhancing Teachers' Proficiency in Marking and Feedback Practices for Uganda's Competency-Based Curriculum",
    authors: 'Charles Kyasanku; Rose Costa Nakawuki',
    abstract:
      "Uganda's Competency-Based Curriculum aims to equip learners with 21st-century skills through learner-centred teaching, formative assessments, and criterion-referenced evaluation. This qualitative multiple-case study examines teachers' proficiency in marking and feedback practices in two public lower secondary schools in Mpigi District, revealing systemic gaps in marking methods, rubric use, feedback quality, training, resources, and class size.",
    keywords:
      'Competency-based curriculum, formative assessment, teacher proficiency, marking and feedback, formative assessment literacy',
    doi: '10.58737/saj.2026.01.0042',
    pages: '1-18',
    pdfUrl: '/articles/02_TANQ-Bridging the Gaps_.pdf',
    type: 'Research Article',
    datePublished: '2026-03-01'
  },
  {
    title: "Women's Participation in Peace and Security Efforts in East Africa: Challenges and Opportunities",
    authors: 'Busuulwa Huthaifah Abdallah; Charlotte Karungi Mafumbo; Harriet Ariko Akiror',
    abstract:
      'This paper examines progress and gaps in women’s participation in political leadership and security sector integration across East African Community partner states. Drawing on National Action Plans, regional action plans, and key informant interviews, it argues for a more intentional and coordinated regional approach to gender-responsive security sector reform and inclusive governance.',
    keywords: 'participation, prevention, protection, relief and recovery, women, peace, security',
    doi: '10.58737/saj.2026.01.0042',
    pages: '1-11',
    pdfUrl: '/articles/03_TANQ-WPS article.pdf',
    type: 'Research Article',
    datePublished: '2026-03-01'
  },
  {
    title:
      'Symbolic Inclusion or Structural Institutionalisation? Indigenous Knowledge Systems and Curriculum Reform in Tanzanian Higher Education',
    authors: 'Janeth Kilasi; Irene Etumaro',
    abstract:
      'This qualitative case study investigates the integration of Indigenous Knowledge Systems within the curriculum of St. Augustine University of Tanzania. Guided by the Quintuple Helix Model, it distinguishes between symbolic inclusion and structural institutionalisation, arguing that meaningful decolonisation requires systemic curriculum redesign rather than discretionary incorporation.',
    keywords:
      'Indigenous Knowledge Systems, curriculum decolonisation, knowledge democracy, structural institutionalisation, African higher education',
    doi: '',
    pages: '1-15',
    pdfUrl: '/articles/04_TANQ-Symbolic inclusions.pdf',
    type: 'Research Article',
    datePublished: '2026-03-01'
  },
  {
    title:
      'Institutional Commitment vs. Capacity: Comprehensive Internationalisation Practices at Istanbul Medeniyet University',
    authors: 'İbrahim Hakan Karataş',
    abstract:
      'This study investigates how İstanbul Medeniyet University interprets and implements internationalisation strategies in alignment with national policy and global trends. Using institutional self-assessment documents, a comprehensive internationalisation rubric, and interviews with senior academic leaders, it finds strong strategic commitment but limited operational coherence in curriculum integration, faculty engagement, and mobility support.',
    keywords:
      'Comprehensive internationalisation, higher education, Türkiye, institutional capacity, academic leadership, İstanbul Medeniyet University',
    doi: '',
    pages: '1-15',
    pdfUrl: '/articles/05_TANQ-IMU-Strategies.pdf',
    type: 'Research Article',
    datePublished: '2026-03-01'
  }
];

async function restoreVolume() {
  const existing = await sql`
    SELECT id
    FROM journal_volumes
    WHERE volume = ${volume.volume} AND year = ${volume.year}
    LIMIT 1
  `;

  if (existing.rows[0]) {
    await sql`
      UPDATE journal_volumes
      SET title = ${volume.title}, subtitle = ${volume.subtitle}, pdf_url = ${volume.pdfUrl}
      WHERE id = ${existing.rows[0].id}
    `;
    return existing.rows[0].id as number;
  }

  const inserted = await sql`
    INSERT INTO journal_volumes (volume, year, title, subtitle, pdf_url)
    VALUES (${volume.volume}, ${volume.year}, ${volume.title}, ${volume.subtitle}, ${volume.pdfUrl})
    RETURNING id
  `;
  return inserted.rows[0].id as number;
}

async function restoreIssue() {
  const existing = await sql`
    SELECT id
    FROM issues
    WHERE volume = ${issue.volume} AND number = ${issue.number} AND year = ${issue.year}
    LIMIT 1
  `;

  if (existing.rows[0]) {
    await sql`
      UPDATE issues
      SET month = ${issue.month},
          title = ${issue.title},
          issue_pdf_url = ${issue.issuePdfUrl},
          is_published = 1
      WHERE id = ${existing.rows[0].id}
    `;
    return existing.rows[0].id as number;
  }

  const inserted = await sql`
    INSERT INTO issues (volume, number, year, month, title, issue_pdf_url, is_published)
    VALUES (${issue.volume}, ${issue.number}, ${issue.year}, ${issue.month}, ${issue.title}, ${issue.issuePdfUrl}, 1)
    RETURNING id
  `;
  return inserted.rows[0].id as number;
}

async function restoreArticle(issueId: number, article: (typeof articles)[number]) {
  const existing = await sql`
    SELECT id
    FROM articles
    WHERE issue_id = ${issueId} AND pdf_url = ${article.pdfUrl}
    LIMIT 1
  `;

  if (existing.rows[0]) {
    await sql`
      UPDATE articles
      SET title = ${article.title},
          authors = ${article.authors},
          abstract = ${article.abstract},
          keywords = ${article.keywords},
          doi = ${article.doi},
          pages = ${article.pages},
          type = ${article.type},
          date_published = ${article.datePublished}
      WHERE id = ${existing.rows[0].id}
    `;
    return existing.rows[0].id as number;
  }

  const inserted = await sql`
    INSERT INTO articles (issue_id, title, authors, abstract, keywords, doi, pages, pdf_url, type, date_published)
    VALUES (
      ${issueId},
      ${article.title},
      ${article.authors},
      ${article.abstract},
      ${article.keywords},
      ${article.doi},
      ${article.pages},
      ${article.pdfUrl},
      ${article.type},
      ${article.datePublished}
    )
    RETURNING id
  `;
  return inserted.rows[0].id as number;
}

async function main() {
  const volumeId = await restoreVolume();
  const issueId = await restoreIssue();
  const articleIds = [];

  for (const article of articles) {
    articleIds.push(await restoreArticle(issueId, article));
  }

  console.log(`Restored volume ${volumeId}, issue ${issueId}, and ${articleIds.length} articles.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
