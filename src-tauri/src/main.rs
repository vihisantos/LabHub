// LabHub TV - Tauri Backend
// Backend nativo para descoberta de conteúdo do Google Drive e persistência local
//
// Arquitetura local-first:
// - Google Drive → Tauri → Desktop player
// - Caminho configurável por instalação
// - Persistência durável via Tauri Store API

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use dirs;

// ──────────────────────────────────────────────────────────────────────────────
// Tipos de dados (exportados para o frontend)
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    /// Nome do arquivo
    pub name: String,
    /// Tamanho em bytes
    pub size: u64,
    /// Caminho completo no disco
    pub path: String,
    /// Tipo de arquivo (video ou image)
    #[serde(rename = "file_type")]
    pub file_type: String,
}

impl DriveFile {
    pub fn is_video(&self) -> bool {
        matches!(self.file_type.as_str(), "video" | "Video")
    }

    pub fn is_image(&self) -> bool {
        matches!(self.file_type.as_str(), "image" | "Image")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RichDriveFile {
    /// Nome do arquivo
    pub name: String,
    /// Tamanho em bytes
    pub size: u64,
    /// Caminho completo no disco
    pub path: String,
    /// Caminho relativo à biblioteca
    pub relative_path: Option<String>,
    /// Pasta pai
    pub parent_folder: Option<String>,
    /// Tipo de arquivo (video ou image)
    #[serde(rename = "file_type")]
    pub file_type: String,
    /// Se o arquivo está disponível para reprodução
    pub is_available: bool,
}

impl RichDriveFile {
    pub fn is_video(&self) -> bool {
        matches!(self.file_type.as_str(), "video" | "Video")
    }

    pub fn is_image(&self) -> bool {
        matches!(self.file_type.as_str(), "image" | "Image")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveSyncConfig {
    /// Caminho da pasta de sincronização do Google Drive
    pub sync_folder_path: String,
}

impl Default for DriveSyncConfig {
    fn default() -> Self {
        Self {
            sync_folder_path: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveSyncStatus {
    pub configured: bool,
    pub folder_path: Option<String>,
    pub local_storage_path: Option<String>,
    pub config_path: String,
    pub message: Option<String>,
    pub pending_downloads: u32,
    pub pending_deletes: u32,
    pub last_sync_at: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProgrammingState {
    pub cycle: u32,
    pub position: usize,
    pub academic_completed: u32,
    pub academic_since_last_fixed: u32,
    pub completed_ids: Vec<String>,
    pub pending_queue: Vec<String>,
    pub next_fixed_id: Option<String>,
    pub library_version: Option<String>,
    pub error_contents: Vec<String>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuração do caminho raiz ( configurável por instalação)
// ──────────────────────────────────────────────────────────────────────────────

fn get_app_data_dir() -> Option<std::path::PathBuf> {
    dirs::preference_dir()
        .or_else(|| std::env::var_os("APPDATA").map(|a| std::path::PathBuf::from(a)))
}

fn data_dir() -> Option<std::path::PathBuf> {
    dirs::preference_dir().or_else(|| {
        std::env::var_os("APPDATA").map(|a| std::path::PathBuf::from(a))
    })
}

fn get_config_path() -> Option<PathBuf> {
    get_app_data_dir().map(|p| p.join("LabHub TV").join("drive-sync.json"))
}

fn load_sync_config() -> Result<DriveSyncConfig, String> {
    let config_path = get_config_path().ok_or("Não foi possível determinar pasta de dados do app")?;
    
    if !config_path.exists() {
        // Retornar config padrão com caminho de exemplo
        return Ok(DriveSyncConfig::default());
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Falha ao ler configuração: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Configuração inválida: {}", e))
}

fn save_sync_config(config: &DriveSyncConfig) -> Result<(), String> {
    let config_path = get_config_path().ok_or("Não foi possível determinar pasta de dados do app")?;
    
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Falha ao criar diretório de configuração: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Falha ao serializar configuração: {}", e))?;
    
    let temp_path = config_path.with_extension("tmp");
    
    fs::write(&temp_path, &content)
        .map_err(|e| format!("Falha ao escrever arquivo temporário: {}", e))?;
    
    fs::rename(&temp_path, &config_path)
        .map_err(|e| format!("Falha ao salvar configuração: {}", e))?;
    
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Extensões de arquivo suportadas
// ──────────────────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS: [&str; 6] = ["mp4", "mov", "avi", "mkv", "webm", "flv"];
const IMAGE_EXTENSIONS: [&str; 5] = ["jpg", "jpeg", "png", "gif", "webp"];

fn get_file_type(filename: &str) -> Option<&'static str> {
    let ext: String = filename
        .rsplit('.')
        .next()
        .map(|s| s.to_lowercase())?;
    
    if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Some("video");
    }
    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Some("image");
    }
    None
}

// ──────────────────────────────────────────────────────────────────────────────
// Descoberta de arquivos a partir do caminho do Drive
// ──────────────────────────────────────────────────────────────────────────────

fn discover_files_from_drive(sync_folder: &Path) -> Result<Vec<RichDriveFile>, String> {
    let mut files = Vec::new();
    
    if !sync_folder.exists() {
        return Ok(files);
    }
    
    for entry in walkdir::WalkDir::new(sync_folder).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if let Some(file_type) = get_file_type(name) {
                if let Ok(metadata) = fs::metadata(path) {
                    let size = metadata.len();
                    let path_str = path.to_string_lossy().to_string();
                    
                    // Calcular caminho relativo
                    let relative_path = path.strip_prefix(sync_folder)
                        .ok()
                        .and_then(|p| p.to_str().map(|s| s.to_string()));
                    
                    // Obter pasta pai
                    let parent_folder = path.parent()
                        .and_then(|p| p.file_name())
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string());
                    
                    files.push(RichDriveFile {
                        name: name.to_string(),
                        size,
                        path: path_str,
                        relative_path,
                        parent_folder,
                        file_type: file_type.to_string(),
                        is_available: true,
                    });
                }
            }
        }
    }
    
    Ok(files)
}

fn list_synced_files_internal() -> Result<Vec<RichDriveFile>, String> {
    let config = load_sync_config()
        .map_err(|e| format!("Falha ao carregar configuração: {}", e))?;
    
    if config.sync_folder_path.is_empty() {
        return Ok(Vec::new());
    }
    
    let sync_folder = Path::new(&config.sync_folder_path);
    discover_files_from_drive(sync_folder)
}

fn sync_drive_content_internal() -> Result<Vec<DriveFile>, String> {
    // Descobrir arquivos
    let rich_files = list_synced_files_internal()?;
    
    // Converter para formato simples
    let files: Vec<DriveFile> = rich_files
        .into_iter()
        .filter(|f| f.is_available)
        .map(|f| DriveFile {
            name: f.name,
            size: f.size,
            path: f.path,
            file_type: f.file_type,
        })
        .collect();
    
    Ok(files)
}

// ──────────────────────────────────────────────────────────────────────────────
// Persistência local (Tauri Store API)
// ──────────────────────────────────────────────────────────────────────────────

// Função para obter o caminho do arquivo de estado
fn get_programming_state_path() -> Option<PathBuf> {
    get_app_data_dir().map(|p| p.join("LabHub TV").join("programming-state.json"))
}

// Salvar estado de forma durável (write-then-rename)
fn save_programming_state_to_file(state: &ProgrammingState) -> Result<(), String> {
    let path = get_programming_state_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Falha ao criar diretório: {}", e))?;
    }
    
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Falha ao serializar estado: {}", e))?;
    
    let temp_path = path.with_extension("tmp");
    
    fs::write(&temp_path, &json)
        .map_err(|e| format!("Falha ao escrever arquivo temporário: {}", e))?;
    
    fs::rename(&temp_path, &path)
        .map_err(|e| format!("Falha ao salvar estado: {}", e))?;
    
    Ok(())
}

// Carregar estado do arquivo de forma durável
fn load_programming_state_from_file() -> Result<ProgrammingState, String> {
    let path = get_programming_state_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    
    if !path.exists() {
        return Ok(ProgrammingState::default());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Falha ao ler estado: {}", e))?;
    
    // Tentar desserializar, retornar default se corrompido
    serde_json::from_str(&content)
        .map_err(|e| format!("Falha ao desserializar estado: {}", e))
        .or(Ok(ProgrammingState::default()))
}

// ──────────────────────────────────────────────────────────────────────────────
// Comandos Tauri
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_synced_files() -> Result<Vec<RichDriveFile>, String> {
    list_synced_files_internal()
}

#[tauri::command]
fn sync_drive_content() -> Result<Vec<DriveFile>, String> {
    sync_drive_content_internal()
}

#[tauri::command]
fn drive_files() -> Result<Vec<DriveFile>, String> {
    sync_drive_content_internal()
}

#[tauri::command]
fn drive_sync_status() -> Result<DriveSyncStatus, String> {
    let config = load_sync_config()
        .map_err(|e| format!("Falha ao carregar configuração: {}", e))?;
    
    let sync_folder = Path::new(&config.sync_folder_path);
    let configured = !config.sync_folder_path.is_empty() && sync_folder.exists();
    
    Ok(DriveSyncStatus {
        configured,
        folder_path: if configured {
            Some(config.sync_folder_path)
        } else {
            None
        },
        local_storage_path: get_config_path().map(|p| p.to_string_lossy().to_string()),
        config_path: get_config_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        message: if !configured {
            Some("Pasta de sincronização não configurada".to_string())
        } else {
            None
        },
        pending_downloads: 0,
        pending_deletes: 0,
        last_sync_at: None,
        last_error: None,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureDriveFolderArgs {
    pub folder_path: String,
    pub account_confirmed: bool,
}

#[tauri::command]
async fn configure_drive_folder(args: ConfigureDriveFolderArgs) -> Result<DriveSyncStatus, String> {
    let folder_path = args.folder_path;
    let account_confirmed = args.account_confirmed;
    
    // Validar caminho
    let path = Path::new(&folder_path);
    if !path.exists() {
        return Err("Pasta não existe".to_string());
    }
    if !path.is_dir() {
        return Err("O caminho não é um diretório".to_string());
    }
    if !account_confirmed {
        return Err("Conta não confirmada".to_string());
    }
    
    // Verificar se contém arquivos de mídia
    let has_media = walkdir::WalkDir::new(path)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .any(|e| {
            e.path()
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| {
                    VIDEO_EXTENSIONS.contains(&ext) || IMAGE_EXTENSIONS.contains(&ext)
                })
                .unwrap_or(false)
        });
    
    if !has_media {
        return Err("A pasta não contém arquivos de mídia compatíveis".to_string());
    }
    
    // Configurar
    let config = DriveSyncConfig {
        sync_folder_path: folder_path.clone(),
    };
    save_sync_config(&config)?;
    
    Ok(DriveSyncStatus {
        configured: true,
        folder_path: Some(folder_path),
        local_storage_path: get_config_path().map(|p| p.to_string_lossy().to_string()),
        config_path: get_config_path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        message: None,
        pending_downloads: 0,
        pending_deletes: 0,
        last_sync_at: None,
        last_error: None,
    })
}

#[tauri::command]
async fn programming_state_get() -> Result<ProgrammingState, String> {
    load_programming_state_from_file()
}

#[tauri::command]
async fn programming_state_set(state: ProgrammingState) -> Result<(), String> {
    save_programming_state_to_file(&state)
}

#[tauri::command]
async fn programming_state_reset() -> Result<(), String> {
    // Deletar o arquivo de estado
    if let Some(path) = get_programming_state_path() {
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

#[tauri::command]
async fn open_folder_dialog(default_path: Option<String>) -> Result<String, String> {
    use tauri::api::dialog::spawn_folder_dialog;
    
    let initial_dir = default_path
        .as_ref()
        .and_then(|p| std::path::PathBuf::from(p).parent().map(|p| p.to_path_buf()))
        .or_else(|| dirs::desktop_dir());
    
    // Use Tauri's async folder dialog
    let result = spawn_folder_dialog(initial_dir, |path| {
        path.map(|p| p.to_string_lossy().to_string())
    }).await;
    
    Ok(result)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_synced_files,
            sync_drive_content,
            drive_files,
            drive_sync_status,
            configure_drive_folder,
            programming_state_get,
            programming_state_set,
            programming_state_reset,
            open_folder_dialog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}