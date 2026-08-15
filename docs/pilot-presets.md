# Preset seeding

`npm run seed:presets` bulk-loads Epic/JQL presets into local SQLite
(`epic_presets`) from a JSON catalog file, so a team doesn't have to add
each preset by hand through Settings → **Epic & JQL presets**. Seeded
presets show up on **Dashboard**, **Chat**, and Work Week **Quick pick**
the same as manually-added ones.

There's no catalog file bundled with the app — write your own following
the format below, then point the script at it.

## Catalog format

A JSON file with a `presets` array. Each entry:

```json
{
  "presets": [
    {
      "presetType": "jql",
      "label": "My Current Issues",
      "jql": "assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC, updated DESC"
    },
    {
      "presetType": "epic",
      "label": "Example Project",
      "epicKey": "ODI-1234"
    }
  ]
}
```

- `presetType`: `"jql"` for a saved query, `"epic"` for a single epic tracked by key
- `label`: shown in the app as the preset's name
- `jql`: required for `"jql"` presets — any valid JQL string
- `epicKey`: required for `"epic"` presets — the Jira issue key of the epic

## Seed into your instance

**Interactive** (pick which presets to add):

```bash
npm run seed:presets -- --file path/to/your-presets.json
```

**Add all presets from the file:**

```bash
npm run seed:presets -- --file path/to/your-presets.json --all
```

**Add specific presets by label:**

```bash
npm run seed:presets -- --file path/to/your-presets.json --labels "My Current Issues,Example Project"
```

**List catalog without saving:**

```bash
npm run seed:presets -- --file path/to/your-presets.json --list
```

**Update if label already exists** (replace JQL):

```bash
npm run seed:presets -- --file path/to/your-presets.json --all --force
```

The script uses the running API (`http://127.0.0.1:8787`) when available;
otherwise it writes directly to `data/workweek.sqlite`. Start the app once
(`npm run dev:api` or `npm run dev:all`) before seeding if the database
does not exist yet.

After seeding, open **Settings → Epic & JQL presets** to confirm, then use
presets on Dashboard or Work Week.
