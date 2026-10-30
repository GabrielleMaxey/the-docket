# Ports and running locally

[← Jira setup](../JIRA_SETUP.md)

## Ports

| Service | Default port | Config |
|---------|-------------|--------|
| Vite dev server (UI) | `5173` | `vite.config.js` |
| Express proxy (API) | `8787` | `API_PORT` in `.env` |

If a port is already in use:

**macOS / Linux:**
```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN
```

**Windows (PowerShell or CMD):**
```cmd
netstat -ano | findstr :8787
```

## Desktop app (local Electron development)

Packaged installers, including unsigned Mac `.dmg` and Windows NSIS installers, are unsupported. The installer scripts and packaging workflow have been removed. Use the project checkout, Node, dependencies, and project `.env` described above, then run:

```bash
npm run desktop:dev
```

Electron starts the local proxy and loads the Vite UI at `http://localhost:5173`. Local development uses the project `.env` and `data/` folder. If a native SQLite ABI error persists, stop the app and run `npm run desktop:doctor` to rebuild for Electron and relaunch.

For browser mode, stop the desktop workflow and run `npm run dev:all`; its API startup rebuilds SQLite for Node. If needed, run `npm rebuild better-sqlite3` first. On devices that block Electron, use browser mode and optionally [install the browser UI as its own application window](../user/getting-started.md#install-as-its-own-application-window).

## Browser vs desktop mode

| Mode | How the proxy URL is resolved |
|------|------------------------------|
| Desktop (dev) | Vite at `localhost:5173`; proxy spawned by Electron; repo `data/` + `.env` |
| Browser dev (`dev:all`) | Vite proxies `/api/*` to `localhost:8787` via `vite.config.js` |
| Browser production | Set **App URL** in Settings → Past due rules to `http://localhost:8787` |

---

[← Jira setup](../JIRA_SETUP.md)
