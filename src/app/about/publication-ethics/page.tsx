import React from 'react';
import { ShieldCheck, UserCheck, AlertTriangle, Scale } from 'lucide-react';

export default function PublicationEthics() {
  const ethicsPoints = [
    {
      title: 'Plagiarism & Duplication',
      description: 'The journal uses dedicated plagiarism detection software. All submissions must represent original, unpublished work. Duplicate submission or self-plagiarism will result in immediate rejection.',
      icon: <AlertTriangle className="text-olive" size={20} />
    },
    {
      title: 'Authorship Criteria',
      description: 'All individuals listed as authors must have made a substantial intellectual contribution to the research design, execution, or interpretation. Artificial intelligence tools cannot be listed as authors.',
      icon: <UserCheck className="text-olive" size={20} />
    },
    {
      title: 'Conflicts of Interest',
      description: 'Authors must disclose any financial, personal, or institutional relationships that could be perceived as influencing or biasing the study’s findings.',
      icon: <Scale className="text-olive" size={20} />
    },
    {
      title: 'AI and Generative Tools',
      description: 'Authors must disclose in their manuscript if AI tools (e.g., ChatGPT) were used in draft preparation. The nature of their use must be explicitly described in the methodology section.',
      icon: <ShieldCheck className="text-olive" size={20} />
    }
  ];

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Publication Ethics
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          <em>African Nexus Quarterly</em> is committed to upholding the highest standards of publication ethics and academic integrity. We follow the guidelines established by the Committee on Publication Ethics (COPE) and require all authors, reviewers, and editors to comply with these ethical standards.
        </p>
      </div>

      {/* Grid of ethics points */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
        {ethicsPoints.map((pt) => (
          <div key={pt.title} className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="bg-sand/30 p-2.5 rounded-sm border border-border-light text-olive inline-block">
                {pt.icon}
              </div>
              <h3 className="font-serif font-bold text-sm text-text-primary">{pt.title}</h3>
              <p className="text-xs text-text-muted leading-relaxed font-serif">{pt.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reviewer responsibilities */}
      <div className="bg-bg-card border border-border-custom p-6 space-y-4 shadow-sm font-sans">
        <h3 className="font-serif font-bold text-sm text-text-heading border-b border-border-light pb-2 mb-1 uppercase tracking-wide">
          Reviewer Responsibilities
        </h3>
        <ul className="list-disc pl-5 space-y-2 font-serif text-xs text-text-primary">
          <li><strong>Confidentiality:</strong> Reviewers must treat manuscripts as confidential documents and not share them with others.</li>
          <li><strong>Objectivity:</strong> Reviewers must complete evaluations objectively, supporting their recommendations with clear arguments.</li>
          <li><strong>Conflict Disclosure:</strong> Reviewers must notify the editor and decline invitations if they have a conflict of interest due to competitive, collaborative, or other connections with authors or institutions.</li>
        </ul>
      </div>
    </div>
  );
}
