# Gouno Blog Frontend

React + TypeScript + Vite single-page app for the Gouno Blog portal. It serves the public blog feed, article pages, comments, account settings, and the admin content workspace. Authentication is delegated to GOSSO through OIDC/OAuth2.

## Local Development

Install dependencies:

```bash
npm ci
```

Start the Vite dev server:

```bash
npm run dev
```

The full local product is normally accessed through the root Docker Compose gateway at `http://localhost:8080`, which proxies:

- `/` to this frontend
- `/api/` to `blog-backend`
- `/callback` back to this SPA for OIDC callback handling

## Environment Variables

The app works behind the gateway without extra frontend configuration. Override these only when connecting to a different GOSSO issuer or OAuth client:

```bash
VITE_GOSSO_ISSUER=http://localhost:8080
VITE_GOSSO_CLIENT_ID=blog-spa
```

The redirect URI is derived from the current browser origin as `${window.location.origin}/callback`.

## Available Scripts

```bash
npm run dev       # start local development server
npm run lint      # run oxlint
npm run test:run  # run Vitest once
npm run test      # run Vitest in watch mode
npm run build     # type-check and build production assets
npm run preview   # preview built assets
```

## MVP Behavior

- Public feed loads paginated posts from `/api/posts?page=&pageSize=`.
- Tags load from `/api/tags`; the selected tag is sent to the backend as `tag`.
- Article pages resolve by slug and load comments using the resolved numeric post ID.
- Article content supports a small Markdown subset: headings, paragraphs, bullet lists, links, inline code, bold, emphasis, and fenced code blocks.
- Admin workspace requires a logged-in account with the `admin` role and redirects through GOSSO when access is missing.

## Testing Notes

The test suite uses React Testing Library and Vitest. Current coverage focuses on:

- auth storage and admin role detection
- login/MFA behavior
- feed pagination and client-side search
- article markdown rendering and comment posting
- admin access redirect and save error handling
