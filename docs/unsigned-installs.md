# Unsigned installers (pilot)

Unsigned desktop builds **can** be installed, but macOS and Windows will warn or block until users bypass OS trust UI. Signing makes install/open feel normal for non-developers.

This app’s `package.json` `build` config has **no signing or notarization**. CI produces installable DMG/NSIS; friction is OS trust, not a broken build.

## macOS DMG

| Unsigned (pilot) | Signed + notarized (production) |
|------------------|----------------------------------|
| DMG opens; user drags app to Applications | Same, without Gatekeeper block |
| First launch: “developer cannot be verified” | Opens normally |
| Workaround: **Right-click → Open**, or System Settings → Privacy & Security → **Open Anyway** | No workaround |
| Needs Apple Developer ID + notarization | Standard for wide distribution |

## Windows NSIS

| Unsigned (pilot) | Signed (production) |
|------------------|---------------------|
| Installer runs | Same |
| SmartScreen: “Windows protected your PC” | Shows publisher name |
| Workaround: **More info → Run anyway** | Usually no prompt |
| Needs Authenticode certificate | Standard for IT-friendly rollout |

## Practical guidance

**Option A — unsigned (common for small pilots)**  
Ship DMG/NSIS from CI; brief testers on the one-time Gatekeeper / SmartScreen bypass.

**Option B — signed (broader rollout)**  
Wire Apple Developer + notarization and/or Windows Authenticode into `electron-builder` (e.g. `CSC_LINK` / notarize env vars in CI).

## When Electron is blocked entirely

On locked-down work Macs, XProtect may remove Electron or the packaged app. Prefer the **browser UI**:

1. `npm run dev:all`
2. Open http://localhost:5173
3. Optional: Chrome/Edge **Install as app** (see [END_USER_GUIDE.md](./END_USER_GUIDE.md#using-task-manager-in-the-browser-when-the-desktop-app-is-unavailable))

## Bottom line

- Unsigned installers work with user overrides.
- Smooth “double-click and go” needs signing.
- For pilots blocked by malware/Gatekeeper on Electron, use browser / Install-as-app instead.
