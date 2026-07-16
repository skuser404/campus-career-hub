'use client';

import {
  BadgeCheck,
  BarChart3,
  Briefcase,
  Building2,
  ChevronLeft,
  Cog,
  GraduationCap,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives';
import { useCurrentUser } from '@/hooks/use-auth';
import { cn, initials } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/jobs', label: 'Opportunities', icon: Briefcase },
  { href: '/admin/reports', label: 'Reports', icon: Inbox },
  { href: '/admin/students', label: 'Students', icon: Users },
  { href: '/admin/departments', label: 'Departments', icon: GraduationCap },
  { href: '/admin/companies', label: 'Companies', icon: Building2 },
  { href: '/admin/categories', label: 'Categories', icon: Tags },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/admin/banners', label: 'Banners', icon: ImageIcon },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Cog },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user, isLoading } = useCurrentUser();

  /**
   * Client-side role check.
   *
   * This is a CONVENIENCE, not the security boundary — a student who forces
   * their way to /admin sees the shell, and then every single admin API call
   * returns 403 because `requireAdmin` runs on the server. All they achieve is
   * an empty console. The redirect exists so an honest user who lands here by
   * accident is sent somewhere useful.
   */
  React.useEffect(() => {
    if (!isLoading && user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (user && user.role !== 'admin') return null;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar. Hidden below lg — an admin data table is not a phone experience,
          and the top bar carries the navigation there instead. */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              C
            </span>
            Admin
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 p-3" aria-label="Admin">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link href="/">
              <ChevronLeft className="h-4 w-4" />
              Back to site
            </Link>
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          {/* Mobile nav — a horizontal scroller, so every section stays reachable
              without a hamburger that hides half the console. */}
          <nav
            className="flex flex-1 gap-1 overflow-x-auto lg:hidden"
            aria-label="Admin sections"
          >
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />

            {user ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-xs">{initials(user.fullName)}</AvatarFallback>
                </Avatar>
                <span className="hidden items-center gap-1 text-sm font-medium sm:inline-flex">
                  {user.fullName.split(' ')[0]}
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                </span>
              </div>
            ) : null}
          </div>
        </header>

        <main id="main" className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
