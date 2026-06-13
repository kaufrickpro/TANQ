import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import crypto from 'crypto';
import db from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';

export default async function SecretaryLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) redirect('/dashboard/login');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const result = await db`
    SELECT s.expires_at, s.revoked_at, u.role, u.name, u.is_disabled, u.is_verified
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash}
  `;
  const session = result.rows[0];
  if (!session || session.role !== 'secretary' || session.is_disabled || !session.is_verified || session.revoked_at || new Date(session.expires_at) < new Date()) {
    redirect('/dashboard/login');
  }
  return <DashboardShell role="secretary" userName={session.name}>{children}</DashboardShell>;
}
