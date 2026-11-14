use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub shortcut_path: String,
    pub target_path: String,
}

#[cfg(windows)]
fn paths() -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "A pasta AppData do usuário não está disponível.".to_owned())?;
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Não foi possível localizar o executável instalado: {e}"))?;
    let shortcut = std::path::PathBuf::from(app_data)
        .join("Microsoft/Windows/Start Menu/Programs/Startup/LabHub TV/LabHub TV.lnk");
    Ok((shortcut, current_exe))
}

#[cfg(windows)]
fn read_preference() -> Option<bool> {
    let output = std::process::Command::new("reg.exe")
        .args(["query", r"HKCU\Software\LabHub TV", "/v", "Autostart"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
    if value.contains("0x1") || value.contains(" 1\r") || value.contains(" 1\n") {
        Some(true)
    } else if value.contains("0x0") || value.contains(" 0\r") || value.contains(" 0\n") {
        Some(false)
    } else {
        None
    }
}

#[cfg(windows)]
fn write_preference(enabled: bool) -> Result<(), String> {
    let value = if enabled { "1" } else { "0" };
    let result = std::process::Command::new("reg.exe")
        .args([
            "add",
            r"HKCU\Software\LabHub TV",
            "/v",
            "Autostart",
            "/t",
            "REG_SZ",
            "/d",
            value,
            "/f",
        ])
        .output()
        .map_err(|e| format!("Não foi possível salvar a preferência de inicialização: {e}"))?;
    if !result.status.success() {
        return Err(format!(
            "Não foi possível salvar a preferência de inicialização: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn update_shortcut(
    enabled: bool,
    shortcut: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), String> {
    if !enabled {
        if shortcut.exists() {
            std::fs::remove_file(shortcut)
                .map_err(|e| format!("Não foi possível remover o atalho de inicialização: {e}"))?;
        }
        if let Some(parent) = shortcut.parent() {
            let _ = std::fs::remove_dir(parent);
        }
        return Ok(());
    }
    if let Some(parent) = shortcut.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Não foi possível acessar a pasta Startup: {e}"))?;
    }
    if !target.is_file() {
        return Err(format!(
            "Executável instalado não encontrado: {}",
            target.display()
        ));
    }
    let script = "$ErrorActionPreference='Stop'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LABHUB_STARTUP_LINK); $s.TargetPath=$env:LABHUB_STARTUP_TARGET; $s.WorkingDirectory=[IO.Path]::GetDirectoryName($env:LABHUB_STARTUP_TARGET); $s.Description='LabHub TV'; $s.Save()";
    let result = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env("LABHUB_STARTUP_LINK", shortcut)
        .env("LABHUB_STARTUP_TARGET", target)
        .output()
        .map_err(|e| format!("Não foi possível criar o atalho de inicialização: {e}"))?;
    if !result.status.success() {
        return Err(format!(
            "Não foi possível criar o atalho de inicialização: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(windows)]
pub fn autostart_status() -> Result<AutostartStatus, String> {
    let (shortcut, target) = paths()?;
    let preference = read_preference();
    let enabled = preference.unwrap_or_else(|| shortcut.exists());
    if preference.is_none() && shortcut.exists() {
        write_preference(true)?;
    }
    if enabled {
        update_shortcut(true, &shortcut, &target)?;
    }
    Ok(AutostartStatus {
        enabled,
        shortcut_path: shortcut.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
    })
}

#[cfg(windows)]
pub fn set_autostart(enabled: bool) -> Result<AutostartStatus, String> {
    let (shortcut, target) = paths()?;
    write_preference(enabled)?;
    update_shortcut(enabled, &shortcut, &target)?;
    Ok(AutostartStatus {
        enabled,
        shortcut_path: shortcut.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
    })
}

#[cfg(not(windows))]
pub fn autostart_status() -> Result<AutostartStatus, String> {
    Err("A inicialização automática está disponível apenas no Windows.".to_owned())
}

#[cfg(not(windows))]
pub fn set_autostart(_enabled: bool) -> Result<AutostartStatus, String> {
    autostart_status()
}
