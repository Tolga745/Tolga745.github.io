# best-308

A base for boutique fashion market websites with ease of deployment.

This branch is a **static demo** of the store, published with GitHub Pages. It has no server
and no database:

- Every `/api/...` call made by the pages is answered in the browser by a fake backend in
  [`src/mock`](src/mock). It keeps its data in the browser's `localStorage` and starts from the
  seed data in [`src/mock/db.ts`](src/mock/db.ts).
- Sign-in is also faked ([`src/mock/auth.tsx`](src/mock/auth.tsx)). The old `middleware.ts`
  access rules are enforced client-side by [`RouteGuard`](src/components/RouteGuard.tsx).
- No emails are sent. Password-reset links are written to the browser console instead.
- Each browser has its own copy of the data. To reset it, clear the site's local storage or
  run `window.__resetMockDb()` in the console.

## Demo accounts

All accounts use the password `Password123!`.

| Email               | Role            |
| ------------------- | --------------- |
| semih@example.com   | customer        |
| eren@example.com    | customer        |
| ege@example.com     | product_manager |
| burak@example.com   | product_manager |
| pome@example.com    | sales_manager   |
| tolga@example.com   | admin           |

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000
```

To build the static site exactly as GitHub Pages serves it:

```bash
npx next build       # writes the site to out/
python -m http.server 4173 --directory out
```

## Deployment

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds the site and
deploys `out/` to GitHub Pages on every push to `dev`. It can also be run by hand from the
Actions tab. In the repository settings, **Pages → Source** must be set to **GitHub Actions**.
