import React from 'react';

export default function AuthorGuidelines() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Author Guidelines
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          These guidelines are designed to assist authors in preparing manuscripts that meet the standards of a Scopus-indexed and TR Dizin-compliant academic publication. All submissions must adhere strictly to the American Psychological Association (APA) 7th Edition style.
        </p>
      </div>

      <div className="space-y-6 text-text-primary leading-relaxed text-sm font-serif">
        {/* Principles */}
        <section className="space-y-3">
          <h3 className="text-lg font-serif font-bold text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
            1. General Principles
          </h3>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Originality:</strong> Manuscripts must be original, unpublished, and not under consideration for publication elsewhere.</li>
            <li><strong>Language:</strong> Submissions must be written in clear and concise English.</li>
            <li><strong>Anonymity:</strong> For the double-blind peer-review process, the manuscript must not contain any author-identifying information (e.g., names, affiliations) within the main text, figures, or tables. Details should be provided on a separate Title Page.</li>
            <li><strong>AI and Generative Tools:</strong> Authors must explicitly disclose the use of AI tools in the preparation of the manuscript, including the nature and extent of their use, in the Materials and Methods or a similar section of the paper.</li>
          </ul>
        </section>

        {/* Structure */}
        <section className="space-y-3">
          <h3 className="text-lg font-serif font-bold text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
            2. Manuscript Structure
          </h3>
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider">
            Manuscripts must be structured as follows:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Title Page (Separate):</strong> Full title, all author names and institutional affiliations, contact information for the corresponding author, and ORCID IDs.</li>
            <li><strong>Abstract:</strong> A concise and factual abstract of 150-250 words stating the research purpose, methodology, main findings, and major conclusions.</li>
            <li><strong>Keywords:</strong> 4 to 6 keywords immediately following the abstract.</li>
            <li><strong>Main Body:</strong> Must be less than 8,000 words (including references, appendixes, tables, and figures).
              <ul className="list-circle pl-5 mt-1.5 text-text-muted space-y-1">
                <li><em>Introduction:</em> Define the problem, significance, literature review, and research aims.</li>
                <li><em>Methodology:</em> Detailed design, data sources, sample, and procedures.</li>
                <li><em>Results:</em> Clear presentation of findings without interpretation.</li>
                <li><em>Discussion:</em> Interpret results, implications, and limitations.</li>
                <li><em>Conclusion:</em> Summary of main contributions.</li>
              </ul>
            </li>
          </ul>
        </section>

        {/* Style */}
        <section className="space-y-3">
          <h3 className="text-lg font-serif font-bold text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
            3. Formatting and Style (APA 7th Edition)
          </h3>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Font:</strong> Use a legible font such as 12-point Times New Roman, 11-point Calibri, or 11-point Arial.</li>
            <li><strong>Spacing:</strong> Double-space all text, including headings, quotations, and the reference list.</li>
            <li><strong>Margins:</strong> 1-inch margins on all sides.</li>
            <li><strong>In-text Citations:</strong> Author-date system. Use Smith & Jones (2021) for 1-2 authors, and Lee et al. (2022) for 3+ authors. Provide page numbers for all direct quotations.</li>
            <li><strong>References:</strong> Alphabetical order by first author's last name, with hanging indent. All in-text citations must match reference entries. Include DOIs where available.</li>
          </ul>
        </section>

        {/* Copyright and Licensing */}
        <section className="space-y-3">
          <h3 className="text-lg font-serif font-bold text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
            4. Copyright and Licensing
          </h3>
          <p>
            Authors retain copyright of their articles published in African Nexus Quarterly. By submitting and publishing in the journal, authors grant the journal the right of first publication.
          </p>
          <p>
            All articles are published under the Creative Commons Attribution 4.0 International (CC BY 4.0) licence. Under this licence, anyone may copy, distribute, remix, adapt, and build upon the material for any purpose, including commercial purposes, provided appropriate credit is given to the original author(s) and the journal.
          </p>
          <p>
            The full licence text is available at:{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:text-link-hover hover:underline transition-colors break-all"
            >
              https://creativecommons.org/licenses/by/4.0/
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
