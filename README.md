# Nobles Ai

Nobles Ai is a school information chat app. The Node.js server serves the web app and its API; PostgreSQL stores accounts, login sessions, and answers users teach the assistant.

## Run locally

Requirements: Node.js 20 or newer, npm, and Docker Desktop (or another PostgreSQL 16 server).

1. In PowerShell, open this project folder.
2. Start the database with `docker compose up -d database`.
3. Copy `.env.example` to `.env`.
4. Install dependencies with `npm install`.
5. Start the app with `npm start`.
6. Open <http://localhost:8080>.

The server creates its database tables automatically at startup. The first visit requires creating an account. Registration and login require a username of 3–24 letters, numbers, or underscores; new account passwords must be at least 8 characters.

Keep the backend running while using the app. When opening `index.html` directly or through a common local preview port, the page sends API requests to `http://localhost:8080`; otherwise it uses the page's own origin.

To stop the database, run `docker compose down`. Database contents are kept in the Docker volume; to remove the volume and its data, run `docker compose down -v`.

## Configuration

Set `DATABASE_URL` to a PostgreSQL connection string and optionally set `PORT` (defaults to `8080`). Keep `.env` private and do not commit it.
