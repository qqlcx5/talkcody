# Remote Control Integration Architecture

This document describes the multi-channel remote control integration in TalkCody, with Telegram as the first supported channel.

## Goals
- Receive messages from mobile chat apps and execute tasks on desktop.
- Stream responses back to chat apps with message edits and chunked delivery.
- Support voice/audio and image attachments.
- Keep configuration simple and persisted in app settings.
- Provide safe access control via allowed chat IDs and group chat blocking.
- Reduce missed messages by keeping the app awake when remote control is enabled.

## Key Components

### Tauri Backend Telegram Gateway (`src-tauri/src/telegram_gateway.rs`)
- Polls Telegram Bot API with `getUpdates`.
- Emits `telegram-inbound-message` events to the frontend on inbound messages.
- Downloads photo, voice, audio, and document attachments to the app data `attachments/` folder.
- Sends outbound replies using `sendMessage` and updates drafts via `editMessageText`.
- Persists last update offset in `telegram-remote-state.json` under app data dir.
- Stores config in `telegram-remote.json` under app data dir.
- Exposes Tauri commands:
  - `telegram_get_config`, `telegram_set_config`, `telegram_start`, `telegram_stop`
  - `telegram_get_status`, `telegram_is_running`
  - `telegram_send_message`, `telegram_edit_message`

### Frontend Remote Chat Service (`src/services/remote/remote-chat-service.ts`)
- Listens for inbound events from channel adapters.
- Creates/loads tasks and starts agent execution via `ExecutionService`.
- Streams updates using `editMessage` and finalizes with chunked sends.
- Handles remote approvals via `EditReviewStore`.
- Supports commands: `/help`, `/new`, `/status`, `/stop`, `/approve`, `/reject`.
- Deduplicates inbound messages by `chatId + messageId`.

### Channel Manager + Adapter (`src/services/remote/remote-channel-manager.ts`)
- Registers channel adapters (Telegram today; others pluggable).
- Normalizes inbound messages into a channel-agnostic shape.
- Routes outbound send/edit requests to the correct channel adapter.

### Media Pipeline (`src/services/remote/remote-media-service.ts`)
- Converts inbound attachments into `MessageAttachment` payloads.
- For audio/voice, uses `aiTranscriptionService` to generate transcription text.
- Ensures images are converted to base64 for LLM ingestion.

### Lifecycle Service (`src/services/remote/remote-control-lifecycle-service.ts`)
- Starts/stops remote chat services based on settings.
- Applies `keep_awake` when remote control is enabled to reduce missed messages.

### Settings UI (`src/components/settings/remote-control-settings.tsx`)
- Lets users configure bot token, allowed chat IDs, poll timeout, and keep-awake.
- Validates token and poll timeout range before saving.

### Storage
- Settings DB (SQLite) stores:
  - `telegram_remote_enabled`, `telegram_remote_token`,
  - `telegram_remote_allowed_chats`, `telegram_remote_poll_timeout`,
  - `remote_control_keep_awake`.
- App data files:
  - `telegram-remote.json` (backend config snapshot).
  - `telegram-remote-state.json` (last update offset).

## Core Flow

### 1. Configuration and Startup
1. User enables Telegram remote control in Settings.
2. Lifecycle service applies keep-awake and starts channel adapter(s).
3. Backend loads config and state, then starts polling loop.

### 2. Polling and Inbound Messages
1. Poll loop calls `getUpdates` with `offset = last_update_id + 1`.
2. For each update, filter out:
   - group chats (negative chat IDs or `chat_type` = group/supergroup),
   - chat IDs not in allowlist.
3. Download attachments (photo, voice, audio, document) to app data.
4. Emit `telegram-inbound-message` to the frontend.
5. Update `last_update_id` and persist state.

### 3. Task Execution
1. Frontend creates or reuses a task for the chat.
2. User message and attachments are stored and `ExecutionService` starts agent run.
3. Task settings force plan auto-approval for remote runs.

### 4. Streaming Output
1. Execution streaming content is observed from `ExecutionStore`.
2. The service edits a single Telegram message for live updates.
3. When execution completes, full output is split into chunks and sent.

### 5. Approvals
1. Pending file edits trigger a prompt via Telegram.
2. `/approve` and `/reject` map to `EditReviewStore` actions.

## Reliability and Backoff
- Polling uses exponential backoff with jitter and respects `retry_after`.
- `last_update_id` is persisted to avoid reprocessing after restarts.
- Keep-awake minimizes sleep-induced message loss; some systems still sleep when the lid is closed.

## Security Model
- Access is restricted by allowed chat IDs.
- Group chats are blocked by default.
- Bot token stays in the settings database and is not logged.

## Limitations
- Telegram channels only today; other adapters are pluggable but not implemented yet.
- Streaming relies on Telegram message limits (4096 chars per message).
- Attachment size limited to 20MB for downloads/transcription.

## Testing
- Unit tests cover Telegram utilities (chunking, dedupe, command parsing).
- Backend state persistence tests validate offset storage.
- Settings tests cover remote keep-awake state shape.
