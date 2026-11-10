/**
 * The shared JSON logger. Keys and Authorization headers are redacted here, so no call site can
 * leak one by logging a whole object.
 */
import { pino } from "pino";
import { loadLogLevel } from "./config.ts";

export type Logger = pino.Logger;

const REDACTED_PATHS = [
  "authorization",
  "apiKey",
  "headers.authorization",
  "req.headers.authorization",
  "request.headers.authorization",
];

export function createLogger(level: string = loadLogLevel()): Logger {
  return pino({ level, redact: { paths: REDACTED_PATHS, censor: "[redacted]" } });
}
