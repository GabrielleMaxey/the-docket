# Packaged installers are unsupported

Mac DMG and Windows NSIS installers, including unsigned builds, are unsupported. Installer generation commands and the packaging workflow have been removed.

Use a local project checkout with Node, dependencies, and a configured project `.env`:

- `npm run dev:all` starts the browser UI and local API.
- `npm run desktop:dev` starts the local Electron app and its API.

See the [quick start and native SQLite recovery](../README.md#quick-start) or [Jira setup](./JIRA_SETUP.md). If device policy blocks Electron, use browser mode and optionally [install the browser UI as its own application window](./END_USER_GUIDE.md#install-as-its-own-application-window).
