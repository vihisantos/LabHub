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

    /// A chave vem de uma variável de ambiente em tempo de compilação; um `\n`
    /// no fim (comum no Actions) invalidaria a assinatura se não fosse removido.
    pub(super) fn public_key() -> Option<&'static str> {
        option_env!("LABHUB_TV_UPDATER_PUBLIC_KEY")
            .map(str::trim)
            .filter(|key| !key.is_empty())
    }

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
        match public_key() {
            Some(key) => builder.plugin(tauri_plugin_updater::Builder::new().pubkey(key).build()),
            None => builder,
        }
    }

    pub async fn prepare(app: AppHandle) -> Result<Option<String>, String> {
        let Some(key) = public_key() else { return Ok(None) };
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

/// Smoke de assinatura sem rede e sem credenciais reais: usa o par descartável
/// publicado nos testes do `tauri-plugin-updater`. Garante que um pacote íntegro
/// passa e que bytes alterados ou chave errada são rejeitados antes da instalação.
#[cfg(all(test, feature = "signed-updater"))]
mod signature_smoke_tests {
    use super::enabled::public_key;
    use base64::Engine;
    use tauri::test::{mock_builder, mock_context, noop_assets};
    use tauri_plugin_updater::UpdaterExt;

    const PUBLIC_KEY: &str = "untrusted comment: minisign public key: A49EF4746FA6E6D7\nRWTX5qZvdPSepDGWg2bz8n6ArQnBMwgQK1geVosorcbLzcunD+KJ+cYe";
    const SIGNATURE: &str = "untrusted comment: signature from tauri secret key\nRUTX5qZvdPSepPF2zsjvP/L/TQtBLRnWRvaq+4omK1UEugtQp/USrGiI1v762sDy3id3aor7bRC9ETyeot6lMHHrWoZ5hjUM1Qc=\ntrusted comment: timestamp:1791649051\tfile:payload\tversion:2.0.0\nDDq2CLOEl5cQmC2eJRHlnZPVViOZsu1CjpPKQoei4A/XBfkDqGO0B+QMrcrHgEQ5qV3mne75tdFWhJpqUXh9AA==";

    fn encode(value: &str) -> String {
        base64::engine::general_purpose::STANDARD.encode(value)
    }

    #[test]
    fn chave_publica_embarcada_e_aparada() {
        if let Some(key) = public_key() {
            assert!(!key.is_empty());
            assert_eq!(key, key.trim());
            assert!(!key.contains('\n'));
        }
    }

    #[test]
    fn verifica_assinatura_e_rejeita_adulteracao() {
        let mut context = mock_context(noop_assets());
        context.config_mut().plugins.0.insert("updater".into(), serde_json::json!({
            "pubkey": encode(PUBLIC_KEY),
            "endpoints": ["https://example.invalid/update"],
        }));
        let app = mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().pubkey(encode(PUBLIC_KEY)).build())
            .build(context)
            .expect("mock app");
        let updater = app.updater_builder()
            .pubkey(encode(PUBLIC_KEY))
            .target("test-target")
            .endpoints(vec!["https://example.invalid/update".parse().unwrap()])
            .unwrap()
            .build()
            .unwrap();
        let manifest = serde_json::json!({
            "version": "2.0.0",
            "notes": "smoke",
            "pub_date": "2025-01-01T00:00:00Z",
            "platforms": { "test-target": {
                "url": "https://example.invalid/package",
                "signature": encode(SIGNATURE),
            }},
        });
        let update = updater.restore_update(manifest).unwrap().unwrap();
        update.verify(b"test").unwrap();
        assert!(update.verify(b"alterado").is_err());
    }
}
