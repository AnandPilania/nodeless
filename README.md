# nodeless

A desktop-style development workbench for Node.js — the ddless.com concept, rebuilt for the Node/JS ecosystem instead of PHP.

Debug-free method execution, script/task running with live output, and a real database connector/viewer, all in one local web app. No Xdebug equivalent needed, no editor plugins.

## What it does

- **File explorer** — browse any Node.js project on disk, open and edit files (Monaco editor), run any `.js`/`.ts` file directly with one click.
- **npm script runner** — reads `package.json`, lists every script, runs it as a real child process, streams stdout/stderr live over WebSocket, lets you stop it mid-run.
- **Snippet / method runner** — paste or write an arbitrary JS snippet, run it in an isolated worker thread with a hard timeout, get back the returned value, captured `console.*` output, and clean error/stack traces. This is the "test a method without writing a whole script" feature.
- **Framework detection** — inspects `package.json` dependencies and flags Express, Fastify, NestJS, Koa, Next.js, Hapi, Prisma, TypeORM, Sequelize, Mongoose, Socket.IO, GraphQL.
- **Live preview** — for React, Vue, Svelte, or plain HTML files, render live in a sandboxed iframe, the way modern AI coding tools do. Works for a single self-contained component or a multi-file component tree (local relative imports are resolved automatically), with or without npm dependencies already installed — dependencies are resolved at runtime from esm.sh rather than requiring a local build step. Also detects and injects common CSS frameworks (Tailwind, Bootstrap, Bulma, UnoCSS) when present in `package.json` or config files. Toggle between code / split / preview from the Editor tab. Compile and runtime errors surface inline instead of a blank screen. Built on a plugin architecture — see "Extending live preview" below.
- **Database connector/viewer** — connect to PostgreSQL, MySQL, or SQLite with real drivers. Browse schemas, tables, columns (with primary-key detection), paginated row viewing, and a free-form SQL runner.

## Architecture

```
nodeless/
  server/   Express + TypeScript backend, WebSocket bridge, process runner,
            worker-thread snippet sandbox, DB adapters (pg / mysql2 / better-sqlite3)
  client/   React + TypeScript (Vite) frontend, Monaco editor, dark workbench UI
```

The backend never runs on `localhost` alone in production use — it's meant to run alongside whatever project you're developing, with `WORKSPACE_ROOT` pointed at that project's folder (or switched live from the UI's root field).

## Running it

### 1. Backend

```bash
cd server
npm install
WORKSPACE_ROOT=/path/to/your/project npm run dev
```

Starts on `http://localhost:4310` by default (override with `PORT`).

### 2. Frontend

```bash
cd client
npm install
npm run dev
```

Starts on `http://localhost:5173` and proxies `/api` and `/ws` to the backend on port 4310.

Open `http://localhost:5173` in a browser. Use the root field in the top bar to point the workbench at any project on disk without restarting the server.

### Production build

```bash
cd server && npm run build && npm start
cd client && npm run build   # outputs static files to client/dist — serve with any static host
```

## Database connections

Connections are created via the "+" button in the Database tab. They live in server memory only — nothing is persisted to disk, and passwords are never sent back to the frontend after creation (`hasPassword` boolean only).

- **SQLite** — just a file path on the machine running the backend.
- **PostgreSQL / MySQL** — host, port, database, user, password, optional SSL.

## Security notes

This tool executes arbitrary code and SQL by design — it's a local development tool, not something to expose on a public network. Run it bound to `localhost`/trusted networks only. The snippet runner uses Node's `vm` module inside a `worker_thread` with a wall-clock timeout, which isolates the snippet from the main process but is not a hardened security sandbox — don't run untrusted code from strangers through it.

The live preview iframe is sandboxed and loaded from the backend's own origin (see "Why the preview is served by the backend" below) — it cannot read the real nodeless app's cookies, localStorage, or DOM, and the backend's in-memory preview store is not exposed on any port beyond the one nodeless itself listens on.

