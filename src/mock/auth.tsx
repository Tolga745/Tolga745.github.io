"use client";

// Drop-in replacement for the parts of `next-auth/react` this app uses.
// Sessions are stored in localStorage and checked against the mock database.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getDb } from './db';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Session {
  user: SessionUser;
  expires: string;
}

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  data: Session | null;
  status: Status;
  update: () => Promise<Session | null>;
}

const SESSION_KEY = 'best308_mock_session';
const SESSION_EVENT = 'best308-session-change';

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expires) < new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  update: async () => null,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    const s = readSession();
    setData(s);
    setStatus(s ? 'authenticated' : 'unauthenticated');
    return s;
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => { refresh(); };
    window.addEventListener(SESSION_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(SESSION_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ data, status, update: refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export async function getSession(): Promise<Session | null> {
  return readSession();
}

interface SignInOptions {
  email?: string;
  password?: string;
  redirect?: boolean;
  callbackUrl?: string;
}

export async function signIn(_provider: string, options: SignInOptions = {}) {
  const { email, password, redirect = true, callbackUrl = '/' } = options;
  const user = getDb().user.find((u) => u.email === email);

  let error: string | null = null;
  if (!user) error = 'USER_NOT_FOUND';
  else if (user.password !== password) error = 'INCORRECT_PASSWORD';

  if (error) {
    return { error, status: 401, ok: false, url: null };
  }

  writeSession({
    user: { id: user!._id, name: user!.username, email: user!.email, role: user!.role },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (redirect) {
    window.location.href = callbackUrl;
  }
  return { error: null, status: 200, ok: true, url: callbackUrl };
}

export async function signOut(options: { callbackUrl?: string; redirect?: boolean } = {}) {
  writeSession(null);
  if (options.redirect !== false) {
    window.location.href = options.callbackUrl ?? window.location.href;
  }
}
