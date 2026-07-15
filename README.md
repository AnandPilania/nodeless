# nodeless

A desktop-style development workbench for Node.js — the ddless.com concept, rebuilt for the Node/JS ecosystem instead of PHP.

Debug-free method execution, script/task running with live output, and a real database connector/viewer, all in one local web app. No Xdebug equivalent needed, no editor plugins.

## What it does

- **File explorer** — browse any Node.js project on disk, open and edit files (Monaco editor), run any `.js`/`.ts` file directly with one click.
- **npm script runner** — reads `package.json`, lists every script, runs it as a real child process, streams stdout/stderr live over WebSocket, lets you stop it mid-run.
- **Snippet / method runner** — paste or write an arbitrary JS snippet, run it in an isolated worker thread with a hard timeout, get back the returned value, captured `console.*` output, and clean error/stack traces. This is the "test a method without writing a whole script" feature.
- **Framework detection** — inspects `package.json` dependencies and flags Express, Fastify, NestJS, Koa, Next.js, Hapi, Prisma, TypeORM, Sequelize, Mongoose, Socket.IO, GraphQL.
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
