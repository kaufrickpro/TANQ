import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '@/lib/db';
import crypto from 'crypto';
import DashboardShell from '@/components/DashboardShell';

export default async function EditorLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get('session_token');
  if (!tokenCookie) {
    redirect('/dashboard/login');
  }

  const tokenHash = crypto.createHash('sha256').update(tokenCookie.value).digest('hex');
  const sessionResult = await db`
    SELECT s.expires_at, s.revoked_at, u.role, u.name, u.is_disabled, u.is_verified
    FROM auth_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ${tokenHash}
  `;

  if (sessionResult.rows.length === 0) {
    redirect('/dashboard/login');
  }

  const session = sessionResult.rows[0];
  if (
    session.is_disabled ||
    !session.is_verified ||
    session.revoked_at ||
    new Date(session.expires_at) < new Date() ||
    !['admin', 'editor'].includes(session.role)
  ) {
    redirect('/dashboard/login');
  }

  return (
    <DashboardShell role={session.role === 'admin' ? 'admin' : 'editor'} userName={session.name}>
      {children}
    </DashboardShell>
  );
}
