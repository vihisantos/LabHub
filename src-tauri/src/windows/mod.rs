//! Módulo de integração Windows nativa
//!
//! Exporta funcionalidades de UI e sistema operacional

pub mod ui;

// Re-exportar o resultado do seletor de pastas e funções
pub use ui::{open_folder_picker, open_folder_picker_with_hwnd_val, FolderPickerResult, ComGuard};