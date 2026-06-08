import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white/70 py-12 font-lato mt-auto border-t border-border-custom">
      <div className="max-w-[1120px] mx-auto px-6 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-start">
          {/* Column 1: Publisher Info */}
          <div className="md:col-span-6 space-y-4">
            <div className="flex items-center">
              <Image 
                src="/images/ANQ-Logo-Footer-v2.png" 
                alt="ANQ Logo" 
                width={100} 
                height={36} 
                className="object-contain" 
              />
            </div>
            <p className="text-xs max-w-md leading-relaxed font-serif">
              An interdisciplinary, peer-reviewed international academic journal dedicated to expanding knowledge democracy, structural curriculum transformations, and developmental partnerships concerning the African continent.
            </p>
            <div className="text-xs space-y-1 font-serif">
              <p><strong>Published by:</strong> Okul Yöneticileri Derneği (School Administrators Association)</p>
              <p><strong>Website:</strong> <a href="http://www.okulyoneticileri.org.tr" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">www.okulyoneticileri.org.tr</a></p>
              <p><strong>Email:</strong> <a href="mailto:info@okulyoneticileri.org.tr" className="underline hover:text-white transition-colors">info@okulyoneticileri.org.tr</a></p>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="md:col-span-3 space-y-4">
            <h4 className="font-bold text-white text-xs uppercase tracking-[0.15em] border-b border-white/10 pb-2">Quick Links</h4>
            <ul className="text-xs space-y-2.5 font-bold uppercase tracking-[0.1em]">
              <li><Link href="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link href="/current" className="hover:text-white transition-colors">Current Issue</Link></li>
              <li><Link href="/archives" className="hover:text-white transition-colors">Archives</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About the Journal</Link></li>
              <li><Link href="/about/submissions" className="hover:text-white transition-colors">Submissions</Link></li>
            </ul>
          </div>

          {/* Column 3: Policies */}
          <div className="md:col-span-3 space-y-4">
            <h4 className="font-bold text-white text-xs uppercase tracking-[0.15em] border-b border-white/10 pb-2">Policies</h4>
            <ul className="text-xs space-y-2.5 font-bold uppercase tracking-[0.1em]">
              <li><Link href="/about/author-guidelines" className="hover:text-white transition-colors">Author Guidelines</Link></li>
              <li><Link href="/about/publication-ethics" className="hover:text-white transition-colors">Publication Ethics</Link></li>
              <li><Link href="/about/open-access" className="hover:text-white transition-colors">Open Access Policy</Link></li>
              <li><Link href="/about/editorial-team" className="hover:text-white transition-colors">Editorial Board</Link></li>
            </ul>
          </div>
        </div>

        {/* License & Copyright Bar */}
        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col md:flex-row justify-between items-center text-[11px] font-bold uppercase tracking-[0.15em] gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-sm flex items-center gap-1.5">
              <span className="font-sans font-bold text-[9px] bg-white/10 px-1 py-0.5 rounded-sm text-white">CC BY-NC 4.0</span>
              <span className="text-white/60">Diamond Open Access</span>
            </div>
            <p className="normal-case tracking-normal text-white/50 font-serif max-w-md text-center md:text-left text-xs leading-relaxed">
              All articles published in ANQ are licensed under a Creative Commons Attribution-NonCommercial 4.0 International License.
            </p>
          </div>
          <div className="text-right space-y-1">
            <p>ISSN: 3108-7949 · Volume 01 · Issue 01</p>
            <p className="text-[10px] text-white/40 normal-case tracking-normal font-serif">
              Cover photo by Kévin et Laurianne Langlais
            </p>
            <p className="text-[10px] text-white/40 pt-1">
              &copy; {new Date().getFullYear()} African Nexus Quarterly.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
