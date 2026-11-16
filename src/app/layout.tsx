"use client"; // Enable client-side rendering for layout

import './fonts/global.css'; // Adjust path if needed

// Static demo: all /api/* calls are answered in the browser from a localStorage mock database.
import '@/mock/install';

import { Suspense } from 'react';
import { SessionProvider } from '@/mock/auth';
import RouteGuard from '@/components/RouteGuard';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <Suspense fallback={null}>
            <RouteGuard>{children}</RouteGuard>
          </Suspense>
        </SessionProvider>
      </body>
    </html>
  );
}
