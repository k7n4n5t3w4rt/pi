import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";

const INBOX = "/tmp/irc-inbox.jsonl";
const FIFO = "/tmp/irc-bot.fifo";
const LAST_SEEN = "/tmp/irc-ext-last-id";

export default function (pi: ExtensionAPI) {
  let lastSeenId = 0;
  let ircTurnActive = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Restore last seen
  try {
    lastSeenId = parseInt(fs.readFileSync(LAST_SEEN, "utf-8").trim()) || 0;
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

  // Capture assistant text and forward to IRC when this turn was IRC-triggered
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
          if (entry.id > lastSeenId && entry.from === "kynan") {
            lastSeenId = entry.id;
            fs.writeFileSync(LAST_SEEN, String(lastSeenId));
            ircTurnActive = true;
            pi.sendUserMessage(`kynan on IRC #general: ${entry.msg}`);
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
