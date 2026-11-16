"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function NotFound() {
  const pathname = usePathname() || '';
  const router = useRouter();
  const productMatch = pathname.match(/^\/product\/([0-9a-f]{24})\/?$/i);
  const productId = productMatch?.[1];

  useEffect(() => {
    // Products created after the build have no pre-rendered page; show them via the query-string route.
    if (productId) router.replace(`/product/view?id=${productId}`);
  }, [productId, router]);

  if (productId) return null;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <a href="/" className="text-blue-600 underline">Go to the home page</a>
    </div>
  );
}