## How live preview works

There's no bundler, no dev server per project, no `node_modules` requirement. When you open a supported file and switch to split or preview mode:

1. The backend walks that file's local (relative) `import`/`require` statements recursively and returns every file in that local dependency graph — this is real filesystem traversal, not a guess.
2. The frontend picks a **preview provider** based on the file (see below), which compiles the entry file and its local module graph entirely in the browser.
3. Bare imports (`react`, `vue`, `svelte`, `lodash`, any npm package) are resolved at runtime from `esm.sh`, using the version pinned in the project's `package.json` if present, otherwise latest.
4. The compiled HTML document is sent to the backend (`POST /api/preview`) and served back from the backend's own origin (`GET /preview/:id`). The iframe's `src` points at that backend URL rather than using `srcDoc`.
5. Compile errors (bad syntax, unresolved imports) and runtime errors (thrown exceptions, render errors) are both caught and rendered directly in the preview panel instead of a blank white screen.

This means it works identically whether the file is part of a fully installed project or a single orphaned file with no `package.json` at all.

### Why the preview is served by the backend instead of `srcDoc`

The iframe uses `sandbox="allow-scripts allow-same-origin"`. That combination is only safe when the framed document's origin is genuinely different from the parent page's origin — otherwise the framed content could reach the parent's real cookies, storage, and DOM. `srcDoc` and blob URLs created by the parent page both **inherit the parent's own origin**, which would make `allow-same-origin` unsafe with either of them.

Serving the compiled preview from the backend (`GET /preview/:id`, a different host:port than the frontend app) gives the iframe a real, distinct origin. That's what makes it safe to include `allow-same-origin`, which in turn is what makes `document.cookie`, `localStorage`, and `sessionStorage` behave like a normal page instead of throwing — `document.cookie` in particular is a spec-mandated unforgeable property on sandboxed documents and can't be patched around from inside the iframe, so this had to be solved via origin separation rather than a JS shim. Real apps with routers, auth stores, or analytics that touch these on init now work in preview instead of crashing.

Stored preview documents are kept in memory on the backend for 5 minutes and are not persisted to disk. If you deploy the backend and frontend on different machines, set `VITE_BACKEND_ORIGIN` when building the client so the preview iframe points at the right backend URL.

### `import.meta` handling

Every module in the preview runtime executes inside `new Function("module", "exports", "require", code)` — deliberately, since that's what makes the custom `require()`/module-graph resolution possible without a real bundler. That means the module body runs as an ordinary function, not a real ES module, and `import.meta` is a hard syntax error in that context (it's only legal syntax inside actual ES modules). This shows up in real projects more often than you'd expect, since Vite itself injects `import.meta.env.*` and `import.meta.url` into a lot of otherwise-unrelated code.

`src/preview/importMetaShim.ts` is a small Babel plugin, applied in every JS-based provider's transpile step, that rewrites `import.meta` expressions to a shimmed `__importMeta` object (`{ env: {}, url: "", hot: undefined }`) before the CommonJS transform runs. This covers `import.meta.env.VITE_*`, `import.meta.url`, and `import.meta.hot` guard checks (the `hot` value is always falsy, since Hot Module Replacement doesn't apply to a static compiled preview). It does not attempt to actually populate `import.meta.env` with your project's real `.env` values — those come through as `undefined`, which is usually fine for rendering purposes but worth knowing if a component's initial render depends on a specific env value being present.

### Entry points that mount themselves (`main.tsx`-style files)

Not every entry file exports a component. A real Vite project's `main.tsx`/`main.ts` typically looks like:

```tsx
createRoot(document.getElementById("root")!).render(<App />);
```

— it mounts itself as a side effect of running, rather than exporting anything preview-friendly. Each provider handles both shapes: if the entry module's default export is a usable component, the provider mounts it itself; if not, it checks whether the entry already mounted something into a recognized root element (`root`, `app`, `preview-root`, or the id detected from the project's actual `index.html` — see below) before reporting an error, so `main.tsx`-style entries render normally.

