//! Optional signed Tauri updater, enabled only by the release build.
use tauri::{AppHandle, Builder, Wry};

#[cfg(feature = "signed-updater")]
mod enabled {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;
    use tauri::{AppHandle, Builder, Manager, Wry};
    use tauri_plugin_updater::{Update, UpdaterExt};

    const ENDPOINT: &str = "https://github.com/vihisantos/LabHub/releases/latest/download/latest.json";

    #[derive(Default)]
    struct Pending {
        package: Mutex<Option<(Update, Vec<u8>)>>,
        checking: AtomicBool,
    }

    struct CheckGuard<'a>(&'a AtomicBool);
    impl Drop for CheckGuard<'_> {
        fn drop(&mut self) { self.0.store(false, Ordering::Release); }
    }

    pub fn configure(builder: Builder<Wry>) -> Builder<Wry> {
        let builder = builder.manage(Pending::default());
        match option_env!("LABHUB_TV_UPDATER_PUBLIC_KEY").filter(|s| !s.trim().is_empty()) {
            Some(key) => builder.plugin(tauri_plugin_updater::Builder::new().pubkey(key).build()),
            None => builder,
        }
    }

    pub async fn prepare(app: AppHandle) -> Result<Option<String>, String> {
        let Some(key) = option_env!("LABHUB_TV_UPDATER_PUBLIC_KEY")
            .filter(|s| !s.trim().is_empty()) else { return Ok(None) };
        if !crate::is_local_auth_valid() { return Ok(None) }
        let state = app.state::<Pending>();
        if state.checking.swap(true, Ordering::AcqRel) { return Ok(None) }
        let _guard = CheckGuard(&state.checking);
        {
            let pending = state.package.lock().map_err(|_| "Estado de atualização indisponível")?;
            if let Some((update, _)) = pending.as_ref() {
                return Ok(Some(update.version.clone()));
            }
        }
        let endpoint = ENDPOINT.parse().map_err(|_| "Endpoint de atualização inválido")?;
        let updater = app.updater_builder()
            .pubkey(key)
            .endpoints(vec![endpoint]).map_err(|e| e.to_string())?
            .timeout(Duration::from_secs(180))
            .build().map_err(|e| e.to_string())?;
        let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
            return Ok(None)
        };
        let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
        let version = update.version.clone();
        *state.package.lock().map_err(|_| "Estado de atualização indisponível")? = Some((update, bytes));
        Ok(Some(version))
    }

    pub fn install(app: AppHandle) -> Result<(), String> {
        if !crate::is_local_auth_valid() { return Err("Ativação inválida".into()) }
        let state = app.state::<Pending>();
        let (update, bytes) = state.package.lock().map_err(|_| "Estado de atualização indisponível")?
            .take().ok_or("Nenhuma atualização verificada")?;
        update.install(bytes).map_err(|e| e.to_string())?;
        app.restart();
    }
}

pub fn configure(builder: Builder<Wry>) -> Builder<Wry> {
    #[cfg(feature = "signed-updater")]
    { return enabled::configure(builder); }
    #[cfg(not(feature = "signed-updater"))]
    { builder }
}

#[tauri::command]
pub async fn prepare_tv_update(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(feature = "signed-updater")]
    { return enabled::prepare(app).await; }
    #[cfg(not(feature = "signed-updater"))]
    { let _ = app; Ok(None) }
}

#[tauri::command]
pub async fn install_tv_update(app: AppHandle) -> Result<(), String> {
    #[cfg(feature = "signed-updater")]
    { return enabled::install(app); }
    #[cfg(not(feature = "signed-updater"))]
    { let _ = app; Err("Atualizador não configurado neste build".into()) }
}
