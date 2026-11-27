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
mod usb_monitor;
mod usb_auth;
pub mod windows;  // Novo módulo para integração Windows nativa
use usb_monitor::{list_removable_drives, find_key_usb, has_usb_key, has_private_key};
use usb_auth::{EmbeddedKey, validate_usb_key, is_local_auth_valid, save_local_auth, load_local_auth, ValidationResult};

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
    /// Última alteração, para detectar substituições com o mesmo tamanho.
    pub modified_at: Option<u64>,
}

impl RichDriveFile {
    pub fn is_video(&self) -> bool {
        matches!(self.file_type.as_str(), "video" | "Video")
    }

    pub fn is_image(&self) -> bool {
        matches!(self.file_type.as_str(), "image" | "Image")
    }
}

/// Estrutura para leitura da configuração (suporta formatos legados)
///
/// As duas grafias são campos separados de propósito: com `alias` o serde
/// rejeita o arquivo inteiro se ele contiver as duas chaves ao mesmo tempo
/// (erro "duplicate field"), o que descartava a configuração salva.
#[derive(Debug, Clone, Default, Deserialize)]
struct DriveSyncConfigRaw {
    /// Formato novo: syncFolderPath (camelCase, padrão Tauri v2)
    #[serde(default, rename = "syncFolderPath")]
    sync_folder_path_camel: Option<String>,
    /// Formato legado: sync_folder_path (snake_case)
    #[serde(default, rename = "sync_folder_path")]
    sync_folder_path_snake: Option<String>,
}

