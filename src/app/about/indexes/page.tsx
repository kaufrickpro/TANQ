import type { Metadata } from 'next';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Indexes',
  description: 'Public journal listings and article discovery records for African Nexus Quarterly.',
  alternates: { canonical: '/about/indexes' },
};

const services = [
  {
    name: 'Zenodo',
    href: 'https://zenodo.org/records/20687751',
    image: '/images/indexes/zenodo.jpg',
    width: 150,
    height: 60,
    description: 'Archived full text and DOI record for a published ANQ article.',
  },
  {
    name: 'Google Scholar',
    href: 'https://scholar.google.com/citations?user=YSZmFVUAAAAJ&hl=tr',
    image: '/images/indexes/google-scholar.png',
    width: 125,
    height: 49,
    description: 'ANQ journal profile on Google Scholar.',
  },
  {
    name: 'ROAD (Directory of Open Access Scholarly Resources)',
    href: 'https://publishers.issn.org/resource/ISSN/3108-7949',
    image: '/images/indexes/road.jpg',
    width: 125,
    height: 38,
    description: 'Confirmed ISSN record listing ANQ in ROAD.',
  },
  {
    name: 'OpenAIRE',
    href: 'https://explore.openaire.eu/search/result?pid=10.5281/zenodo.20687751',
    image: '/images/indexes/openaire.png',
    width: 175,
    height: 63,
    description: 'Discovery record for a published ANQ article.',
  },
  {
    name: 'DataCite Commons',
    href: 'https://commons.datacite.org/doi.org/10.5281/zenodo.20687751',
    image: '/images/indexes/datacite-commons.png',
    width: 185,
    height: 57,
    description: 'DOI metadata record for a published ANQ article.',
  },
];

export default function Indexes() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Indexes
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          Find ANQ&apos;s public journal profiles, ISSN listing, and published article records through the services below. Article record links show specific publications.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((service) => (
          <article key={service.name} className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-4">
            <div className="h-16 flex items-center">
              <Image
                src={service.image}
                alt={`${service.name} logo`}
                width={service.width}
                height={service.height}
                className="max-h-16 w-auto object-contain"
              />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif font-bold text-sm text-text-heading">
                <a
                  href={service.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1.5 text-link hover:text-link-hover hover:underline transition-colors"
                >
                  <span>{service.name}</span>
                  <ExternalLink size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                </a>
              </h3>
              <p className="text-xs text-text-muted leading-relaxed font-serif">{service.description}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
