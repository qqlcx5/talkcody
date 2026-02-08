//! Core Runtime Module
//!
//! The core runtime manages task lifecycle, session management, agent loops,
//! and tool execution. This module is the heart of the cloud backend.

pub mod agent_loop;
pub mod runtime;
pub mod session;
pub mod tools;
pub mod types;

// Re-export main types for convenience
pub use agent_loop::{AgentLoop, AgentLoopContext, AgentLoopFactory, AgentLoopResult};
pub use runtime::{CoreRuntime, SettingsValidator};
pub use session::{SessionManager, SessionState};
pub use tools::{ToolContext, ToolDispatcher, ToolExecutionOutput, ToolHandler, ToolRegistry};
pub use types::*;

/// Initialize the core runtime with storage
pub async fn init_runtime(
    storage: crate::storage::Storage,
    event_sender: types::EventSender,
) -> Result<CoreRuntime, String> {
    CoreRuntime::new(storage, event_sender).await
}
