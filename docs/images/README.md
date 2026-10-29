# Documentation images

The main [README](../../README.md), [end-user guide](../END_USER_GUIDE.md) and [Jira setup guide](../JIRA_SETUP.md) use the current mockups below. These are **documentation mockups with synthetic data and simplified layouts**, not screenshots of a live Jira connection or proof of a browser test. Labels and behavior were checked against the implementation on 2026-10-16; all mockups were redrawn on 2026-10-29 from the running app (navigation bar, panel headers, buttons, filters and the Create Jira issue modal), keeping only the controls each document needs.

## Current mockups

| Visual | PNG for documentation | Editable SVG source | What it explains |
| --- | --- | --- | --- |
| Combined Work | [PNG](mockup-combined-work.png) | [SVG](mockup-combined-work.svg) | The preset, selected saved sites, expanded My Metrics and one editable Managed tasks table; List remains an alternative. |
| Team data | [PNG](mockup-team-db-settings.png) | [SVG](mockup-team-db-settings.svg) | Three separate states: off, enabled without configuration, and connected. They are not simultaneous panels in the app. |
| Recovery notice | [PNG](mockup-recovery-notice.png) | [SVG](mockup-recovery-notice.svg) | Dismiss acknowledges the notice without deleting or reassigning older browser data. |
| Week plan | [PNG](mockup-week-plan.png) | [SVG](mockup-week-plan.svg) | Help me plan my week: only the signed-in user's issues, ordered by suggested-order score with reasons, suggested working time, and the optional Include team priorities box. Scores and issue keys are illustrative. |
| Possible existing issues | [PNG](mockup-duplicate-check.png) | [SVG](mockup-duplicate-check.svg) | Create Issue duplicate check: the panel above Close/Create with Create anyway and Dismiss, and a `[label] short ask` title. |

All new names, issue keys, counts and `.example.test` hosts are illustrative. Example hosts are not deployment configuration or additions to the app's Jira hostname allowlist. The mockups omit some controls and spacing to keep the documented behavior readable. The recovery image is a before/after explanation, not a pixel-exact banner layout.

## Refreshing these assets

1. Check visible wording and behavior against the owning components: `src/Pages/CombinedOpenWork.jsx`, `src/Pages/components/MyMetricsSection.jsx`, `src/Pages/components/JiraResultsTable.jsx`, `src/Pages/Settings/components/TeamPriorityDemoSection.jsx`, `src/AppRouter.jsx`, `src/Pages/components/WeeklyPlanPanel.jsx` (with `shared/workPriorityScore.mjs` for score values), and `src/Pages/components/CreateIssueModal.jsx`.
2. Edit the corresponding SVG source, retaining its title/description and visible mockup label. Keep text selectable in the source. Use synthetic content; do not include personal/company issue text, account names, credentials or real hostnames.
3. Export the SVG to a PNG with the same basename and native dimensions. On macOS, for example (or render the SVG in Chromium/Playwright at the SVG's own width and height):

   ```sh
   sips -s format png docs/images/mockup-team-db-settings.svg --out docs/images/mockup-team-db-settings.png
   ```

   Run this from the repository root. SVG-capable image editors can also export the PNG; no new app dependency is required.
4. Open each PNG at full size and at README width. Check clipping, exact warning text, disabled/enabled controls, and legibility. Update captions and alt text when the meaning changes.
5. Commit the source, raster export and affected documentation together.

## Older screenshots

The existing `screenshot-*.png` files are retained as historical interface references. Their provenance and capture dates were not re-established during this update. The main README places them in a collapsed gallery marked as older screenshots; they should not be used to establish current behavior, current test coverage or current data handling.
