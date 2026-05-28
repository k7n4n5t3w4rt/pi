import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

const INBOX = "/tmp/irc-inbox.jsonl";
const FIFO = "/tmp/irc-bot.fifo";
const LAST_SEEN = "/tmp/irc-ext-last-id";

// Observer mode: listen to all IRC messages but never respond to IRC.
// Set PI_IRC_OBSERVER=true to enable (this session listens, driver speaks).
const OBSERVER_MODE = process.env.PI_IRC_OBSERVER === "true";

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

  // Capture assistant text and forward to IRC when this turn was IRC-triggered.
  // Skipped in observer mode — agent listens but does not speak in IRC.
  if (!OBSERVER_MODE) {
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
  }

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
            if (!OBSERVER_MODE) {
              ircTurnActive = true;
            }
            if (OBSERVER_MODE) {
              pi.sendUserMessage(`FYI from IRC #general (no action needed — for awareness only): ${entry.from}: ${entry.msg}`);
            } else {
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
