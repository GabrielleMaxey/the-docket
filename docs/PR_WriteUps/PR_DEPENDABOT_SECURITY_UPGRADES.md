# PR: Dependabot security dependency upgrades

## Summary

Clears Dependabot / `npm audit` critical and high advisories by bumping vulnerable direct dependencies, upgrading `icon-gen` off the abandoned PhantomJS/`request` chain, and pinning patched `sharp` via an override. Production dependencies audit clean; remaining findings are moderate and limited to the `electron-builder` toolchain.

## Problem

| Symptom | Root cause |
|---------|------------|
| Dependabot / `npm audit` reported 41 vulnerable packages (5 critical, 22 high) | Outdated direct deps (`multer`, `concurrently`, `electron`, `icon-gen`, `wait-on`) and vulnerable transitives (`proxy-addr`, `shell-quote`, `axios`, `request`, etc.) |
| Critical `request` / old `form-data` in the tree | `icon-gen@2` → `svg2png` → `phantomjs-prebuilt` → abandoned `request` |
| High `sharp` / libvips advisories after `icon-gen@5` | `icon-gen@5` still depends on `sharp@^0.33.4` |

## Changes

- **Runtime** — `multer` → `^2.4.0`; lockfile resolves patched `proxy-addr@2.0.8` under Express.
- **Dev tooling** — `concurrently` → `^10.0.6` (patched `shell-quote`); `electron` → `^43.7.9` (within Electron 43); `wait-on` → `^9.5.1` (patched `axios`).
- **Icon generation** — `icon-gen` → `^5.0.0` (Sharp-based; removes PhantomJS/`request`); regenerate `build/icons/icon.icns` / `icon.ico`.
- **Override** — `overrides.sharp` → `^0.35.5` so the icon pipeline uses patched libvips bindings.

## Test plan

- [x] `npm audit` — 0 critical / 0 high (8 moderate remain on `electron-builder` / `@electron/get`)
- [x] `npm audit --omit=dev` — 0 vulnerabilities
- [x] `npm run desktop:generate-icons` — produces valid `icon.icns` and `icon.ico`
- [ ] After pull: `npm install` (and `npm run desktop:rebuild-native` if using Electron)
- [ ] Smoke `dev:all` / desktop pack if touching packaging locally

## Files touched

| Path | Change |
|------|--------|
| `package.json` | Dependency bumps + `sharp` override |
| `package-lock.json` | Lockfile refresh |
| `build/icons/icon.icns` | Regenerated with `icon-gen@5` |
| `build/icons/icon.ico` | Regenerated with `icon-gen@5` |
| `docs/PR_WriteUps/PR_DEPENDABOT_SECURITY_UPGRADES.md` | This write-up |

## Follow-ups (not in this PR)

- P1: Address remaining moderate `electron-builder` / `@electron/get` / `global-agent` chain without force-downgrading to 26.5.0
- P2: Optional Electron 43 → 44 major bump
- P3: Add `.github/dependabot.yml`