impl DriveSyncConfigRaw {
    /// Retorna o caminho configurado, aceitando qualquer uma das grafias (ou ambas).
    fn sync_folder_path(&self) -> Option<String> {
        let camel = self.sync_folder_path_camel.as_deref().filter(|s| !s.is_empty());
        let snake = self.sync_folder_path_snake.as_deref().filter(|s| !s.is_empty());
        camel.or(snake).map(|s| s.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveSyncConfig {
    /// Caminho da pasta de sincronização do Google Drive
    /// Serializado como "syncFolderPath" (camelCase conforme padrão Tauri v2)
    pub sync_folder_path: String,
}

impl Default for DriveSyncConfig {
    fn default() -> Self {
        let default_g = Path::new("G:\\Meu Drive\\LabHub -TV");
        let default_path = if default_g.exists() && default_g.is_dir() {
            "G:\\Meu Drive\\LabHub -TV".to_string()
        } else {
            String::new()
        };
        Self {
            sync_folder_path: default_path,
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
    // Novos campos (compatibilidade retroativa via #[serde(default)])
    #[serde(default)]
    pub completed_fixed_ids: Vec<String>,
    #[serde(default)]
    pub academic_since_last_informativo: u32,
    /// Rodada de informativos já exibidos (evita repetir o mesmo aviso).
    #[serde(default)]
    pub completed_informativo_ids: Vec<String>,
    #[serde(default)]
    pub last_video_played_at: std::collections::HashMap<String, u64>,
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuração do caminho raiz ( configurável por instalação)
// ──────────────────────────────────────────────────────────────────────────────

fn get_app_data_dir() -> Option<std::path::PathBuf> {
    dirs::preference_dir()
        .or_else(|| std::env::var_os("APPDATA").map(|a| std::path::PathBuf::from(a)))
}



fn get_config_path() -> Option<PathBuf> {
    get_app_data_dir().map(|p| p.join("LabHub TV").join("drive-sync.json"))
}

fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{FEFF}').unwrap_or(s)
}

/// Caminho do arquivo de backup: última versão que passou na validação.
pub(crate) fn backup_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.bak", path.to_string_lossy()))
}

/// Arquiva um estado inválido em vez de apagá-lo, para diagnóstico posterior.
pub(crate) fn quarantine_file(path: &Path) {
    let name = path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "estado".to_string());
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let dest = parent.join(format!("{}.corrupt-{}", name, uuid::Uuid::new_v4().simple()));
    if let Err(e) = fs::rename(path, &dest) {
        eprintln!("[persistencia] nao foi possivel arquivar arquivo invalido: {}", e);
    }
}

/// Escrita durável: arquivo temporário único + `sync_all` + rename atômico.
///
/// `write + rename` sozinho evita arquivos truncados, mas não garante que os
/// bytes chegaram ao disco antes da substituição (queda de energia). O sufixo
/// aleatório evita colisão entre escritas concorrentes do mesmo arquivo.
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let parent = path.parent().ok_or_else(|| "Caminho sem diretorio pai".to_string())?;
    fs::create_dir_all(parent).map_err(|e| format!("Falha ao criar diretorio: {}", e))?;

    let stem = path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "estado".to_string());
    let temp = parent.join(format!(".{}.{}.tmp", stem, uuid::Uuid::new_v4().simple()));

    let result = (|| -> Result<(), String> {
        let mut file = fs::File::create(&temp)
            .map_err(|e| format!("Falha ao criar arquivo temporario: {}", e))?;
        file.write_all(bytes)
            .map_err(|e| format!("Falha ao escrever arquivo temporario: {}", e))?;
        file.sync_all()
            .map_err(|e| format!("Falha ao sincronizar arquivo temporario: {}", e))?;
        drop(file);
        fs::rename(&temp, path)
            .map_err(|e| format!("Falha ao substituir arquivo: {}", e))?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// Registra uma cópia válida como `.bak`. Falhas não impedem a operação normal.
pub(crate) fn remember_valid(path: &Path, content: &[u8]) {
    if let Err(e) = atomic_write(&backup_path(path), content) {
        eprintln!("[persistencia] nao foi possivel atualizar backup: {}", e);
    }
}

/// Tenta ler o último estado válido quando o arquivo principal falha.
fn read_fallback(path: &Path) -> Option<Vec<u8>> {
    let candidates = [
        backup_path(path),
        path.with_extension("tmp"),
        PathBuf::from(format!("{}.tmp", path.to_string_lossy())),
    ];
    for candidate in candidates {
        if let Ok(bytes) = fs::read(&candidate) {
            if !bytes.is_empty() {
                eprintln!("[persistencia] recuperando estado de arquivo auxiliar");
                return Some(bytes)
            }
        }
    }
    None
}

fn parse_sync_config(content: &str) -> Result<DriveSyncConfig, String> {
    let raw: DriveSyncConfigRaw = serde_json::from_str(strip_bom(content))
        .map_err(|e| format!("Falha ao parsear configuracao: {}", e))?;
    let folder_path = raw.sync_folder_path().unwrap_or_default();
    if folder_path.is_empty() {
        return Ok(DriveSyncConfig::default())
    }
    Ok(DriveSyncConfig { sync_folder_path: folder_path })
}

fn load_sync_config() -> Result<DriveSyncConfig, String> {
    let config_path = get_config_path().ok_or("Não foi possível determinar pasta de dados do app")?;

    let bytes = match fs::read(&config_path) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(DriveSyncConfig::default()),
    };

    match parse_sync_config(&String::from_utf8_lossy(&bytes)) {
        Ok(config) => {
            remember_valid(&config_path, &bytes);
            Ok(config)
        }
        Err(primary) => {
            eprintln!("[load_sync_config]-configuracao invalida: {}", primary);
            if let Some(fallback) = read_fallback(&config_path) {
                if let Ok(config) = parse_sync_config(&String::from_utf8_lossy(&fallback)) {
                    return Ok(config)
                }
            }
            // Só descarta o arquivo principal após tentar todas as cópias válidas.
            quarantine_file(&config_path);
            Ok(DriveSyncConfig::default())
        }
    }
}

fn save_sync_config(config: &DriveSyncConfig) -> Result<(), String> {
    let config_path = get_config_path().ok_or("Não foi possível determinar pasta de dados do app")?;
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Falha ao serializar configuração: {}", e))?;
    atomic_write(&config_path, content.as_bytes())
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

    if !sync_folder.is_dir() {
        return Err(format!("Pasta do Drive indisponível: {}", sync_folder.display()));
    }

    for entry in walkdir::WalkDir::new(sync_folder) {
        let entry = entry.map_err(|e| format!("Falha ao ler a biblioteca do Drive: {}", e))?;
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if let Some(file_type) = get_file_type(name) {
                {
                    let metadata = fs::metadata(path).map_err(|e| format!("Falha ao ler mídia: {}", e))?;
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
                        modified_at: metadata.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).and_then(|d| u64::try_from(d.as_millis()).ok()),
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

// Salvar estado de forma durável (temporário único + fsync + rename atômico)
fn save_programming_state_to_file(state: &ProgrammingState) -> Result<(), String> {
    let path = get_programming_state_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Falha ao serializar estado: {}", e))?;
    atomic_write(&path, json.as_bytes())
}

fn parse_programming_state(bytes: &[u8]) -> Result<ProgrammingState, String> {
    let state: ProgrammingState = serde_json::from_str(strip_bom(&String::from_utf8_lossy(bytes)))
        .map_err(|e| format!("Falha ao desserializar estado: {}", e))?;
    // Validação semântica mínima: um estado sem fila não é ponto de retomada.
    if state.pending_queue.is_empty() && state.position > 0 {
        return Err("Estado inconsistente: posicao sem fila pendente".to_string())
    }
    Ok(state)
}

// Carregar estado do arquivo, preservando a última versão válida
fn load_programming_state_from_file() -> Result<ProgrammingState, String> {
    let path = get_programming_state_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;

    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(_) => return Ok(ProgrammingState::default()),
    };

    match parse_programming_state(&bytes) {
        Ok(state) => {
            remember_valid(&path, &bytes);
            Ok(state)
        }
        Err(primary) => {
            eprintln!("[load_programming_state] estado invalido: {}", primary);
            if let Some(fallback) = read_fallback(&path) {
                if let Ok(state) = parse_programming_state(&fallback) {
                    return Ok(state)
                }
            }
            quarantine_file(&path);
            Ok(ProgrammingState::default())
        }
    }
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

    // Validar caminho
    let path = Path::new(&folder_path);
    if !path.exists() {
      return Err("Pasta não existe".to_string());
    }
    if !path.is_dir() {
      return Err("O caminho não é um diretório".to_string());
    }

    // Verificar se contém arquivos de mídia (aumentar profundidade para 5)
    let has_media = walkdir::WalkDir::new(path)
      .max_depth(5)
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
    // Arquiva o estado anterior em vez de apagá-lo: um reset acidental não
    // destrói a última posição válida da programação.
    if let Some(path) = get_programming_state_path() {
        if path.exists() {
            let backup = backup_path(&path);
            let _ = fs::remove_file(&backup);
            fs::rename(&path, &backup)
                .map_err(|e| format!("Falha ao arquivar estado anterior: {}", e))?;
        }
    }
    Ok(())
}

// ──────────────────────────────────────────────────────────────────────────────
// Configuração do dispositivo — persistência nativa (substitui localStorage)
// ──────────────────────────────────────────────────────────────────────────────

fn get_device_config_path() -> Option<PathBuf> {
    get_app_data_dir().map(|p| p.join("LabHub TV").join("device-config.json"))
}

fn read_device_config(path: &Path) -> serde_json::Map<String, serde_json::Value> {
    match fs::read(path) {
        Ok(bytes) => match serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(
            strip_bom(&String::from_utf8_lossy(&bytes)).as_bytes(),
        ) {
            Ok(map) => map,
            Err(_) => {
                quarantine_file(path);
                serde_json::Map::new()
            }
        },
        Err(_) => serde_json::Map::new(),
    }
}

#[tauri::command]
async fn device_config_get(key: String) -> Result<Option<String>, String> {
    let path = get_device_config_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    let map = read_device_config(&path);
    Ok(map.get(&key).and_then(|v| v.as_str()).map(|s| s.to_string()))
}

#[tauri::command]
async fn device_config_set(key: String, value: String) -> Result<(), String> {
    let path = get_device_config_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    let mut map = read_device_config(&path);
    map.insert(key, serde_json::Value::String(value));
    let json = serde_json::to_string_pretty(&map)
        .map_err(|e| format!("Falha ao serializar configuração do dispositivo: {}", e))?;
    atomic_write(&path, json.as_bytes())
}

#[tauri::command]
async fn device_config_remove(key: String) -> Result<(), String> {
    let path = get_device_config_path()
        .ok_or("Não foi possível determinar pasta de dados do app")?;
    let mut map = read_device_config(&path);
    if map.remove(&key).is_none() {
        return Ok(())
    }
    let json = serde_json::to_string_pretty(&map)
        .map_err(|e| format!("Falha ao serializar configuração do dispositivo: {}", e))?;
    atomic_write(&path, json.as_bytes())
}

#[tauri::command]
async fn open_folder_dialog(window: tauri::Window) -> Result<String, String> {
    use std::path::PathBuf;

    // Verificar se a unidade G:\ existe (Google Drive)
    let g_drive = PathBuf::from("G:\\");
    let preferred_start_dir: Option<&str> = if g_drive.exists() && g_drive.is_dir() {
        // Iniciar no Google Drive se disponível
        Some("G:\\")
    } else {
        // Não definir diretório inicial - deixar o Windows Explorer abrir normalmente
        None
    };

    // Obter HWND da janela Tauri e converter para isize (não Send)
    // A conversão para isize permite passar através de spawn_blocking
    let hwnd_val: isize = window.hwnd().map_err(|e| format!("Falha ao obter HWND da janela: {:?}", e))?.0 as isize;

    // Executar o seletor usando spawn_blocking para não bloquear o runtime assíncrono
    // A thread dedicada inicializa COM em STA e gerencia a liberação correta
    let result = tauri::async_runtime::spawn_blocking(move || {
        windows::open_folder_picker_with_hwnd_val(hwnd_val, preferred_start_dir)
    })
    .await
    .map_err(|e| format!("Erro de comunicação: {:?}", e))?;

    match result {
        Ok(windows::FolderPickerResult::Selected(path)) => Ok(path),
        Ok(windows::FolderPickerResult::Cancelled) => {
            // Cancelamento é uma operação normal - não retornar erro
            // O frontend já trata isso
            Err("User cancelled".to_string())
        }
        Ok(windows::FolderPickerResult::Error(msg)) => {
            // Erro técnico - retornar como erro
            Err(msg)
        }
        Err(e) => Err(format!("Erro no seletor de pastas: {:?}", e))
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Comandos Tauri para autenticação USB
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn is_usb_auth_valid() -> Result<bool, String> {
    Ok(is_local_auth_valid())
}

#[tauri::command]
fn validate_usb_auth(drive_letter: String) -> Result<ValidationResult, String> {
    // Carregar chave embarcada
    let embedded_key = EmbeddedKey::load()?;

    // Validar chave USB
    validate_usb_key(drive_letter, &embedded_key)
}

#[tauri::command]
fn activate_with_usb(drive_letter: String) -> Result<serde_json::Value, String> {
    use uuid::Uuid;

    // Validar a chave USB
    let result = validate_usb_auth(drive_letter.clone())?;

    if !result.success {
        return Ok(serde_json::json!({
            "success": false,
            "error": result.error.unwrap_or("Validação falhou".to_string())
        }));
    }

    // Gerar device ID único (hash do hardware + chave)
    let device_id = format!("device_{}", Uuid::new_v4().to_string()[..8].to_string());

    // Salvar autorização local com DPAPI
    let key_hash = EmbeddedKey::load()?.expected_public_key_hash;
    save_local_auth(&device_id, &result.key_id, &drive_letter, &key_hash)?;

    Ok(serde_json::json!({
        "success": true,
        "deviceId": device_id,
        "keyId": result.key_id,
        "deviceName": result.device_name
    }))
}

/// Verifica se a autorização USB local está válida
#[tauri::command]
fn is_local_usb_auth_valid() -> Result<bool, String> {
    Ok(is_local_auth_valid())
}

/// Carrega a autorização USB local
#[tauri::command]
fn get_local_usb_auth() -> Result<serde_json::Value, String> {
    let auth = load_local_auth()?;
    Ok(serde_json::json!({
        "deviceId": auth.device_id,
        "keyId": auth.key_id,
        "expiresAt": auth.expires_at * 1000, // Convert to milliseconds
        "driveLetter": auth.drive_letter
    }))
}

// ──────────────────────────────────────────────────────────────────────────────
// Comandos Tauri para detecção USB
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
fn list_usb_drives() -> Result<Vec<String>, String> {
    Ok(list_removable_drives())
}

#[tauri::command]
fn find_usb_with_key() -> Result<Option<String>, String> {
    Ok(find_key_usb())
}

#[tauri::command]
fn check_usb_key(drive_letter: String) -> Result<bool, String> {
    Ok(has_usb_key(&drive_letter) && has_private_key(&drive_letter))
}

mod signed_updater;

fn main() {
    // Carregar chave embarcada
    let embedded_key = EmbeddedKey::load()
        .expect("Falha ao carregar chave embarcada - verifique embedded-keys.json");

    let builder = signed_updater::configure(tauri::Builder::default());
    builder
        .manage(embedded_key)
        .invoke_handler(tauri::generate_handler![
            list_synced_files,
            sync_drive_content,
            drive_files,
            drive_sync_status,
            configure_drive_folder,
            programming_state_get,
            programming_state_set,
            programming_state_reset,
            device_config_get,
            device_config_set,
            device_config_remove,
            open_folder_dialog,
            is_usb_auth_valid,
            validate_usb_auth,
            activate_with_usb,
            list_usb_drives,
            find_usb_with_key,
            check_usb_key,
            is_local_usb_auth_valid,
            get_local_usb_auth,
            signed_updater::prepare_tv_update,
            signed_updater::install_tv_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod persistence_tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("labhub-fase5-{}-{}", name, uuid::Uuid::new_v4().simple()))
    }

    #[test]
    fn atomic_write_cria_arquivo_e_backup() {
        let dir = temp_dir("atomic");
        let path = dir.join("state.json");
        atomic_write(&path, br#"{"position":1}"#).expect("atomic_write");
        assert_eq!(fs::read(&path).unwrap(), br#"{"position":1}"#);
        assert!(fs::read_dir(&dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().ends_with(".tmp")));

        remember_valid(&path, &fs::read(&path).unwrap());
        assert!(backup_path(&path).exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn estado_corrompido_usa_backup_e_arquiva_original() {
        let dir = temp_dir("corrupt");
        let path = dir.join("programming-state.json");
        let valid = br#"{"cycle":1,"position":2,"academic_completed":3,"academic_since_last_fixed":1,"completed_ids":[],"pending_queue":["a"],"next_fixed_id":null,"library_version":"v1","error_contents":[],"completed_fixed_ids":[],"academic_since_last_informativo":0}"#;
        atomic_write(&path, valid).unwrap();
        remember_valid(&path, valid);

        atomic_write(&path, b"{ JSON quebrado").unwrap();
        let restored = parse_programming_state(&fs::read(&path).unwrap())
            .or_else(|_| parse_programming_state(&fs::read(backup_path(&path)).unwrap()))
            .expect("backup deve recuperar o estado valido");
        assert_eq!(restored.position, 2);
        assert_eq!(restored.pending_queue, vec!["a"]);

        quarantine_file(&path);
        assert!(!path.exists());
        assert!(fs::read_dir(&dir).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().contains(".corrupt-")));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn estado_inconsistente_e_rejeitado() {
        let base = br#"{"cycle":1,"position":0,"academic_completed":0,"academic_since_last_fixed":0,"completed_ids":[],"pending_queue":[],"next_fixed_id":null,"library_version":"v1","error_contents":[],"completed_fixed_ids":[],"academic_since_last_informativo":0}"#;
        assert!(parse_programming_state(base).is_ok());

        // Mesmo JSON com posição avançada sem fila não é ponto de retomada.
        let invalid = String::from_utf8(base.to_vec()).unwrap()
            .replace("\"position\":0", "\"position\":3");
        assert!(parse_programming_state(invalid.as_bytes()).is_err());
    }
}