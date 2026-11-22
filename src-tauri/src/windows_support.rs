use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub mechanism: String,
    pub shortcut_path: String,
    pub target_path: String,
}

#[cfg(windows)]
const REG_KEY: &str = r"HKCU\Software\LabHub TV";

#[cfg(windows)]
const STARTUP_SHORTCUT: &str = r"Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV.lnk";

#[cfg(windows)]
const LEGACY_STARTUP_SHORTCUT: &str =
    r"Microsoft\Windows\Start Menu\Programs\Startup\LabHub TV\LabHub TV.lnk";

#[cfg(windows)]
fn paths() -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "A pasta AppData do usuário não está disponível.".to_owned())?;
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Não foi possível localizar o executável instalado: {e}"))?;
    Ok((
        std::path::PathBuf::from(app_data).join(STARTUP_SHORTCUT),
        current_exe,
    ))
}

#[cfg(windows)]
fn legacy_shortcut() -> Option<std::path::PathBuf> {
    std::env::var_os("APPDATA")
        .map(|app_data| std::path::PathBuf::from(app_data).join(LEGACY_STARTUP_SHORTCUT))
}

#[cfg(windows)]
fn read_reg_value(name: &str) -> Option<String> {
    let output = std::process::Command::new("reg.exe")
        .args(["query", REG_KEY, "/v", name])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(|line| {
        line.split_once("REG_SZ")
            .map(|(_, value)| value.trim().to_owned())
    })
}

