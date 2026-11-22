//! Seletor de pasta nativo do Windows usando IFileOpenDialog
//!
//! Implementa um seletor moderno do Windows 10/11 para seleção de pastas,
//! usando a API COM IFileOpenDialog.

use std::path::Path;
use std::thread;
use windows::core::HRESULT;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CoTaskMemFree, CoInitializeEx, CoUninitialize, CoCreateInstance, COINIT_APARTMENTTHREADED, CLSCTX_INPROC_SERVER};
use windows::Win32::UI::Shell::{IFileOpenDialog, IShellItem, SIGDN, FILEOPENDIALOGOPTIONS, FOS_PICKFOLDERS};

/// CLSID do FileOpenDialog (conhecido pelo sistema Windows)
/// {DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7}
const CLSID_FILE_OPEN_DIALOG: windows::core::GUID = windows::core::GUID::from_values(
    0xDC1C5A9C,
    0xE88A,
    0x4dde,
    [0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7],
);

/// HRESULT para COM já inicializado (S_FALSE)
/// S_OK = 0, S_FALSE = 1
const S_OK: HRESULT = HRESULT(0);
const S_FALSE: HRESULT = HRESULT(1);

/// HRESULT para RPC_E_CHANGED_MODE (0x8001010A como i32 = -2147417846)
/// COM já inicializado em modo diferente (por exemplo, multi-threaded)
const RPC_E_CHANGED_MODE: HRESULT = HRESULT(-2147417846i32);

/// HRESULT para ERROR_CANCELLED (0x800704C7 como i32 = -2147023673)
/// Diálogo cancelado pelo usuário
const ERROR_CANCELLED: HRESULT = HRESULT(-2147023673i32);

/// HRESULT para ERROR_INVALID_PARAMETER (0x80070057 como i32 = -2147024809)
const ERROR_INVALID_PARAMETER: HRESULT = HRESULT(-2147024809i32);

/// Guard RAII para inicialização COM com liberação automática.
///
/// # Regras de liberação
/// - S_OK: COM foi inicializado, deve liberar via CoUninitialize
/// - S_FALSE: COM já estava inicializado com sucesso, deve liberar via CoUninitialize
/// - RPC_E_CHANGED_MODE: COM já está em modo diferente, NÃO deve liberar
/// - Outros HRESULTs de falha: retornar erro sem liberar
pub struct ComGuard {
    /// Verdadeiro se esta instância deve chamar CoUninitialize no Drop
    should_uninitialize: bool,
}

impl ComGuard {
    /// Inicializa COM em modo STA e retorna o guard.
    ///
    /// Segundo a especificação COM:
    /// - S_OK (0): Chamada bem-sucedida, thread agora é STA
    /// - S_FALSE (1): Thread já era STA, também é sucesso
    /// - RPC_E_CHANGED_MODE (0x8001010A): Thread já era multi-thread, não pode mudar para STA
    pub fn new() -> windows::core::Result<Self> {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };

        if hr == S_OK || hr == S_FALSE {
            // Ambos são sucessos - esta thread deve gerenciar a liberação
            Ok(ComGuard { should_uninitialize: true })
        } else if hr.0 == RPC_E_CHANGED_MODE.0 {
            // COM já inicializado em modo multi-threaded
            // Esta thread NÃO deve chamar CoUninitialize
            Err(hr.into())
        } else {
            // Outro erro - inicialização falhou
            Err(hr.into())
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        // LIBERAR SOMENTE se inicializamos
        if self.should_uninitialize {
            unsafe { CoUninitialize(); }
        }
    }
}

/// RAII para liberar PWSTR alocado por COM
struct WString {
    ptr: windows::core::PWSTR,
    /// Flag para evitar liberação dupla
    consumed: bool,
}

impl WString {
    fn from_ptr(ptr: windows::core::PWSTR) -> Self {
        WString {
            ptr,
            consumed: false,
        }
    }

    /// Copia os dados e libera a memória COM. Retorna None se o ponteiro for nulo.
    fn to_string_lossy(mut self) -> String {
        if self.consumed || self.ptr.0.is_null() {
            return String::new();
        }

        let pwstr = self.ptr;
        let mut len = 0usize;
        unsafe {
            while *pwstr.0.add(len) != 0 {
                len += 1;
            }
            if len == 0 {
                // Liberar memória vazia
                CoTaskMemFree(Some(pwstr.0 as *const core::ffi::c_void));
                return String::new();
            }
            // Copiar dados ANTES de liberar
            let slice = std::slice::from_raw_parts(pwstr.0, len);
            let result = String::from_utf16_lossy(slice);
            // Liberar a memória COM após copiar o conteúdo
            CoTaskMemFree(Some(pwstr.0 as *const core::ffi::c_void));
            // Marcar como consumido para evitar liberação dupla no Drop
            self.consumed = true;
            result
        }
    }
}

