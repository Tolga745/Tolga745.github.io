"use client";

// Client-side replacement for the old src/middleware.ts (middleware cannot run on a static site).
// Same rules: protected sections need a session, and manager sections need the matching role.

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from '@/mock/auth';

const PROTECTED = ['/product-mgr', '/sales-mgr', '/admin', '/user'];
const PRODUCT_MANAGER_PAGES = ['/product-mgr', '/admin'];
const SALES_MANAGER_PAGES = ['/sales-mgr', '/admin'];

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

function redirectFor(path: string, role: string | null): string | null {
  if (!startsWithAny(path, PROTECTED)) return null;
  if (!role) return '/auth/signin';
  if (role === 'admin') return null;
  if (startsWithAny(path, PRODUCT_MANAGER_PAGES) && role !== 'product_manager') return '/unauthorized';
  if (startsWithAny(path, SALES_MANAGER_PAGES) && role !== 'sales_manager') return '/unauthorized';
  return null;
}

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { data: session, status } = useSession();

  const isProtected = startsWithAny(pathname, PROTECTED);
  const target = status === 'loading' ? null : redirectFor(pathname, session?.user?.role ?? null);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (isProtected && (status === 'loading' || target)) return null;
  return <>{children}</>;
}
