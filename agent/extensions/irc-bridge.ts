import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

const INBOX = "/tmp/irc-inbox.jsonl";
const FIFO = "/tmp/irc-bot.fifo";
const LAST_SEEN = "/tmp/irc-ext-last-id";

// Observer mode: listen to all IRC messages but only act on messages from
// the driver (shift). Messages from others are awareness-only context.
// Set PI_IRC_OBSERVER=true to enable.
const OBSERVER_MODE = process.env.PI_IRC_OBSERVER === "true";

// The driver's IRC nick — only messages from this sender are treated as
// real instructions. Everything else is awareness-only context.
const DRIVER_NICK = "shift";

// Observer uses a separate last-seen file to avoid racing with the driver.
// Without this, the observer reads new messages first, updates the shared
// counter, and the driver never sees them.
const LAST_SEEN_FILE = OBSERVER_MODE
  ? "/tmp/irc-ext-last-id-observer"
  : LAST_SEEN;

export default function (pi: ExtensionAPI) {
  let lastSeenId = 0;
  let ircTurnActive = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Restore last seen
  try {
    lastSeenId = parseInt(fs.readFileSync(LAST_SEEN_FILE, "utf-8").trim()) || 0;
  } catch {
    lastSeenId = 0;
  }

  function sendToIrc(text: string) {
    try {
      // IRC doesn't handle embedded newlines — collapse to single line
      // The Python bot handles length-based chunking
      const cleaned = text.trim().replace(/\n+/g, " | ");
      if (cleaned) {
        fs.writeFileSync(FIFO, cleaned);
      }
    } catch {
      // FIFO may not be ready
    }
  }

  // Forward assistant responses to IRC when the turn was triggered by the driver.
  // Even in observer mode, we relay our responses back so the mob can see them.
  pi.on("message_end", async (event) => {
    if (!ircTurnActive) return;
    if (event.message.role !== "assistant") return;

    const textBlocks = event.message.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    if (textBlocks.trim()) {
      sendToIrc(textBlocks.trim());
    }
  });

  pi.on("agent_end", async () => {
    ircTurnActive = false;
  });

  // Poll IRC inbox every 2 seconds
  function checkInbox() {
    try {
      if (!fs.existsSync(INBOX)) return;
      const data = fs.readFileSync(INBOX, "utf-8").trim();
      if (!data) return;

      const lines = data.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.id > lastSeenId) {
            lastSeenId = entry.id;
            fs.writeFileSync(LAST_SEEN_FILE, String(lastSeenId));

            const isDriver = entry.from.toLowerCase() === DRIVER_NICK;

            if (OBSERVER_MODE) {
              if (isDriver) {
                // Driver's messages are real instructions — act on them
                ircTurnActive = true;
                pi.sendUserMessage(`${entry.from} on IRC #general: ${entry.msg}`);
              } else {
                // Everyone else is awareness-only context
                pi.sendUserMessage(`FYI from IRC #general (no action needed — for awareness only): ${entry.from}: ${entry.msg}`);
              }
            } else {
              ircTurnActive = true;
              pi.sendUserMessage(`${entry.from} on IRC #general: ${entry.msg}`);
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file read errors
    }
  }

  pollTimer = setInterval(checkInbox, 2000);

  pi.on("session_shutdown", () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("IRC bridge extension loaded", "info");
  });
}
