// Routes every `/api/*` request made with fetch() or axios to the in-browser mock API.
// Imported once from the root layout.

import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { handleMockRequest, isMockApiUrl, MockResponse } from './api';
import { resetDb } from './db';

const LATENCY_MS = 80; // small delay so the UI behaves like it talks to a real server

const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));

function parseBody(raw: unknown): unknown {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function toFetchResponse(res: MockResponse): Response {
  const headers = new Headers(res.headers);
  if (res.blob) {
    headers.set('Content-Type', res.blob.type || 'application/octet-stream');
    return new Response(res.blob, { status: res.status, headers });
  }
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(res.body ?? null), { status: res.status, headers });
}

function installFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), window.location.href);
    if (!isMockApiUrl(url)) return originalFetch(input, init);

    const method = init?.method ?? request?.method ?? 'GET';
    let body: unknown = init?.body;
    if (body === undefined && request && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      body = await request.clone().text();
    }
    await wait();
    return toFetchResponse(await handleMockRequest(method, url, parseBody(body)));
  };
}

function installAxios() {
  const fallback = axios.getAdapter(axios.defaults.adapter);
  axios.defaults.adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = new URL(axios.getUri(config), window.location.href);
    if (!isMockApiUrl(url)) return fallback(config);

    await wait();
    const res = await handleMockRequest(config.method ?? 'get', url, parseBody(config.data));
    let data: unknown = res.body;
    if (res.blob) data = config.responseType === 'blob' ? res.blob : await res.blob.arrayBuffer();
    else if (config.responseType === 'blob') data = new Blob([JSON.stringify(res.body)], { type: 'application/json' });

    const response: AxiosResponse = {
      data,
      status: res.status,
      statusText: String(res.status),
      headers: { 'content-type': res.blob ? res.blob.type : 'application/json', ...(res.headers || {}) },
      config,
      request: {},
    };
    const validate = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
    if (!validate(res.status)) {
      throw new AxiosError(
        `Request failed with status code ${res.status}`,
        res.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response,
      );
    }
    return response;
  };
}

declare global {
  interface Window {
    __mockApiInstalled?: boolean;
    __resetMockDb?: () => void;
  }
}

if (typeof window !== 'undefined' && !window.__mockApiInstalled) {
  window.__mockApiInstalled = true;
  installFetch();
  installAxios();
  window.__resetMockDb = () => {
    resetDb();
    window.location.reload();
  };
}

export {};
