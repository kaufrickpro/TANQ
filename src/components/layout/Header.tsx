'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, ChevronDown, ChevronRight, Search, User, LogOut } from 'lucide-react';

interface UserSession {
  username: string;
  name: string;
  role: string;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aboutDropdownOpen, setAboutDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [session, setSession] = useState<UserSession | null>(null);

  // Load session from server
  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/session');
        if (res.ok) {
          const sessionUser = await res.json();
          setSession(sessionUser);
        } else {
          setSession(null);
        }
      } catch {
        setSession(null);
      }
    };
    checkSession();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Logout request failed');
      }

      setSession(null);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileMenuOpen(false);
    }
  };

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Current', href: '/current' },
    { name: 'Archives', href: '/archives' },
  ];

  const aboutLinks = [
    { name: 'Focus & Scope', href: '/about' },
    { name: 'Editorial Board', href: '/about/editorial-team' },
    { name: 'Author Guidelines', href: '/about/author-guidelines' },
    { name: 'Publication Ethics', href: '/about/publication-ethics' },
    { name: 'Open Access Policy', href: '/about/open-access' },
    { name: 'Submissions', href: '/about/submissions' },
  ];

  return (
    <header className="w-full bg-sand border-b border-border-custom z-20 sticky top-0 font-lato">
      {/* Top utility bar (Hidden on Mobile) */}
      <div className="hidden md:flex max-w-[1120px] mx-auto px-6 sm:px-8 py-2 border-b border-border-light justify-between items-center text-[11px] font-black uppercase tracking-[0.15em] text-text-muted">
        <div>
          <span>ISSN: <strong className="text-olive">3108-7949</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/about/submissions" className="hover:text-link-hover transition-colors">Submit</Link>
          <span className="text-border-custom">|</span>
          {session ? (
            <div className="flex items-center gap-2">
              <span className="text-olive font-black normal-case tracking-normal">Hello, {session.name}</span>
              <span className="text-border-custom">|</span>
              <Link href={`/dashboard/${session.role === 'admin' ? 'editor' : session.role}`} className="hover:text-link-hover transition-colors font-bold flex items-center gap-1">
                <User size={12} /> Dashboard
              </Link>
              <span className="text-border-custom">|</span>
              <button onClick={handleLogout} className="hover:text-link-hover transition-colors flex items-center gap-1 cursor-pointer">
                <LogOut size={12} /> Log Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/dashboard/login" className="hover:text-link-hover transition-colors flex items-center gap-1 font-bold">
                <User size={12} /> Login
              </Link>
              <span className="text-border-custom">|</span>
              <Link href="/dashboard/login#register" className="hover:text-link-hover transition-colors font-bold">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main navigation */}
      <div className="max-w-[1120px] mx-auto px-6 sm:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <Image 
              src="/images/ANQ-Logo-v2.png" 
              alt="ANQ Logo" 
              width={132} 
              height={48} 
              className="object-contain hover:opacity-85 transition-opacity" 
              priority
            />
          </Link>

          {/* Desktop links */}
          <nav className="hidden md:flex items-center gap-6 text-[13px] font-bold uppercase tracking-[0.15em]">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  className={`transition-colors py-2 text-olive hover:text-link-hover ${
                    isActive ? 'border-b-2 border-olive font-black' : ''
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}

            {/* About Dropdown */}
            <div className="relative">
              <button
                onClick={() => setAboutDropdownOpen(!aboutDropdownOpen)}
                className={`flex items-center gap-1 py-2 text-olive hover:text-link-hover transition-colors focus:outline-none cursor-pointer uppercase font-bold tracking-[0.15em] ${
                  pathname.startsWith('/about') ? 'border-b-2 border-olive font-black' : ''
                }`}
              >
                About <ChevronDown size={14} className={`transform transition-transform ${aboutDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {aboutDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAboutDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-border-custom py-1 z-20 shadow-md">
                    {aboutLinks.map((link) => (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setAboutDropdownOpen(false)}
                        className={`block px-4 py-2 text-xs font-bold text-olive hover:bg-sand/30 hover:text-link-hover transition-colors uppercase tracking-[0.1em] ${
                          pathname === link.href ? 'bg-sand/50 font-black' : ''
                        }`}
                      >
                        {link.name}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="relative flex items-center shrink-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="bg-white border border-border-custom rounded-sm px-3 py-1.5 pr-8 text-xs text-black placeholder-text-muted focus:outline-none focus:border-olive w-52 focus:w-60 transition-all duration-300 font-lato"
              />
              <button type="submit" className="absolute right-2.5 text-olive hover:text-link-hover transition-colors">
                <Search size={14} />
              </button>
            </form>
          </nav>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-olive hover:text-link-hover focus:outline-none cursor-pointer"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-sand border-t border-border-custom px-6 py-8 space-y-7 shadow-inner">
          {/* Mobile Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              className="bg-white border border-border-custom rounded-sm px-3 py-2.5 pr-9 text-sm text-black placeholder-text-muted focus:outline-none focus:border-olive w-full font-lato"
            />
            <button type="submit" className="absolute right-3 text-olive">
              <Search size={16} />
            </button>
          </form>

          {/* Navigation Links */}
          <div className="space-y-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-text-muted block">
              Navigation
            </span>
            <div className="space-y-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive transition-colors ${
                      isActive ? 'border-olive font-black bg-bg-card shadow-sm' : ''
                    }`}
                  >
                    <span>{link.name}</span>
                    <ChevronRight size={14} className="text-text-muted" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* About Links */}
          <div className="space-y-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-text-muted block">
              About Journal
            </span>
            <div className="grid grid-cols-1 gap-2">
              {aboutLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-2.5 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-[11px] font-bold uppercase tracking-[0.1em] text-olive transition-colors ${
                      isActive ? 'border-olive font-black bg-bg-card shadow-sm' : ''
                    }`}
                  >
                    <span>{link.name}</span>
                    <ChevronRight size={12} className="text-text-muted" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Session Actions */}
          <div className="space-y-2">
            <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-text-muted block">
              User Account
            </span>
            {session ? (
              <div className="space-y-2">
                {/* Profile Card Info Box */}
                <div className="bg-sand/30 border border-border-custom px-4 py-3 rounded-sm flex items-center gap-2.5 text-olive text-xs font-bold uppercase tracking-wider shadow-inner">
                  <User size={14} />
                  <span className="normal-case tracking-normal font-serif text-text-heading">
                    Hello, {session.name}
                  </span>
                </div>
                <Link 
                  href={`/dashboard/${session.role === 'admin' ? 'editor' : session.role}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive transition-colors"
                >
                  <span>Dashboard</span>
                  <ChevronRight size={14} className="text-text-muted" />
                </Link>
                <Link
                  href="/about/submissions"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive transition-colors"
                >
                  <span>Submit Manuscript</span>
                  <ChevronRight size={14} className="text-text-muted" />
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center justify-between px-4 py-3 bg-white/40 hover:bg-white border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive hover:text-rose-700 cursor-pointer w-full text-left transition-colors"
                >
                  <span>Log Out</span>
                  <LogOut size={12} className="text-text-muted" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Link 
                  href="/dashboard/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive transition-colors"
                >
                  <span>Login</span>
                  <ChevronRight size={14} className="text-text-muted" />
                </Link>
                <Link 
                  href="/dashboard/login#register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-3 bg-bg-card/65 hover:bg-bg-card border border-border-custom rounded-sm text-xs font-bold uppercase tracking-[0.12em] text-olive transition-colors"
                >
                  <span>Register</span>
                  <ChevronRight size={14} className="text-text-muted" />
                </Link>
              </div>
            )}
          </div>
          
          <div className="text-[10px] text-text-muted text-center pt-4 border-t border-border-light font-sans font-bold uppercase tracking-wider">
            ISSN: 3108-7949
          </div>
        </div>
      )}
    </header>
  );
}
