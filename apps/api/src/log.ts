import pino from "pino";
import { config } from "./config.ts";

export const log = pino({
  level: config.logLevel,
  ...(config.production ? {} : { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }),
});

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
