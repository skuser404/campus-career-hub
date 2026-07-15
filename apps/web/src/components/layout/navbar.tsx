'use client';

import {
  Bell,
  Bookmark,
  Building2,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Send,
  Settings,
  Shield,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/primitives';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { useUnreadCount } from '@/hooks/use-notifications';
import { cn, initials } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/opportunities', label: 'Opportunities', icon: Search },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/saved', label: 'Saved', icon: Bookmark },
  { href: '/applications', label: 'Applications', icon: Send },
];

export function Navbar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: unread } = useUnreadCount();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Close the mobile drawer on navigation — otherwise it stays open over the page
  // the user just asked for.
  React.useEffect(() => setMobileOpen(false), [pathname]);

  const unreadCount = unread?.unread ?? 0;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Campus Career Hub</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                // `aria-current` is how a screen reader conveys "you are here".
                // Colour alone does not.
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link
              href="/notifications"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'
              }
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 ? (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </Link>
          </Button>

          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Account menu"
                >
                  <Avatar>
                    {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <div className="truncate font-medium text-foreground">{user.fullName}</div>
                  <div className="truncate text-xs font-normal">{user.email}</div>

                  {/* The department and year are not decoration — they are exactly
                      what decides which opportunities this person can see, so they
                      are worth surfacing. */}
                  {user.department ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="secondary">{user.department.code}</Badge>
                      {user.year ? <Badge variant="secondary">Year {user.year}</Badge> : null}
                      {user.usn ? (
                        <Badge variant="outline" className="font-mono">
                          {user.usn}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                {user.role === 'admin' ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <Shield /> Admin console
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}

                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User /> Profile
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings /> Settings
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  destructive
                  onClick={() => logout.mutate()}
                  disabled={logout.isPending}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="space-y-1 p-4" aria-label="Mobile">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
