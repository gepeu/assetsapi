/**
 * All LLM access lives here. Locally this uses the Claude Code login on this machine, for one
 * person's own use. Anthropic doesn't allow offering that login to other people, so anything
 * other users reach, or any deployment, must set ANTHROPIC_API_KEY. The SDK then uses it with no
 * code change.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

export const DEFAULT_MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 120_000;

export interface CompletionRequest {
  system: string;
  prompt: string;
}

export type Complete = (request: CompletionRequest) => Promise<string>;

export interface RunInfo {
  tools: string[];
  apiKeySource: string;
  model: string;
}

/** Secrets the model's process has no reason to hold. It has no tools, but this limits any mistake. */
const WITHHELD_ENV = /^(AUTH_|S3_|DATABASE_URL$|RWA_XYZ_API_KEY$|LOCAL_STORAGE_SIGNING_SECRET$)/;

function modelEnvironment(): Record<string, string> {
  const env: Record<string, string> = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !WITHHELD_ENV.test(name)) env[name] = value;
  }
  return env;
}

let workingDirectory: string | undefined;

/** An empty folder, so no project files or instructions can be picked up. */
function emptyWorkingDirectory(): string {
  workingDirectory ??= mkdtempSync(join(tmpdir(), "rwa-agent-llm-"));
  return workingDirectory;
}

export function createClaudeComplete(onRun?: (info: RunInfo) => void): Complete {
  return async ({ system, prompt }) => {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), TIMEOUT_MS);
    try {
      for await (const message of query({
        prompt,
        options: {
          model: process.env.AGENT_MODEL ?? DEFAULT_MODEL,
          systemPrompt: system,
          // Removes every tool definition from the request.
          disallowedTools: ["*"],
          settingSources: [],
          maxTurns: 1,
          persistSession: false,
          cwd: emptyWorkingDirectory(),
          // This option replaces the environment rather than adding to it.
          env: modelEnvironment(),
          abortController,
        },
      })) {
        if (message.type === "system" && message.subtype === "init") {
          onRun?.({ tools: message.tools, apiKeySource: message.apiKeySource, model: message.model });
          // Documents are untrusted, so a run that could act on them must never go ahead.
          if (message.tools.length > 0) {
            abortController.abort();
            throw new Error(`Refusing to run: the model was given tools (${message.tools.join(", ")})`);
          }
        }
        if (message.type === "result") {
          if (message.subtype !== "success" || message.is_error) {
            throw new Error(`The model request failed: ${message.subtype}`);
          }
          return message.result;
        }
      }
      throw new Error("The model returned no result");
    } finally {
      clearTimeout(timeout);
    }
  };
}
