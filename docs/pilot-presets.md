# Pilot presets

Shared Epic/JQL presets for the ODI dev pilot. Stored in the local SQLite database (`epic_presets`) and shown on **Dashboard**, **Chat**, and Work Week **Quick pick**.

The seed catalog includes **standard default user JQL filters** (same as Settings → starter template library) plus ODI pilot presets from `presets/pilot-presets.json`.

## Seed into your instance

**Interactive** (pick which presets to add):

```bash
npm run seed:presets
```

**Add all pilot presets:**

```bash
npm run seed:presets -- --all
```

**Add specific presets by label:**

```bash
npm run seed:presets -- --labels "Dev Team,MCP - Ask Greg"
```

**List catalog without saving:**

```bash
npm run seed:presets -- --list
```

**Update if label already exists** (replace JQL):

```bash
npm run seed:presets -- --all --force
```

The script uses the running API (`http://127.0.0.1:8787`) when available; otherwise it writes directly to `data/workweek.sqlite`. Start the app once (`npm run dev:api` or `npm run dev:all`) before seeding if the database does not exist yet.

## Catalog file

Edit `presets/pilot-presets.json` to add or change shared presets, then re-run the seed command.

| Label | Type | Notes |
|-------|------|--------|
| My Open Work | JQL | Standard user filter |
| My Overdue Work | JQL | Standard user filter |
| Unassigned High Priority | JQL | Standard user filter |
| Recently Updated (7 days) | JQL | Standard user filter |
| Blocked or On Hold | JQL | Standard user filter |
| Dev Team | JQL | ODI assignee list + open statuses |
| MCP - Ask Greg | JQL | ODI-23066 / ODI-18520 tree |
| SeaTool | JQL | ODI-22128 tree |
| Kronos | JQL | ODI-22128 + ODI-3480 |
| Vendor Scrape | JQL | ODI-18274 + ODI-3480 |
| Nora | JQL | Summary/parent filter for Nora work |
| GAM | JQL | Fiber GCR clean service impact automation / ODI-22288 |
| IP Large Project | JQL | ODI-14817 parent tree |

After seeding, open **Settings → Epic & JQL presets** to confirm, then use presets on Dashboard or Work Week.