#[cfg(windows)]
fn write_reg_value(name: &str, value: &str) -> Result<(), String> {
    let result = std::process::Command::new("reg.exe")
        .args(["add", REG_KEY, "/v", name, "/t", "REG_SZ", "/d", value, "/f"])
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
fn powershell(script: &str, target: &std::path::Path) -> Result<String, String> {
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env("LABHUB_TASK_TARGET", target)
        .output()
        .map_err(|e| format!("Não foi possível consultar o Agendador de Tarefas: {e}"))?;
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    if !output.status.success() {
        return Err(if stderr.is_empty() {
            format!("O Agendador de Tarefas retornou {}", output.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

#[cfg(windows)]
fn create_task(target: &std::path::Path) -> Result<(), String> {
    const SCRIPT: &str = r#"
$ErrorActionPreference='Stop'
$u=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$a=New-ScheduledTaskAction -Execute $env:LABHUB_TASK_TARGET
$t=New-ScheduledTaskTrigger -AtLogOn -User $u
$p=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'LabHub TV' -Action $a -Trigger $t -Principal $p -Force | Out-Null
$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction Stop
if($q.Principal.LogonType -ne 'Interactive' -or $q.Principal.RunLevel -ne 'Limited' -or $q.Principal.UserId -ne $u){exit 3}
if($q.Actions.Count -ne 1 -or $q.Actions[0].Execute -ne $env:LABHUB_TASK_TARGET){exit 4}
if(-not($q.Triggers|Where-Object{$_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $_.User -eq $u})){exit 5}
exit 0
"#;
    powershell(SCRIPT, target).map(|_| ())
}

#[cfg(windows)]
fn delete_task(target: &std::path::Path) -> Result<(), String> {
    const SCRIPT: &str = r#"
$ErrorActionPreference='Stop'
$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue
if($q){Unregister-ScheduledTask -TaskName 'LabHub TV' -Confirm:$false}
if(Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue){exit 2}
exit 0
"#;
    powershell(SCRIPT, target).map(|_| ())
}

#[cfg(windows)]
fn task_is_active(target: &std::path::Path) -> bool {
    const SCRIPT: &str = r#"
$u=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$q=Get-ScheduledTask -TaskName 'LabHub TV' -ErrorAction SilentlyContinue
if(-not $q){exit 1}
if($q.Principal.LogonType -ne 'Interactive' -or $q.Principal.RunLevel -ne 'Limited' -or $q.Principal.UserId -ne $u){exit 2}
if($q.Actions.Count -ne 1 -or $q.Actions[0].Execute -ne $env:LABHUB_TASK_TARGET){exit 3}
if(-not($q.Triggers|Where-Object{$_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' -and $_.User -eq $u})){exit 4}
exit 0
"#;
    powershell(SCRIPT, target).is_ok()
}

#[cfg(windows)]
fn remove_link(path: &std::path::Path) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_file(path)
            .map_err(|e| format!("Não foi possível remover o atalho de inicialização: {e}"))?;
    }
    Ok(())
}

#[cfg(windows)]
fn update_shortcut(
    enabled: bool,
    shortcut: &std::path::Path,
    target: &std::path::Path,
) -> Result<(), String> {
    remove_link(shortcut)?;
    if let Some(legacy) = legacy_shortcut() {
        remove_link(&legacy)?;
        if let Some(parent) = legacy.parent() {
            let _ = std::fs::remove_dir(parent);
        }
    }
    if !enabled {
        return Ok(());
    }
    if !target.is_file() {
        return Err(format!(
            "Executável instalado não encontrado: {}",
            target.display()
        ));
    }
    if let Some(parent) = shortcut.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Não foi possível acessar a pasta Startup: {e}"))?;
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
    if !shortcut.exists() {
        return Err("O atalho de inicialização não foi criado.".to_owned());
    }
    Ok(())
}

#[cfg(windows)]
pub fn autostart_status() -> Result<AutostartStatus, String> {
    let (shortcut, target) = paths()?;
    let requested = read_reg_value("AutostartRequested").or_else(|| read_reg_value("Autostart"));
    let mechanism = read_reg_value("AutostartMechanism").unwrap_or_default();
    let task_active = mechanism == "Task" && task_is_active(&target);
    let shortcut_active = mechanism == "StartupShortcut" && shortcut.exists();
    let enabled = match requested.as_deref() {
        Some("1") => task_active || shortcut_active,
        Some("0") => false,
        None => shortcut.exists(),
    };
    Ok(AutostartStatus {
        enabled,
        mechanism,
        shortcut_path: shortcut.to_string_lossy().into_owned(),
        target_path: target.to_string_lossy().into_owned(),
    })
}

#[cfg(windows)]
pub fn set_autostart(enabled: bool) -> Result<AutostartStatus, String> {
    let (shortcut, target) = paths()?;
    write_reg_value("AutostartRequested", if enabled { "1" } else { "0" })?;

    if !enabled {
        let delete_result = delete_task(&target);
        update_shortcut(false, &shortcut, &target)?;
        write_reg_value("Autostart", "0")?;
        write_reg_value("AutostartMechanism", "None")?;
        if let Err(e) = delete_result {
            eprintln!("[autostart] falha ao remover tarefa: {e}");
        }
        return autostart_status();
    }

    match create_task(&target) {
        Ok(()) => {
            update_shortcut(false, &shortcut, &target)?;
            write_reg_value("Autostart", "1")?;
            write_reg_value("AutostartMechanism", "Task")?;
        }
        Err(task_error) => {
            eprintln!("[autostart] falha ao criar tarefa: {task_error}");
            let _ = delete_task(&target);
            update_shortcut(true, &shortcut, &target)?;
            if shortcut.exists() {
                write_reg_value("Autostart", "1")?;
                write_reg_value("AutostartMechanism", "StartupShortcut")?;
            } else {
                write_reg_value("Autostart", "0")?;
                write_reg_value("AutostartMechanism", "None")?;
                return Err(format!(
                    "Não foi possível ativar a inicialização automática. Tarefa: {task_error}"
                ));
            }
        }
    }
    autostart_status()
}

#[cfg(not(windows))]
pub fn autostart_status() -> Result<AutostartStatus, String> {
    Err("A inicialização automática está disponível apenas no Windows.".to_owned())
}

#[cfg(not(windows))]
pub fn set_autostart(_enabled: bool) -> Result<AutostartStatus, String> {
    autostart_status()
}
