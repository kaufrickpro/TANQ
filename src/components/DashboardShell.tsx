'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  FilePenLine,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  X,
} from 'lucide-react';

type DashboardRole = 'admin' | 'editor' | 'secretary' | 'reviewer' | 'author';

interface DashboardShellProps {
  children: React.ReactNode;
  role: DashboardRole;
  userName?: string;
}

const ROLE_LABELS: Record<DashboardRole, string> = {
  admin: 'Administrator',
  editor: 'Editor',
  secretary: 'Editorial Secretary',
  reviewer: 'Reviewer',
  author: 'Author',
};

const ROLE_HOME: Record<DashboardRole, string> = {
  admin: '/dashboard/editor',
  editor: '/dashboard/editor',
  secretary: '/dashboard/secretary',
  reviewer: '/dashboard/reviewer',
  author: '/dashboard/author',
};

function navigationFor(role: DashboardRole) {
  const home = {
    href: ROLE_HOME[role],
    label: 'Workspace',
    icon: LayoutDashboard,
  };

  if (role === 'admin' || role === 'editor') {
    return [
      home,
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    ];
  }

  if (role === 'secretary') {
    return [{ ...home, label: 'Technical queue', icon: ClipboardCheck }];
  }

  if (role === 'reviewer') {
    return [{ ...home, label: 'Review folder', icon: BookOpenCheck }];
  }

  return [{ ...home, label: 'My submissions', icon: FilePenLine }];
}

export default function DashboardShell({ children, role, userName }: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const navigation = navigationFor(role);

  const navContent = (
    <>
      <div className="border-b border-white/15 px-4 py-5">
        {!compact ? (
          <>
            <p className="font-sans text-[9px] font-bold uppercase tracking-[0.22em] text-sand/70 truncate w-full">
              Editorial workspace
            </p>
            <p className="mt-1 font-serif text-lg font-bold text-white truncate w-full">{ROLE_LABELS[role]}</p>
            {userName && <p className="mt-1 truncate text-[11px] text-sand/75 w-full">{userName}</p>}
          </>
        ) : (
          <div className="flex w-full items-center justify-center">
            <span className="font-serif text-base font-bold text-sand bg-white/5 border border-white/10 rounded-sm w-9 h-9 flex items-center justify-center shadow-sm" title="The African Nexus Quarterly">
              T
            </span>
          </div>
        )}
      </div>
      <nav aria-label="Dashboard navigation" className="flex-1 space-y-1 px-3 py-4">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
              className={`flex min-h-11 items-center gap-3 rounded-sm border px-3 py-2.5 font-sans text-[10px] font-bold uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand ${
                active
                  ? 'border-sand/40 bg-sand text-charcoal'
                  : 'border-transparent text-sand/80 hover:border-sand/20 hover:bg-white/10 hover:text-white'
              }`}
              title={compact ? label : undefined}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              {!compact && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => setCompact((current) => !current)}
        className="hidden min-h-11 items-center gap-3 border-t border-white/15 px-4 py-3 font-sans text-[10px] font-bold uppercase tracking-wider text-sand/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-sand lg:flex"
        aria-label={compact ? 'Expand dashboard navigation' : 'Collapse dashboard navigation'}
      >
        <PanelLeftClose size={15} className={compact ? 'rotate-180' : ''} />
        {!compact && 'Collapse'}
      </button>
    </>
  );

  return (
    <div className="relative flex min-h-[calc(100vh-10rem)] w-full bg-bg-page">
      <aside
        className={`sticky top-[var(--dashboard-shell-top,0px)] hidden h-[calc(100vh-var(--dashboard-shell-top,0px))] shrink-0 flex-col bg-charcoal shadow-sm transition-[width] duration-200 lg:flex ${
          compact ? 'w-[68px]' : 'w-56'
        }`}
      >
        {navContent}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border-custom bg-bg-card/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden">
          <div>
            <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-text-muted">Workspace</p>
            <p className="font-serif text-sm font-bold text-text-heading">{ROLE_LABELS[role]}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border-custom bg-white text-olive transition-colors hover:bg-sand/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            aria-label="Open dashboard navigation"
            aria-expanded={mobileOpen}
          >
            <Menu size={18} />
          </button>
        </div>
        {children}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Close dashboard navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col bg-charcoal shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex min-h-10 min-w-10 items-center justify-center text-sand transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-sand"
              aria-label="Close dashboard navigation"
            >
              <X size={18} />
            </button>
            {navContent}
          </aside>
        </div>
      )}
    </div>
  );
}
