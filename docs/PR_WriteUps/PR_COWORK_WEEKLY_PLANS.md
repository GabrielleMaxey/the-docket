# PR: CoWork weekly plans in Past Reports

## Summary

Surfaces Claude CoWork `weekly-plan-*.md` files from the app `data/` folder in **Past Reports**.

- New **Files** tab lists matching files (live disk reads)
- **Work Week** tab also shows them tagged as CoWork files
- Optional **Save to archive** copies content into SQLite as `week_plan` with `meta.fromCoworkFile`

## Test plan

- [ ] Place `data/weekly-plan-YYYY-MM-DD.md` and open Past Reports → Files → View
- [ ] Confirm the same file appears under Work Week as CoWork file
- [ ] Save to archive → appears as Week plan (from CoWork); survives deleting the `.md` file
- [ ] Invalid / path-traversal filenames return 400
- [ ] `node --test tests/coworkWeeklyPlans.test.mjs` passes

## Base

`gmaxey_bugs` (Past Reports lives on this line, not `main`)
