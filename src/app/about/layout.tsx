'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { name: 'Overview', href: '/about' },
    { name: 'Editorial Board', href: '/about/editorial-team' },
    { name: 'Author Guidelines', href: '/about/author-guidelines' },
    { name: 'Publication Ethics', href: '/about/publication-ethics' },
    { name: 'Open Access Policy', href: '/about/open-access' },
    { name: 'Submissions', href: '/about/submissions' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-bg-page font-serif">
      {/* Charcoal Header Band */}
      <div className="w-full bg-bg-band text-text-on-dark py-4 text-center border-b border-border-custom font-lato">
        <span className="font-lato font-black text-xs uppercase tracking-[0.18em]">
          About the Journal
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border-custom bg-bg-page">
        <div className="max-w-[1120px] mx-auto px-6 sm:px-8">
          <div className="flex flex-wrap -mb-px pt-4 gap-x-6 gap-y-2">
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <Link
                  key={tab.name}
                  href={tab.href}
                  className={`font-lato font-bold text-xs uppercase tracking-[0.15em] pb-3 transition-colors ${
                    isActive
                      ? 'text-text-heading border-b-2 border-olive font-black'
                      : 'text-text-muted hover:text-text-heading'
                  }`}
                >
                  {tab.name}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="py-12 max-w-[1120px] mx-auto w-full px-6 sm:px-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-start">
          
          {/* Left Column: Content (8 cols) */}
          <main className="lg:col-span-8 space-y-8 max-w-[62ch]">
            {children}
          </main>

          {/* Right Column: Sidebars (4 cols) */}
          <aside className="lg:col-span-4 space-y-8">
            
            {/* Quick Facts Panel */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Quick Facts
              </h3>
              <div className="space-y-3 font-serif text-xs text-text-primary">
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">ISSN (Online)</span>
                  <span>3108-7949</span>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Frequency</span>
                  <span>Quarterly (4 issues per year)</span>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Language</span>
                  <span>English</span>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Access</span>
                  <span>Diamond Open Access (No APCs / submission fees)</span>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Publisher</span>
                  <span>Okul Yöneticileri Derneği (School Administrators Association)</span>
                </div>
              </div>
            </div>

            {/* Contact Panel */}
            <div className="bg-bg-card border border-border-custom p-6 shadow-sm">
              <h3 className="font-sans font-bold text-xs uppercase tracking-[0.15em] text-text-heading border-b border-border-light pb-3 mb-4">
                Contact
              </h3>
              <div className="space-y-3 font-serif text-xs text-text-primary">
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Email</span>
                  <a href="mailto:info@okulyoneticileri.org.tr" className="text-link hover:text-link-hover hover:underline transition-colors break-all">
                    info@okulyoneticileri.org.tr
                  </a>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Website</span>
                  <a href="http://okulyoneticileri.org.tr" target="_blank" rel="noopener noreferrer" className="text-link hover:text-link-hover hover:underline transition-colors break-all">
                    okulyoneticileri.org.tr
                  </a>
                </div>
                <div>
                  <span className="font-bold text-[10px] font-sans uppercase tracking-wider block text-text-muted">Address</span>
                  <span>Üsküdar, Istanbul, Türkiye</span>
                </div>
              </div>
            </div>
            
          </aside>

        </div>
      </div>
    </div>
  );
}
