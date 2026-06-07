# Pi Agent Configuration

## IRC Bridge Extension

This config includes an IRC bridge extension at `agent/extensions/irc-bridge.ts`.

When loaded, it enables real-time chat via IRC:
- Polls `/tmp/irc-inbox.jsonl` for messages from kynan in #general
- Injects IRC messages into the active pi session via `pi.sendUserMessage()`
- Captures assistant responses and relays them back to IRC via `/tmp/irc-bot.fifo`

The relay bot (`irc-bot.py`) must be running for the bridge to work — it connects to ngircd (127.0.0.1:6667) and bridges IRC to the filesystem inbox/FIFO.
