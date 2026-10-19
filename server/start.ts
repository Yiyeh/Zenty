import { APP_NAME } from "../src/lib/brand.ts";
import { startLocalServer } from "./local-server.ts";
const { url } = await startLocalServer({
  port: Number(process.env.PORT) || 5173,
});
process.stdout.write(`${APP_NAME} y tu biblioteca: ${url}\n`);
