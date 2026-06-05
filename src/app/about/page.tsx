import React from 'react';
import { BookOpen, Target, GraduationCap, Leaf, Globe, Cpu, Stethoscope } from 'lucide-react';

export default function About() {
  const topics = [
    {
      title: 'Politics and Diplomacy',
      description: 'Research on political dynamics, international relations, foreign policy, and diplomatic engagement between Türkiye and African nations.',
      icon: <Globe className="text-olive" size={20} />
    },
    {
      title: 'Economics and Trade',
      description: 'Analysis of economic development, trade policies, investment patterns, and financial relations across the continent.',
      icon: <Target className="text-olive" size={20} />
    },
    {
      title: 'Social and Cultural Studies',
      description: 'Exploration of historical ties, cultural exchange, social movements, and societal developments in African communities.',
      icon: <BookOpen className="text-olive" size={20} />
    },
    {
      title: 'Environmental Studies and Sustainability',
      description: 'Examination of climate change impacts, resource management, and policies for environmental sustainability.',
      icon: <Leaf className="text-olive" size={20} />
    },
    {
      title: 'Education and Human Development',
      description: 'Focused inquiry into higher education internationalization, student mobility, educational policy, and capacity building.',
      icon: <GraduationCap className="text-olive" size={20} />
    },
    {
      title: 'Technology and AI',
      description: 'Study of technological innovation, digital infrastructure, AI applications, and their societal and economic impact.',
      icon: <Cpu className="text-olive" size={20} />
    },
    {
      title: 'Public Health and Climate Change',
      description: 'Research on the intersection of public health crises, climate-related challenges, and health policy frameworks.',
      icon: <Stethoscope className="text-olive" size={20} />
    }
  ];

  return (
    <div className="space-y-10">
      {/* Scope Block */}
      <div className="space-y-4">
        <h2 className="text-2xl font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Focus and Scope
        </h2>
        <p className="text-sm text-text-primary leading-relaxed font-serif">
          <em>The African Nexus Quarterly</em> is a Türkiye-based publication dedicated to exploring contemporary and historical issues concerning Africa from a multidisciplinary perspective. We welcome original, high-quality research that advances academic discourse and sheds light on the diverse and complex realities of the African continent. We encourage submissions from scholars in various fields.
        </p>
      </div>

      {/* Topics grid */}
      <div className="space-y-6">
        <h2 className="text-lg font-serif font-bold text-text-heading border-b border-border-light pb-2 uppercase tracking-wide">
          Topics Covered
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
          {topics.map((t) => (
            <div key={t.title} className="bg-bg-card border border-border-custom p-5 shadow-sm space-y-3 flex items-start gap-3">
              <div className="bg-sand/30 p-2 rounded-sm border border-border-light text-olive shrink-0 mt-0.5">
                {t.icon}
              </div>
              <div className="space-y-1">
                <h3 className="font-serif font-bold text-sm text-text-primary">{t.title}</h3>
                <p className="text-xs text-text-muted leading-relaxed font-serif">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
