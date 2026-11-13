// Copy and constants for guided Databricks setup. Pure data: no imports, so both the
// setup script and the React app can use it. All values here are non-sensitive.

export const TOKEN_LIFETIME_DAYS = 364;
export const TOKEN_COMMENT = "The Docket";
export const SETUP_COMMAND = "npm run setup:databricks";

// Provisional path (Phase 0 may refine it); appended to the workspace address in the guide.
export const ACCESS_TOKENS_PATH = "/settings/user/developer/access-tokens";

export const DEVELOPER_ROLE_MESSAGE =
  "Your Databricks account may not have API access. Ask your Databricks admin to assign you as a developer.";

export const HOST_INVALID_MESSAGE =
  "That doesn't look like a Databricks workspace address. Copy it from your browser's address bar, for example https://<workspace-host>.";

export const ENDPOINT_INVALID_MESSAGE =
  "Endpoint names have no spaces or slashes. Copy the Name from the Serving page.";

// Where to find each value (spec 5.10). Placeholders only; real values come from the
// user's team and never live in the repo.
export const HOST_GUIDE =
  "Open the Databricks workspace in a browser and copy the address up to the end of the domain, for example https://<workspace-host>. Leave off the path and anything after `?`.";

export const ENDPOINT_GUIDE =
  "In the workspace sidebar open Serving, find the endpoint your team named, and copy its Name (not a display title), for example <serving-endpoint-name>. If unsure which one, ask your team.";

export const TOKEN_GUIDE = `In Databricks open User settings > Developer > Access tokens > Generate new token. Set the lifetime to ${TOKEN_LIFETIME_DAYS} days and the comment to "${TOKEN_COMMENT}". Creating tokens requires developer assignment. Paste the token when the script asks; it is never echoed.`;