impl Drop for WString {
    fn drop(&mut self) {
        // Garantir liberação apenas se não foi consumido
        if !self.consumed && !self.ptr.0.is_null() {
            unsafe { CoTaskMemFree(Some(self.ptr.0 as *const core::ffi::c_void)); }
        }
    }
}

/// Resultado do seletor de pasta
#[derive(Debug, Clone)]
pub enum FolderPickerResult {
    /// Pasta selecionada pelo usuário
    Selected(String),
    /// Usuário cancelou o diálogo
    Cancelled,
    /// Erro técnico (COM, API, etc.)
    Error(String),
}

/// Converte string para UTF-16 (wide string)
fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    Path::new(s).as_os_str().encode_wide().collect()
}

/// Converte HWND para um valor que pode ser enviado entre threads
fn hwnd_to_isize(hwnd: HWND) -> isize {
    hwnd.0 as isize
}

/// Converte valor isize de volta para HWND na thread de trabalho
#[inline]
fn isize_to_hwnd(val: isize) -> HWND {
    HWND(val as *mut core::ffi::c_void)
}

/// Abre o seletor de pasta moderno do Windows 10/11.
///
/// Cria e executa o diálogo em thread STA dedicada.
///
/// # Argumentos
/// * `hwnd_parent` - Handle da janela pai para foco (HWND é um handle, não interface COM)
/// * `initial_path` - Caminho inicial opcional (use "G:\\" quando disponível)
///
/// # Retorno
/// * `Ok(FolderPickerResult::Selected(path))` - Pasta selecionada
/// * `Ok(FolderPickerResult::Cancelled)` - Usuário cancelou o diálogo
/// * `Ok(FolderPickerResult::Error(msg))` - Erro técnico
/// * `Err(...)` - Erro de comunicação entre threads
pub fn open_folder_picker(hwnd_parent: HWND, initial_path: Option<&str>) -> windows::core::Result<FolderPickerResult> {
    // 1. Criar o diálogo na thread STA dedicada
    // IMPORTANTE: COM e UI não podem ser chamados de thread genérica
    // O HWND é passado como valor inteiro (isize), não como referência
    let hwnd_val: isize = hwnd_to_isize(hwnd_parent);
    let initial_path_owned: Option<String> = initial_path.map(|s| s.to_string());
    let (result_tx, result_rx) = std::sync::mpsc::channel();

    let _handle = thread::spawn(move || {
        // Guard RAII - inicializa COM e libera automaticamente apenas se inicializou
        let _com_guard = match ComGuard::new() {
            Ok(guard) => guard,
            Err(e) => {
                // COM não inicializado - não pode mostrar diálogo
                let _ = result_tx.send(FolderPickerResult::Error(format!("COM não inicializado: {:?}", e)));
                return;
            }
        };

        // Reconstruir HWND na thread (handle simples, não referência)
        let hwnd_parent_thread = isize_to_hwnd(hwnd_val);

        // 2. Criar o diálogo via CoCreateInstance
        let dialog: IFileOpenDialog = match unsafe {
            CoCreateInstance(&CLSID_FILE_OPEN_DIALOG, None, CLSCTX_INPROC_SERVER)
        } {
            Ok(d) => d,
            Err(e) => {
                let _ = result_tx.send(FolderPickerResult::Error(format!("Falha ao criar diálogo: {:?}", e)));
                return;
            }
        };

        // 3. Configurar como seletor de pasta
        // Nota: em alguns ambientes, combinar FOS_PICKFOLDERS com flags extras
        // (ex.: ocultar "Nova Pasta") faz SetOptions falhar com E_INVALIDARG (0x80070057).
        // Para máxima compatibilidade, aplicamos apenas FOS_PICKFOLDERS.
        unsafe {
            let opts = FILEOPENDIALOGOPTIONS(FOS_PICKFOLDERS.0);
            if let Err(e) = dialog.SetOptions(opts) {
                let _ = result_tx.send(FolderPickerResult::Error(format!("Falha ao configurar opções: {:?}", e)));
                return;
            }
        };

        // 4. Definir título
        let title = "Selecione a pasta sincronizada do Google Drive";
        let title_hstring = windows::core::HSTRING::from(title);

        if let Err(e) = unsafe { dialog.SetTitle(&title_hstring) } {
            let _ = result_tx.send(FolderPickerResult::Error(format!("Falha ao definir título: {:?}", e)));
            return;
        }

        // 5. Definir diretório inicial se fornecido
        if let Some(ref path_str) = initial_path_owned {
            if Path::new(path_str).exists() {
                let path_w: Vec<u16> = to_wide(path_str);
                if !path_w.is_empty() {
                    let path_hstring = windows::core::HSTRING::from_wide(&path_w);
                    unsafe {
                        if let Some(shell_item) = windows::Win32::UI::Shell::SHCreateItemFromParsingName::<_, _, IShellItem>(&path_hstring, None).ok() {
                            let _ = dialog.SetDefaultFolder(&shell_item);
                            // O IShellItem é automaticamente liberado quando sai do escopo
                        }
                        // Se falhar, continua sem diretório inicial - navegação normal pelo Explorer
                    }
                }
            }
        }

        // 6. Mostrar o diálogo (bloqueia até ser fechado)
        // HWND continua válido enquanto a janela Tauri estiver aberta
        // O diálogo modal mantém a janela pai no estado adequado
        let show_result = unsafe { dialog.Show(Some(hwnd_parent_thread)) };

        // 7. Processar resultado
        match show_result {
            Ok(()) => {
                // O diálogo foi fechado - verificar se houve seleção
                match unsafe { dialog.GetResult() } {
                    Ok(shell_item) => {
                        // SIGDN_FILESYSPATH = 0x80000000 (bits 0x80000000 em i32 = -2147483648)
                        let sigdn: SIGDN = SIGDN(-0x80000000i32);
                        match unsafe { shell_item.GetDisplayName(sigdn) } {
                            Ok(wptr) => {
                                // Usar RAII para converter e liberar memória corretamente
                                let wstring = WString::from_ptr(wptr);
                                let path_str = wstring.to_string_lossy();
                                if !path_str.is_empty() && Path::new(&path_str).exists() {
                                    let _ = result_tx.send(FolderPickerResult::Selected(path_str));
                                } else {
                                    let _ = result_tx.send(FolderPickerResult::Cancelled);
                                }
                            }
                            Err(e) => {
                                let _ = result_tx.send(FolderPickerResult::Error(format!("Falha em GetDisplayName: {:?}", e)));
                            }
                        }
                    }
                    Err(e) => {
                        let _ = result_tx.send(FolderPickerResult::Error(format!("Falha em GetResult: {:?}", e)));
                    }
                }
            }
            Err(e) => {
                // Check if it's the cancel error
                let hr = e.code();
                if hr.0 == ERROR_CANCELLED.0 {
                    // Cancelamento é uma operação normal
                    let _ = result_tx.send(FolderPickerResult::Cancelled);
                } else {
                    // Outro erro - retornar como erro técnico
                    let _ = result_tx.send(FolderPickerResult::Error(format!("Falha em Show: {:?}", e)));
                }
            }
        }

        // com_guard é automaticamente liberado aqui
        // Se should_uninitialize for true, CoUninitialize será chamado
    });

    // Esperar resultado - sem timeout arbitrário
    result_rx.recv().map_err(|_| windows::core::Error::from(ERROR_INVALID_PARAMETER)) // ERROR_INVALID_PARAMETER
}

/// Versão que aceita HWND como isize para uso com SpawnBlocking.
///
/// Este método é útil porque `spawn_blocking` requer que os argumentos sejam `Send`,
/// e `HWND` (que contém `*mut c_void`) não implementa `Send`.
///
/// # Argumentos
/// * `hwnd_val` - Handle da janela como isize (valor obtido de `window.hwnd().0`)
/// * `initial_path` - Caminho inicial opcional
pub fn open_folder_picker_with_hwnd_val(hwnd_val: isize, initial_path: Option<&str>) -> windows::core::Result<FolderPickerResult> {
    let hwnd_parent = HWND(hwnd_val as *mut core::ffi::c_void);
    open_folder_picker(hwnd_parent, initial_path)
}