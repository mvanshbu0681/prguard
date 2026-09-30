import SmeeClient from "smee-client";
import { config } from "../config.ts";
import { log } from "../log.ts";

/** Forwards webhooks from the smee.io channel to this process (local development only). */
export async function startRelay(): Promise<void> {
  const source = config.github.webhookProxyUrl;
  if (!source) return;
  const relayLog = log.child({ mod: "relay" });
  const smee = new SmeeClient({
    source,
    target: `http://localhost:${config.port}/api/webhooks`,
    logger: { info: () => {}, error: (...args: unknown[]) => relayLog.warn(args.map(String).join(" ")) },
  });
  await smee.start();
  relayLog.info("webhook relay connected");
}
