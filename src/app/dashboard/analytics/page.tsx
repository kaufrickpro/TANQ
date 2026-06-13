import { redirect } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  MailWarning,
  Users,
} from 'lucide-react';
import DashboardShell from '@/components/DashboardShell';
import db from '@/lib/db';
import { getSessionUser } from '@/lib/session';

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function days(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)} days` : 'Not enough data';
}

export default async function AnalyticsPage() {
  const session = await getSessionUser();
  if (!session || !['admin', 'editor'].includes(session.role) || !session.is_verified) redirect('/dashboard/login');

  const [summaryResult, pipelineResult, monthlyResult, turnaroundResult, reviewersResult, outboxResult] = await Promise.all([
    db`
      SELECT
        COUNT(*) FILTER (WHERE status != 'draft')::integer AS total_submissions,
        COUNT(*) FILTER (
          WHERE COALESCE(current_stage, status) NOT IN ('draft','published','rejected','withdrawn')
        )::integer AS active_submissions,
        COUNT(*) FILTER (WHERE COALESCE(current_stage, status) IN ('accepted','published'))::integer AS accepted,
        COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'published')::integer AS published,
        COUNT(*) FILTER (WHERE COALESCE(current_stage, status) = 'rejected')::integer AS rejected
      FROM submissions
    `,
    db`
      SELECT COALESCE(current_stage, status) AS stage, COUNT(*)::integer AS count
      FROM submissions
      WHERE status != 'draft'
      GROUP BY COALESCE(current_stage, status)
      ORDER BY count DESC, stage ASC
    `,
    db`
      SELECT TO_CHAR(DATE_TRUNC('month', submitted_at), 'Mon YY') AS month,
             COUNT(*)::integer AS submissions
      FROM submissions
      WHERE submitted_at IS NOT NULL
        AND submitted_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', submitted_at)
      ORDER BY DATE_TRUNC('month', submitted_at) ASC
    `,
    db`
      SELECT
        (
          SELECT ROUND(AVG(EXTRACT(EPOCH FROM (rp.submitted_at - ra.assigned_at)) / 86400)::numeric, 1)
          FROM review_reports rp
          JOIN review_assignments ra ON ra.id = rp.assignment_id
        ) AS avg_reviewer_days,
        (
          SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_decision.created_at - s.submitted_at)) / 86400)::numeric, 1)
          FROM submissions s
          JOIN LATERAL (
            SELECT MIN(ed.created_at) AS created_at FROM editorial_decisions ed WHERE ed.submission_id = s.id
          ) first_decision ON first_decision.created_at IS NOT NULL
          WHERE s.submitted_at IS NOT NULL
        ) AS avg_first_decision_days,
        (
          SELECT ROUND(AVG(EXTRACT(EPOCH FROM (final_decision.created_at - s.submitted_at)) / 86400)::numeric, 1)
          FROM submissions s
          JOIN LATERAL (
            SELECT MAX(ed.created_at) AS created_at
            FROM editorial_decisions ed
            WHERE ed.submission_id = s.id AND ed.decision IN ('accept','reject','withdraw')
          ) final_decision ON final_decision.created_at IS NOT NULL
          WHERE s.submitted_at IS NOT NULL
        ) AS avg_final_decision_days
    `,
    db`
      SELECT ra.reviewer_name, COUNT(*)::integer AS assignments, COUNT(rp.id)::integer AS completed,
             ROUND(AVG(EXTRACT(EPOCH FROM (rp.submitted_at - ra.assigned_at)) / 86400)::numeric, 1)
               AS avg_turnaround_days
      FROM review_assignments ra
      LEFT JOIN review_reports rp ON rp.assignment_id = ra.id
      GROUP BY ra.reviewer_name, ra.reviewer_email
      ORDER BY completed DESC, avg_turnaround_days ASC NULLS LAST
      LIMIT 8
    `,
    db`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::integer AS processing,
        COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed,
        COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '7 days')::integer AS sent_last_7_days
      FROM notification_outbox
    `,
  ]);

  const summary = summaryResult.rows[0];
  const turnaround = turnaroundResult.rows[0];
  const outbox = outboxResult.rows[0];
  const total = Math.max(number(summary.total_submissions), 1);
  const maxPipeline = Math.max(...pipelineResult.rows.map((row) => number(row.count)), 1);
  const maxMonthly = Math.max(...monthlyResult.rows.map((row) => number(row.submissions)), 1);
  const acceptanceRate = (number(summary.accepted) / total) * 100;
  const rejectionRate = (number(summary.rejected) / total) * 100;

  const metrics = [
    { label: 'Total submissions', value: number(summary.total_submissions), detail: `${number(summary.active_submissions)} active`, icon: BarChart3 },
    { label: 'Acceptance rate', value: `${acceptanceRate.toFixed(1)}%`, detail: `${number(summary.published)} published`, icon: CheckCircle2 },
    { label: 'First decision', value: days(turnaround.avg_first_decision_days), detail: 'Average turnaround', icon: Clock3 },
    { label: 'Reviewer turnaround', value: days(turnaround.avg_reviewer_days), detail: 'Average completed review', icon: Users },
  ];

  return (
    <DashboardShell role={session.role === 'admin' ? 'admin' : 'editor'} userName={session.name}>
      <main className="mx-auto w-full max-w-[1380px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 border-b border-border-custom pb-4">
          <p className="font-sans text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted">Editorial intelligence</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-text-heading">Workflow analytics</h1>
          <p className="mt-1 max-w-2xl font-serif text-xs text-text-muted">
            A live operational view of manuscript flow, reviewer performance, turnaround, and notification health.
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article key={label} className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
                  <p className="mt-2 font-serif text-2xl font-bold text-text-heading">{value}</p>
                </div>
                <span className="inline-flex size-9 items-center justify-center rounded-sm bg-olive text-white"><Icon size={15} /></span>
              </div>
              <p className="mt-3 border-t border-border-light pt-2 font-serif text-[10px] text-text-muted">{detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <article className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
            <h2 className="font-serif text-base font-bold text-text-heading">Current pipeline</h2>
            <p className="mt-1 font-serif text-xs text-text-muted">Active and closed manuscripts grouped by workflow stage.</p>
            <div className="mt-5 space-y-3">
              {pipelineResult.rows.map((row) => (
                <div key={row.stage}>
                  <div className="mb-1 flex items-center justify-between gap-2 font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">
                    <span>{String(row.stage).replaceAll('_', ' ')}</span><span>{number(row.count)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sand/30">
                    <div className="h-full rounded-full bg-olive" style={{ width: `${(number(row.count) / maxPipeline) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-sm border border-border-custom bg-white p-5 shadow-sm">
            <h2 className="font-serif text-base font-bold text-text-heading">Submission volume</h2>
            <p className="mt-1 font-serif text-xs text-text-muted">New submissions received over the last twelve months.</p>
            <div className="mt-5 flex min-h-56 items-end gap-2 border-b border-l border-border-light px-3 pt-4">
              {monthlyResult.rows.length === 0 ? (
                <p className="self-center font-serif text-xs text-text-muted">No dated submissions available.</p>
              ) : monthlyResult.rows.map((row) => (
                <div key={row.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-sans text-[8px] font-bold text-olive">{number(row.submissions)}</span>
                  <div className="w-full max-w-12 bg-olive" style={{ height: `${Math.max((number(row.submissions) / maxMonthly) * 160, 8)}px` }} />
                  <span className="truncate font-sans text-[7px] font-bold uppercase text-text-muted">{row.month}</span>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <article className="overflow-hidden rounded-sm border border-border-custom bg-white shadow-sm">
            <div className="border-b border-border-custom p-5">
              <h2 className="font-serif text-base font-bold text-text-heading">Reviewer performance</h2>
              <p className="mt-1 font-serif text-xs text-text-muted">Completion and turnaround for the most active reviewers.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead className="bg-sand/20 font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">
                  <tr><th className="px-5 py-3">Reviewer</th><th className="px-3 py-3">Assigned</th><th className="px-3 py-3">Completed</th><th className="px-5 py-3">Avg. turnaround</th></tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {reviewersResult.rows.map((reviewer) => (
                    <tr key={reviewer.reviewer_name} className="font-serif text-xs text-text-primary">
                      <td className="px-5 py-3 font-bold">{reviewer.reviewer_name}</td>
                      <td className="px-3 py-3">{number(reviewer.assignments)}</td>
                      <td className="px-3 py-3">{number(reviewer.completed)}</td>
                      <td className="px-5 py-3">{days(reviewer.avg_turnaround_days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded-sm border border-border-custom bg-charcoal p-5 text-white shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-sans text-[8px] font-bold uppercase tracking-wider text-sand/70">Operational health</p>
                <h2 className="mt-1 font-serif text-base font-bold">Notification outbox</h2>
              </div>
              <MailWarning size={18} className="text-sand" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {[
                ['Pending', outbox.pending],
                ['Processing', outbox.processing],
                ['Failed', outbox.failed],
                ['Sent, 7 days', outbox.sent_last_7_days],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-sm border border-white/15 bg-white/5 p-3">
                  <p className="font-serif text-xl font-bold">{number(value)}</p>
                  <p className="mt-1 font-sans text-[7px] font-bold uppercase tracking-wider text-sand/70">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-2 border-t border-white/15 pt-4 font-serif text-[10px] leading-relaxed text-sand/75">
              <Activity size={12} className="mt-0.5 shrink-0" />
              <p>Failed or persistently pending notifications should be investigated before deadline reminders are trusted.</p>
            </div>
          </article>
        </section>

        <p className="mt-6 font-sans text-[8px] font-bold uppercase tracking-wider text-text-muted">
          Final decision average: {days(turnaround.avg_final_decision_days)} · Rejection rate: {rejectionRate.toFixed(1)}%
        </p>
      </main>
    </DashboardShell>
  );
}
