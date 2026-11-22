//! Monitoramento de dispositivos USB no Windows
//!
//! Verifica unidades removíveis e procura chaves USB

use std::path::Path;

/// Lista todas as unidades removíveis conectadas
/// Verifica por presença de arquivos indicativos de USB removíveis
pub fn list_removable_drives() -> Vec<String> {
    let mut drives = Vec::new();

    // Iterar através de todas as letras de unidade (A-Z)
    for drive_letter in b'A'..=b'Z' {
        let letter = drive_letter as char;
        let path_str = format!("{}:\\", letter);
        let path = Path::new(&path_str);

        // Verificar se o drive existe
        if !path.exists() {
            continue;
        }

        // Verificar se contém arquivos de chave USB
        let key_path = format!("{}:\\labhub-tv-key.json", letter);
        let priv_path = format!("{}:\\labhub-tv-private.key", letter);

        if Path::new(&key_path).exists() || Path::new(&priv_path).exists() {
            drives.push(letter.to_string());
        }
    }

    drives
}

/// Verifica se o pendrive contém a chave USB esperada
pub fn has_usb_key(drive_letter: &str) -> bool {
    let key_path = format!("{}:\\labhub-tv-key.json", drive_letter);
    Path::new(&key_path).exists()
}

/// Verifica se o pendrive contém a chave privada
pub fn has_private_key(drive_letter: &str) -> bool {
    let priv_path = format!("{}:\\labhub-tv-private.key", drive_letter);
    Path::new(&priv_path).exists()
}

/// Encontra pendrive com a chave USB
pub fn find_key_usb() -> Option<String> {
    // Primeiro tenta encontrar por arquivos de chave
    for drive in list_removable_drives() {
        if has_usb_key(&drive) && has_private_key(&drive) {
            return Some(drive);
        }
    }

    // Pode não encontrar se D:\ estiver desconectado
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_removable_drives() {
        let drives = list_removable_drives();
        println!("Removable drives with USB key: {:?}", drives);
    }
}