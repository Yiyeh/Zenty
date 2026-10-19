import { tr } from "../src/lib/i18n.ts";
import { APP_NAME } from "../src/lib/brand.ts";
import { startLocalServer } from "./local-server.ts";
const { url } = await startLocalServer({
  port: Number(process.env.PORT) || 5173,
});
process.stdout.write(tr("start.06a671cd72", { v0: APP_NAME, v1: url }));
