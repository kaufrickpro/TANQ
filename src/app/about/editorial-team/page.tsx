import React from 'react';

export default function EditorialTeam() {
  const editorialRoles = [
    {
      title: 'Chief Editor',
      members: [
        { name: 'Prof. Dr. İbrahim Hakan Karataş', institution: 'Istanbul Medeniyet University, Türkiye' }
      ]
    },
    {
      title: 'Assistant Editor',
      members: [
        { name: 'Dr. Huzaife Abdallah', institution: 'Cavendish University, Uganda' }
      ]
    },
    {
      title: 'Section Editors',
      members: [
        { role: 'Politics and Diplomacy', name: 'Prof. Dr. İsmail Ermağan', institution: 'İstanbul Medeniyet University, Türkiye' },
        { role: 'Economics and Trade', name: 'Dr. Zaid Sekito', institution: 'Makerere University, Uganda' },
        { role: 'Social and Cultural Studies', name: 'Dr. Hawa Kasula', institution: 'Makerere University, Uganda' },
        { role: 'Environmental Studies and Sustainability', name: 'Dr. Charles Kayasanku', institution: 'Makerere University, Uganda' },
        { role: 'Education and Human Development', name: 'Dr. Alfred Buluma', institution: 'Makerere University, Uganda' },
        { role: 'Technology and AI', name: 'Dr. Serkan Uçan', institution: 'İstanbul Medeniyet University, Türkiye' },
        { role: 'Public Health and Climate Change', name: 'Prof. Dr. Tunç Kutoğlu', institution: 'İstanbul Medeniyet University, Türkiye' }
      ]
    },
    {
      title: 'International Advisory Board',
      members: [
        { name: 'Prof. Anthony Muwagga Mugaga', institution: 'Makerere University, Uganda' },
        { name: 'Prof. Dr. Abu Bakarr Bah', institution: 'Northern Illinois University, USA' },
        { name: 'Prof. Dr. İsmail Ermağan', institution: 'İstanbul Medeniyet University, Türkiye' },
        { name: 'Prof. Dr. Laban Ayiro', institution: 'Daystar University, Kenya' }
      ]
    },
    {
      title: 'Peer Review Board',
      members: [
        { name: 'Dr. Feride Öksüz Gül', institution: 'İstanbul Medeniyet University, Türkiye' },
        { name: 'Doç. Dr. Ömer Avcı', institution: 'İstanbul Medeniyet University, Türkiye' },
        { name: 'Doç. Dr. Mithat Korumaz', institution: 'Yıldız Technical University, Türkiye' },
        { name: 'Dr. Cherno Jallow', institution: 'University of the Gambia, The Gambia' },
        { name: 'Dr. Bubacar Malang Fatty', institution: 'University of the Gambia, The Gambia' },
        { name: 'Dr. Rodrigue Bazame', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso' },
        { name: 'Dr. Abdramane Bassiahi SOURA', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso' },
        { name: 'Dr. Georges Guiella', institution: 'Université Pr Joseph KI-ZERBO, Burkina Faso' }
      ]
    },
    {
      title: 'Editorial & Support Staff',
      members: [
        { role: 'Language Editor', name: 'Pamela Atukundire', institution: 'Uganda' },
        { role: 'Academic Secretariat', name: 'Janeth Kilasi', institution: 'Tanzania' },
        { role: 'Academic Secretariat', name: 'Ashwag Mohammad Salih Mohammad', institution: 'SUST, Sudan' },
        { role: 'Technical Support', name: 'Nurgün Varol', institution: 'Türkiye' },
        { role: 'Technical Support', name: 'Zahraa Adam Abdalla', institution: 'SUST, Sudan' }
      ]
    }
  ];

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Editorial Board
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          The editorial board of <em>The African Nexus Quarterly</em> comprises distinguished scholars and researchers from institutions across Africa and Türkiye, guiding the academic standards and vision of the journal.
        </p>
      </div>

      <div className="space-y-8 font-sans">
        {editorialRoles.map((section) => (
          <div key={section.title} className="space-y-3">
            <h3 className="font-serif font-bold text-base text-text-heading border-b border-border-light pb-1.5 uppercase tracking-wide">
              {section.title}
            </h3>
            <div className="bg-bg-card border border-border-custom shadow-sm overflow-x-auto">
              <table className="min-w-full divide-y divide-border-custom">
                <thead className="bg-sand/30 font-bold uppercase tracking-wider text-[10px] text-text-muted">
                  <tr>
                    {section.members[0] && 'role' in section.members[0] && (
                      <th className="px-6 py-3 text-left">
                        Role / Area
                      </th>
                    )}
                    <th className="px-6 py-3 text-left">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left">
                      Institution / Country
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-bg-card divide-y divide-border-light text-xs text-text-primary">
                  {section.members.map((m, idx) => (
                    <tr key={idx} className={idx % 2 === 1 ? 'bg-sand/10' : ''}>
                      {'role' in m && (
                        <td className="px-6 py-3.5 whitespace-nowrap font-bold text-[11px] uppercase tracking-wider text-text-muted">
                          {m.role}
                        </td>
                      )}
                      <td className="px-6 py-3.5 whitespace-nowrap font-serif font-bold">
                        {m.name}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap font-serif text-text-muted">
                        {m.institution}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
