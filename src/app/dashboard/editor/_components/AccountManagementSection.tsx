import React, { useState } from 'react';
import { Search, Trash2, UserCheck, UserX } from 'lucide-react';
import type { ManagedAccount } from '@/app/api/accounts/route';

interface AccountManagementSectionProps {
  accounts: ManagedAccount[];
  loadingAccounts: boolean;
  accountsSearch: string;
  setAccountsSearch: (val: string) => void;
  accountsRoleFilter: string;
  setAccountsRoleFilter: (val: string) => void;
  accountsStatusFilter: string;
  setAccountsStatusFilter: (val: string) => void;
  handleDisableAccount: (userId: number) => Promise<void>;
  handleRestoreAccount: (userId: number) => Promise<void>;
  handleDeleteAccount: (userId: number, confirmationEmail: string) => Promise<void>;
}

export default function AccountManagementSection({
  accounts,
  loadingAccounts,
  accountsSearch,
  setAccountsSearch,
  accountsRoleFilter,
  setAccountsRoleFilter,
  accountsStatusFilter,
  setAccountsStatusFilter,
  handleDisableAccount,
  handleRestoreAccount,
  handleDeleteAccount,
}: AccountManagementSectionProps) {
  // Account deletion dialog state
  const [deletingAccount, setDeletingAccount] = useState<ManagedAccount | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Client-side filtering
  const filteredAccounts = accounts.filter((acc) => {
    // Search filter
    const query = accountsSearch.toLowerCase().trim();
    const matchesSearch =
      !query ||
      acc.name.toLowerCase().includes(query) ||
      acc.email.toLowerCase().includes(query) ||
      acc.username.toLowerCase().includes(query);

    // Role filter
    const matchesRole = accountsRoleFilter === 'all' || acc.role === accountsRoleFilter;

    // Status filter
    let matchesStatus = true;
    if (accountsStatusFilter === 'disabled') {
      matchesStatus = acc.isDisabled;
    } else if (accountsStatusFilter === 'enabled') {
      matchesStatus = !acc.isDisabled;
    } else if (accountsStatusFilter === 'unverified') {
      matchesStatus = !acc.isVerified;
    }

    return matchesSearch && matchesRole && matchesStatus;
  });

  const onDisableClick = async (acc: ManagedAccount) => {
    const message = `Are you sure you want to disable ${acc.name}'s account (${acc.email})?\nThis will revoke all active sessions immediately and prevent further logins.`;
    if (confirm(message)) {
      await handleDisableAccount(acc.id);
    }
  };

  const onRestoreClick = async (acc: ManagedAccount) => {
    const message = `Are you sure you want to restore ${acc.name}'s account (${acc.email})?\nThey will be able to log in again.`;
    if (confirm(message)) {
      await handleRestoreAccount(acc.id);
    }
  };

  const openDeleteDialog = (acc: ManagedAccount) => {
    setDeletingAccount(acc);
    setConfirmEmail('');
  };

  const closeDeleteDialog = () => {
    setDeletingAccount(null);
    setConfirmEmail('');
  };

  const onDeleteConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingAccount) return;

    if (confirmEmail.trim().toLowerCase() !== deletingAccount.email.trim().toLowerCase()) {
      alert('Confirmation email does not match.');
      return;
    }

    setSubmittingDelete(true);
    try {
      await handleDeleteAccount(deletingAccount.id, confirmEmail);
      closeDeleteDialog();
    } finally {
      setSubmittingDelete(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Filtering panel */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary">
        <h3 className="font-serif font-bold text-sm text-text-heading border-b border-border-light pb-2 uppercase tracking-wide flex items-center gap-1.5">
          Account Registry
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Search Accounts</label>
            <div className="relative">
              <input
                type="text"
                value={accountsSearch}
                onChange={(e) => setAccountsSearch(e.target.value)}
                placeholder="Search by name, email, or username..."
                className="bg-white border border-border-custom rounded-sm w-full pl-8 pr-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
              />
              <Search size={14} className="absolute left-2.5 top-3 text-text-muted" />
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Filter by Role</label>
            <select
              value={accountsRoleFilter}
              onChange={(e) => setAccountsRoleFilter(e.target.value)}
              className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
            >
              <option value="all">All Roles</option>
              <option value="admin">Administrator / Editor</option>
              <option value="reviewer">Reviewer</option>
              <option value="author">Author</option>
            </select>
          </div>

          <div>
            <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">Filter by Status</label>
            <select
              value={accountsStatusFilter}
              onChange={(e) => setAccountsStatusFilter(e.target.value)}
              className="bg-white border border-border-custom rounded-sm w-full px-3 py-2 text-sm text-black focus:outline-none focus:border-olive shadow-sm font-serif"
            >
              <option value="all">All Statuses</option>
              <option value="enabled">Active / Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Panel (inline alert/modal style card) */}
      {deletingAccount && (
        <div className="bg-white border-2 border-red-600 p-6 shadow-md rounded-sm space-y-4 text-xs">
          <h4 className="font-serif font-bold text-sm text-red-600 uppercase tracking-wide flex items-center gap-1.5">
            ⚠️ Confirm Permanent Account Deletion
          </h4>
          <p className="text-text-primary font-serif">
            You are initiating the permanent deletion of <strong>{deletingAccount.name}</strong> ({deletingAccount.email}).
            This action is irreversible. All of this user's active session data will be permanently wiped out.
          </p>
          <form onSubmit={onDeleteConfirmSubmit} className="space-y-4">
            <div>
              <label className="block font-bold uppercase tracking-wider text-text-muted mb-1.5">
                Type the user's email address to confirm: <span className="font-mono text-black select-all">{deletingAccount.email}</span>
              </label>
              <input
                type="text"
                required
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="Type the email address exactly..."
                className="bg-white border border-border-custom rounded-sm w-full max-w-md px-3 py-2 text-sm text-black focus:outline-none focus:border-red-600 shadow-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submittingDelete || confirmEmail.trim().toLowerCase() !== deletingAccount.email.trim().toLowerCase()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-sm text-[10px] uppercase tracking-wider cursor-pointer font-sans"
              >
                {submittingDelete ? 'Deleting...' : 'Confirm Permanent Deletion'}
              </button>
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="bg-sand/10 border border-border-custom hover:bg-sand/20 text-text-primary font-bold px-4 py-2 rounded-sm text-[10px] uppercase tracking-wider cursor-pointer font-sans"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Accounts List */}
      <div className="bg-bg-card border border-border-custom p-6 shadow-sm space-y-4 text-xs text-text-primary">
        {loadingAccounts ? (
          <p className="text-xs text-text-muted font-sans font-bold uppercase tracking-wider py-8 text-center">
            Loading accounts registry...
          </p>
        ) : filteredAccounts.length === 0 ? (
          <p className="text-xs text-text-muted font-serif py-8 text-center">
            No accounts match the selected filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border-custom text-[10px] uppercase font-bold text-text-muted tracking-wider">
                  <th className="py-2.5 font-bold">User Details</th>
                  <th className="py-2.5 font-bold">Role</th>
                  <th className="py-2.5 font-bold">Verification</th>
                  <th className="py-2.5 font-bold">Status</th>
                  <th className="py-2.5 font-bold text-center">Submissions</th>
                  <th className="py-2.5 font-bold text-center">Reviews</th>
                  <th className="py-2.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light text-[11px]">
                {filteredAccounts.map((acc) => {
                  return (
                    <tr key={acc.id} className="hover:bg-sand/5 transition-colors">
                      <td className="py-3.5 pr-2 font-serif">
                        <div className="font-bold text-text-heading">
                          {acc.name} {acc.isCurrentUser && <span className="font-sans text-[8px] uppercase tracking-widest text-olive border border-olive px-1.5 py-0.5 rounded-sm ml-1.5 shrink-0">Self</span>}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono mt-0.5">
                          @{acc.username} • {acc.email}
                        </div>
                      </td>
                      <td className="py-3.5 pr-2 uppercase font-bold text-[9px] tracking-wider font-sans">
                        {acc.role === 'admin' ? (
                          <span className="bg-charcoal text-white px-1.5 py-0.5 rounded-sm">Admin / Editor</span>
                        ) : acc.role === 'reviewer' ? (
                          <span className="bg-sand text-olive border border-border-custom px-1.5 py-0.5 rounded-sm">Reviewer</span>
                        ) : (
                          <span className="bg-white text-text-muted border border-border-light px-1.5 py-0.5 rounded-sm">Author</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-2 font-bold text-[9px] uppercase tracking-wider font-sans">
                        {acc.isVerified ? (
                          <span className="text-olive">Verified</span>
                        ) : (
                          <span className="text-amber-600">Unverified</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-2 font-bold text-[9px] uppercase tracking-wider font-sans">
                        {acc.isDisabled ? (
                          <span className="text-rose-600">Disabled</span>
                        ) : (
                          <span className="text-olive">Active</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-2 text-center font-bold font-mono">
                        {acc.submissionCount}
                      </td>
                      <td className="py-3.5 pr-2 text-center font-bold font-mono">
                        {acc.reviewCount}
                      </td>
                      <td className="py-3.5 text-right space-x-1 whitespace-nowrap font-sans">
                        {/* Disable action */}
                        {acc.canDisable && (
                          <button
                            type="button"
                            onClick={() => onDisableClick(acc)}
                            className="inline-flex items-center justify-center p-1.5 text-text-muted hover:text-rose-600 border border-border-custom hover:bg-rose-50 rounded-sm cursor-pointer transition-colors"
                            title="Disable Account"
                          >
                            <UserX size={12} />
                          </button>
                        )}

                        {/* Restore action */}
                        {acc.canRestore && (
                          <button
                            type="button"
                            onClick={() => onRestoreClick(acc)}
                            className="inline-flex items-center justify-center p-1.5 text-text-muted hover:text-olive border border-border-custom hover:bg-sand/10 rounded-sm cursor-pointer transition-colors"
                            title="Restore Account"
                          >
                            <UserCheck size={12} />
                          </button>
                        )}

                        {/* Delete action */}
                        {acc.canDelete ? (
                          <button
                            type="button"
                            onClick={() => openDeleteDialog(acc)}
                            className="inline-flex items-center justify-center p-1.5 text-text-muted hover:text-red-600 border border-border-custom hover:bg-red-50 rounded-sm cursor-pointer transition-colors"
                            title="Permanently Delete Account"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : (
                          <span className="inline-block relative group">
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center justify-center p-1.5 text-text-muted/30 border border-border-custom/50 bg-sand/5 rounded-sm cursor-not-allowed"
                            >
                              <Trash2 size={12} />
                            </button>
                            {acc.deleteBlockReason && (
                              <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-48 hidden group-hover:block bg-charcoal text-white text-[9px] uppercase tracking-wider p-2 rounded-sm shadow-md z-10 text-center font-sans font-bold leading-normal">
                                {acc.deleteBlockReason}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
