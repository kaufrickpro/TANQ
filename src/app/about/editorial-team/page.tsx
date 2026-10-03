import React from 'react';

interface BoardMember {
  role?: string;
  name: string;
  institution: string;
  orcid?: string;
}

interface BoardSection {
  title: string;
  showOrcid: boolean;
  members: BoardMember[];
}

const editorialRoles: BoardSection[] = [
  {
    title: 'Editor-in-Chief',
    showOrcid: true,
    members: [
      { name: 'Prof. Dr. İbrahim Hakan Karataş', institution: 'İstanbul Medeniyet University, Türkiye', orcid: '0000-0001-5569-014X' },
    ],
  },
  {
    title: 'Section Editors',
    showOrcid: true,
    members: [
      { role: 'Politics & Economics', name: 'Dr. Bubacar Malang Fatty', institution: 'University of the Gambia, The Gambia', orcid: '0000-0003-3321-0736' },
      { role: 'Social & Cultural', name: 'Dr. Peter Yidana', institution: 'C. K. Tedam University of Technology and Applied Sciences, Ghana', orcid: '0000-0003-4060-4557' },
      { role: 'Environment & Sustainability', name: 'Dr. Rodrigue Bazame', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso', orcid: '0000-0002-0105-8736' },
      { role: 'Education & Human Development', name: 'Dr. Ömer Avcı', institution: 'İstanbul Medeniyet University, Türkiye', orcid: '0000-0002-5272-2414' },
      { role: 'Technology & AI', name: 'Dr. Serkan Uçan', institution: 'İstanbul Medeniyet University, Türkiye', orcid: '0000-0002-3639-3171' },
      { role: 'Health & Medicine', name: 'Dr. Abdramane Bassiahi Soura', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso', orcid: '0000-0002-1539-6357' },
    ],
  },
  {
    title: 'Academic Board',
    showOrcid: true,
    members: [
      { name: 'Prof. Anthony Muwagga Mugaga', institution: 'Makerere University, Uganda', orcid: '0000-0001-7190-2819' },
      { name: 'Dr. Abdishakur Tarah', institution: 'Nottingham Trent University, UK', orcid: '0009-0003-7252-6300' },
      { name: 'Dr. İsmail Ermağan', institution: 'İstanbul Medeniyet University, Türkiye', orcid: '0000-0003-1687-8208' },
      { name: 'Dr. Georges Guiella', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso', orcid: '0000-0001-8525-340X' },
      { name: 'Dr. Cherno Jallow', institution: 'University of the Gambia, The Gambia', orcid: '0000-0003-4823-5610' },
      { name: 'Dr. Mithat Korumaz', institution: 'Yıldız Technical University, Türkiye', orcid: '0000-0003-1800-7633' },
      { name: 'Dr. Feride Öksüz Gül', institution: 'İstanbul Medeniyet University, Türkiye', orcid: '0000-0002-4958-7928' },
    ],
  },
  {
    title: 'Editorial & Support Staff',
    showOrcid: false,
    members: [
      { role: 'Academic Secretariat', name: 'Hilal Karaoğlan', institution: 'Türkiye' },
      { role: 'Language Editor (English, Swahili)', name: 'Pamela Atukundire', institution: 'Uganda' },
      { role: 'Language Editor (English, Swahili)', name: 'Janeth Kilasi', institution: 'Tanzania' },
      { role: 'Language Editor (English, Arabic)', name: 'Zahraa Adam Abdalla', institution: 'SUST, Sudan' },
      { role: 'Language Editor (English, Arabic)', name: 'Ashwag Mohammad Salih Mohammad', institution: 'SUST, Sudan' },
      { role: 'Language Editor (Türkçe)', name: 'Nurgün Varol', institution: 'Türkiye' },
      { role: 'Technical Support', name: 'Nurgün Varol', institution: 'Türkiye' },
    ],
  },
];

export default function EditorialTeam() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Editorial Board
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          The editorial board of <em>African Nexus Quarterly</em> comprises scholars and researchers from institutions across Africa and Türkiye, guiding the academic standards and vision of the journal.
        </p>
      </div>

      <div className="space-y-8 font-sans">
        {editorialRoles.map((section) => {
          const showRole = section.members.some((member) => member.role);

          return (
            <section key={section.title} className="space-y-3">
              <h3 className="font-serif font-bold text-base text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
                {section.title}
              </h3>
              <div className="bg-bg-card border border-border-custom shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-border-custom">
                  <thead className="bg-sand/30 font-bold uppercase tracking-wider text-[10px] text-text-muted">
                    <tr>
                      {showRole && <th scope="col" className="px-4 sm:px-6 py-3 text-left">Role / Area</th>}
                      <th scope="col" className="px-4 sm:px-6 py-3 text-left">Name</th>
                      <th scope="col" className="px-4 sm:px-6 py-3 text-left">Institution / Country</th>
                      {section.showOrcid && <th scope="col" className="px-4 sm:px-6 py-3 text-left">ORCID iD</th>}
                    </tr>
                  </thead>
                  <tbody className="bg-bg-card divide-y divide-border-light text-xs text-text-primary">
                    {section.members.map((member, index) => (
                      <tr key={`${member.name}-${member.role ?? ''}`} className={index % 2 === 1 ? 'bg-sand/10' : ''}>
                        {showRole && (
                          <td className="px-4 sm:px-6 py-3.5 font-bold text-[11px] uppercase tracking-wider text-text-muted">
                            {member.role}
                          </td>
                        )}
                        <td className="px-4 sm:px-6 py-3.5 font-serif font-bold">{member.name}</td>
                        <td className="px-4 sm:px-6 py-3.5 font-serif text-text-muted">{member.institution}</td>
                        {section.showOrcid && (
                          <td className="px-4 sm:px-6 py-3.5 font-mono text-[11px] whitespace-nowrap">
                            <a href={`https://orcid.org/${member.orcid}`} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                              {member.orcid}
                            </a>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