The shell always provides `#root`, `#app`, and `#preview-root` divs regardless of framework, since those are the default mount ids used by Vite's official React and Vue templates respectively. On top of that, `LivePreview.tsx` scans the workspace for an `index.html` and extracts the actual mount div id from it (falling back to the defaults above when none is found), so projects using a custom id still work.

### A note on embedding real source code inside the preview document

The module graph's transpiled source is embedded as JSON data inside the shell document's own `<script>` tag. If a project's source code happens to contain the literal substring `</script>` anywhere (a string, a comment, template text — this is common in any project that talks about HTML), naively embedding that via `JSON.stringify` would prematurely close the shell's own script tag and corrupt the rest of the document — everything after would be parsed as page text instead of executed, and any HTML/script tags after it (like the CSS framework CDN injection) would end up mangled. `shell.ts` guards against this by escaping `<`, `>`, and `&` to their Unicode escapes before embedding, so this can't happen regardless of what the previewed source code contains.

### Supported frameworks today

| Framework | Extensions | Compiler |
|---|---|---|
| React | `.jsx`, `.tsx`, JSX-flavored `.js` | Babel standalone (JSX + TS presets → CommonJS) |
| Vue | `.vue` | `@vue/compiler-sfc` (script + template + scoped styles) |
| Svelte | `.svelte` | `svelte/compiler` (Svelte 5 client-generation mode) |
| Plain HTML | `.html`, `.htm` | none — rendered directly, with local `<link>`/`<script src>` inlined |

### CSS framework detection

Independent of which JS framework is active, `src/preview/cssFrameworks.ts` detects Tailwind, Bootstrap, Bulma, and UnoCSS from `package.json` dependencies or the presence of their config files (e.g. `tailwind.config.js`) anywhere in the resolved module graph, and injects the right CDN `<link>`/`<script>` into the preview's `<head>`.

### Extending live preview — plugin architecture

Everything routes through `client/src/preview/`:

- `types.ts` — the `PreviewProvider` interface every framework implements: `detect(filePath, content)` decides ownership of a file, `compile(input)` returns the iframe HTML document.
- `registry.ts` — the list of active providers, checked in order. **This is the only file you need to touch to wire in a new provider.**
- `graphBundler.ts` — framework-agnostic: walks the local import graph and calls your transpile function per file. Reused by every JS-based provider.
- `shell.ts` — the shared iframe HTML shell: error boundary, `esm.sh` external-dependency loader, the `require()`/module-instantiate runtime. Reused by every provider that isn't plain HTML.
- `cssFrameworks.ts` — CSS framework detectors/injectors, independent of JS framework.
- `providers/` — one file per framework (`reactProvider.ts`, `vueProvider.ts`, `svelteProvider.ts`, `htmlProvider.ts`).

To add a new framework (say, Solid or Angular):

1. Create `providers/solidProvider.ts` implementing `PreviewProvider`.
2. Use `buildGraphBundle(entry, modules, transpileFn)` if it's a graph-of-JS-files framework, writing a `transpileFn` that compiles that framework's syntax to CommonJS (most compilers, including Solid's Babel plugin, can target CJS directly).
3. Build a `mountScript` string (plain JS, runs inside the iframe) that instantiates the entry module and mounts it into `#preview-root`, then call `buildShellDocument({ ...bundle, mountScript, headInjection })`.
4. Add the provider to the array in `registry.ts`. Order matters only where `detect()` isn't extension-exclusive (React's content-sniffing on plain `.js` is the one example here — keep extension-exclusive providers ahead of it).

To add a new CSS framework, add a `CssFrameworkInjector` to `cssFrameworks.ts` — a `detect()` that checks `package.json` deps or config file presence, and a `buildHeadInjection()` that returns the CDN tag(s).


