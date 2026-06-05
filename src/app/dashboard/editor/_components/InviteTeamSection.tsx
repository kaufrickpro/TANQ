import React from 'react';
import { UserPlus, Check, Clock, Copy, Trash2 } from 'lucide-react';

interface InviteTeamSectionProps {
  invites: any[];
  inviteEmail: string;
  setInviteEmail: (val: string) => void;
  inviteRole: 'reviewer' | 'admin';
  setInviteRole: (val: 'reviewer' | 'admin') => void;
  invitingUser: boolean;
  loadingInvites: boolean;
  handleCreateInvite: (e: React.FormEvent) => void;
  handleRevokeInvite: (id: number, email: string) => void;
  handleCopyLink: (token: string) => void;
}

export default function InviteTeamSection({
  invites,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  invitingUser,
  loadingInvites,
  handleCreateInvite,
  handleRevokeInvite,
  handleCopyLink
}: InviteTeamSectionProps) {
  return (
    <div className="space-y-6 font-sans">
      {/* Create invitation card */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary font-sans">
        <h3 className="font-serif font-bold text-sm text-text-heading border-b border-border-light pb-2 uppercase tracking-wide flex items-center gap-1.5">
          <UserPlus size={15} className="text-olive" /> Generate New Staff Invite
        </h3>
        <p className="text-[10px] text-text-muted font-serif leading-normal">
          Privileged accounts (Editors and Peer Reviewers) cannot register publicly. Generate a secure, single-use registration link for their email address.
        </p>
        <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Invitee Email Address</label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. colleague@university.edu"
              className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
            />
          </div>
          <div>
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Assigned Portal Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
            >
              <option value="reviewer">Peer Reviewer</option>
              <option value="admin">Editor / Administrator</option>
            </select>
          </div>
          <div className="sm:col-span-2 pt-1">
            <button
              type="submit"
              disabled={invitingUser}
              className="bg-olive hover:bg-link-hover text-white font-bold px-4 py-2.5 rounded-sm text-[11px] shadow-sm transition-colors cursor-pointer disabled:opacity-50 uppercase tracking-wider flex items-center gap-1.5 font-sans"
            >
              {invitingUser ? 'Generating Link...' : 'Create Invite Link'}
            </button>
          </div>
        </form>
      </div>

      {/* Invitations queue list card */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary">
        <h3 className="font-serif font-bold text-sm text-text-heading border-b border-border-light pb-2.5 uppercase tracking-wide flex items-center gap-1.5">
          Active Invitations Queue
        </h3>
        {loadingInvites ? (
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider py-4">Loading active invitations...</p>
        ) : invites.length === 0 ? (
          <p className="text-xs text-text-muted font-serif py-4 text-center">No invitations generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-custom text-[10px] uppercase font-bold text-text-muted tracking-wider">
                  <th className="py-2.5 font-bold">Email</th>
                  <th className="py-2.5 font-bold">Role</th>
                  <th className="py-2.5 font-bold">Status</th>
                  <th className="py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light text-[11px]">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-sand/5 transition-colors">
                    <td className="py-3 pr-2 font-medium text-text-primary max-w-[150px] truncate font-serif" title={inv.email}>
                      {inv.email}
                    </td>
                    <td className="py-3 pr-2 uppercase font-bold text-[9px] tracking-wider font-sans">
                      {inv.role === 'admin' ? (
                        <span className="bg-charcoal text-white px-1.5 py-0.5 rounded-sm">Editor</span>
                      ) : (
                        <span className="bg-sand text-olive border border-border-custom px-1.5 py-0.5 rounded-sm">Reviewer</span>
                      )}
                    </td>
                    <td className="py-3 pr-2 font-medium font-sans">
                      {inv.is_used ? (
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold text-olive">
                          <Check size={12} /> Registered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold text-text-muted">
                          <Clock size={12} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right space-x-1.5 whitespace-nowrap font-sans">
                      {!inv.is_used && (
                        <>
                          <button
                            onClick={() => handleCopyLink(inv.token)}
                            className="inline-flex items-center justify-center p-1.5 text-olive hover:text-link-hover border border-border-custom hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
                            title="Copy Invite Link"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => handleRevokeInvite(inv.id, inv.email)}
                            className="inline-flex items-center justify-center p-1.5 text-text-muted hover:text-red-600 border border-border-custom hover:bg-red-50 rounded-sm cursor-pointer transition-colors"
                            title="Revoke Invitation"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
