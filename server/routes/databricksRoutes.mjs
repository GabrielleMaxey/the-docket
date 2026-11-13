import { checkDatabricksAccess, cleanHostInput } from "../lib/databricksCheck.mjs";
import { HOST_INVALID_MESSAGE } from "../../shared/databricksSetupGuide.mjs";

const readEnv = (name) => String(process.env[name] ?? "").trim();

export const registerDatabricksRoutes = (
  app,
  { withSiteOperation = (handler) => handler, check = checkDatabricksAccess } = {},
) => {
  // Credentials come only from process.env; nothing is read from the request.
  app.get(
    "/api/databricks/status",
    withSiteOperation((_req, res) => {
      res.json({
        tokenSet: Boolean(readEnv("DATABRICKS_TOKEN")),
        hostConfigured: Boolean(readEnv("DATABRICKS_HOST")),
        endpointConfigured: Boolean(readEnv("DATABRICKS_ENDPOINT")),
      });
    }),
  );

  app.post(
    "/api/databricks/test",
    withSiteOperation(async (_req, res) => {
      const rawHost = readEnv("DATABRICKS_HOST");
      let host = "";
      if (rawHost) {
        const cleaned = cleanHostInput(rawHost);
        if (!cleaned.ok) {
          res.json({ ok: false, user: null, code: "host_invalid", message: HOST_INVALID_MESSAGE, checks: [] });
          return;
        }
        host = cleaned.host;
      }
      const result = await check({
        host,
        token: readEnv("DATABRICKS_TOKEN"),
        endpoint: readEnv("DATABRICKS_ENDPOINT"),
      });
      res.json(result);
    }),
  );
};
