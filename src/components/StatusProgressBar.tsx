import { Check, Circle } from 'lucide-react';

type ProgressAudience = 'author' | 'editorial';

interface StatusProgressBarProps {
  currentStage: string;
  audience?: ProgressAudience;
  compact?: boolean;
}

const AUTHOR_MILESTONES = [
  { label: 'Submitted', stages: ['submitted', 'secretary_check', 'editor_screening'] },
  { label: 'Peer review', stages: ['in_review', 'under_review', 'editor_decision'] },
  { label: 'Author revision', stages: ['revision_requested', 'author_revision'] },
  { label: 'Accepted', stages: ['accepted', 'production'] },
  { label: 'Published', stages: ['published'] },
];

const EDITORIAL_MILESTONES = [
  { label: 'Intake', stages: ['submitted', 'secretary_check'] },
  { label: 'Screening', stages: ['editor_screening'] },
  { label: 'Peer review', stages: ['in_review', 'under_review'] },
  { label: 'Decision', stages: ['editor_decision', 'revision_requested', 'author_revision'] },
  { label: 'Production', stages: ['accepted', 'production', 'published'] },
];

export function getMilestoneLabel(stage: string, audience: ProgressAudience = 'author') {
  if (stage === 'draft') return 'Draft';
  if (stage === 'rejected') return 'Decision issued';
  if (stage === 'withdrawn') return 'Withdrawn';
  const milestones = audience === 'editorial' ? EDITORIAL_MILESTONES : AUTHOR_MILESTONES;
  return milestones.find((milestone) => milestone.stages.includes(stage))?.label ?? stage.replaceAll('_', ' ');
}

export default function StatusProgressBar({
  currentStage,
  audience = 'author',
  compact = false,
}: StatusProgressBarProps) {
  const milestones = audience === 'editorial' ? EDITORIAL_MILESTONES : AUTHOR_MILESTONES;
  const terminal = currentStage === 'rejected' || currentStage === 'withdrawn';
  const activeIndex = milestones.findIndex((milestone) => milestone.stages.includes(currentStage));
  const resolvedIndex = activeIndex === -1 ? 0 : activeIndex;

  return (
    <div>
      <div className="flex items-start" aria-label={`Current status: ${getMilestoneLabel(currentStage, audience)}`}>
        {milestones.map((milestone, index) => {
          const complete = !terminal && index < resolvedIndex;
          const active = !terminal && index === resolvedIndex;
          return (
            <div key={milestone.label} className="flex min-w-0 flex-1 items-start last:flex-none">
              <div className="flex min-w-0 flex-col items-center">
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
                    complete
                      ? 'border-olive bg-olive text-white'
                      : active
                        ? 'border-olive bg-white text-olive ring-2 ring-olive/15'
                        : 'border-border-custom bg-white text-text-muted'
                  }`}
                  aria-current={active ? 'step' : undefined}
                >
                  {complete ? <Check size={12} /> : <Circle size={8} fill={active ? 'currentColor' : 'none'} />}
                </span>
                {!compact && (
                  <span
                    className={`mt-1.5 hidden max-w-20 text-center font-sans text-[8px] font-bold uppercase tracking-wide sm:block ${
                      active || complete ? 'text-olive' : 'text-text-muted'
                    }`}
                  >
                    {milestone.label}
                  </span>
                )}
              </div>
              {index < milestones.length - 1 && (
                <span className={`mt-[11px] h-px flex-1 ${complete ? 'bg-olive' : 'bg-border-custom'}`} />
              )}
            </div>
          );
        })}
      </div>
      {terminal && (
        <p className="mt-2 font-sans text-[9px] font-bold uppercase tracking-wider text-text-muted">
          Workflow closed: {currentStage}
        </p>
      )}
    </div>
  );
}
