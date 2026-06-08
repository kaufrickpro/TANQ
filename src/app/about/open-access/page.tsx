import React from 'react';
import { Award, Eye, FileSignature, ShieldCheck } from 'lucide-react';

export default function OpenAccess() {
  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Open Access Policy
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          <em>African Nexus Quarterly</em> (ANQ) operates under a **Diamond Open Access** model. We believe in knowledge democracy and the barrier-free circulation of research findings to advance global scientific exchange.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans text-text-primary">
        <div className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-2">
          <Award className="text-olive" size={20} />
          <h3 className="font-serif font-bold text-sm text-text-primary">No Author Fees (No APCs)</h3>
          <p className="text-xs text-text-muted leading-relaxed font-serif">
            Authors are not required to pay any submission charges or Article Processing Charges (APCs). Publishing in ANQ is entirely free of cost for academic writers.
          </p>
        </div>

        <div className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-2">
          <Eye className="text-olive" size={20} />
          <h3 className="font-serif font-bold text-sm text-text-primary">Free Access for Readers</h3>
          <p className="text-xs text-text-muted leading-relaxed font-serif">
            All articles published in the journal are immediately and permanently free to read, download, print, copy, and distribute without any subscription barriers.
          </p>
        </div>

        <div className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-2">
          <FileSignature className="text-olive" size={20} />
          <h3 className="font-serif font-bold text-sm text-text-primary">Creative Commons License</h3>
          <p className="text-xs text-text-muted leading-relaxed font-serif">
            All published content is licensed under a **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license.
          </p>
        </div>

        <div className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-2">
          <ShieldCheck className="text-olive" size={20} />
          <h3 className="font-serif font-bold text-sm text-text-primary">Author Copyright Retention</h3>
          <p className="text-xs text-text-muted leading-relaxed font-serif">
            Authors retain full copyright of their published work and grant the journal the right of first publication. Authors can archive preprint/postprint versions freely.
          </p>
        </div>
      </div>
    </div>
  );
}
