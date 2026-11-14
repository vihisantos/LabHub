use std::fs;
use std::path::Path;

fn main() {
    // Tell cargo to rerun if this script changes
    println!("cargo:rerun-if-changed=build.rs");
    
    let icon_path = Path::new("src-tauri/icons/icon.ico");
    let png_path = Path::new("src-tauri/icons/1024x1024.png");
    
    // Only generate icon.ico if it doesn't exist
    if !icon_path.exists() && png_path.exists() {
        if let Err(e) = convert_png_to_ico(png_path, icon_path) {
            eprintln!("Warning: Could not convert PNG to ICO: {}", e);
        } else {
            println!("cargo:warning=Generated icon.ico from 1024x1024.png");
        }
    }
}

fn convert_png_to_ico(png_path: &Path, ico_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let png_data = fs::read(png_path)?;
    
    if png_data.len() < 24 {
        return Err("PNG file too small".into());
    }
    
    // Verify PNG signature
    let png_signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for i in 0..8 {
        if png_data[i] != png_signature[i] {
            return Err("Invalid PNG signature".into());
        }
    }
    
    // Get image dimensions from PNG IHDR chunk
    let width = u32::from_be_bytes([png_data[16], png_data[17], png_data[18], png_data[19]]);
    let height = u32::from_be_bytes([png_data[20], png_data[21], png_data[22], png_data[23]]);
    
    // Create ICO file
    let mut ico = Vec::with_capacity(6 + 16 + png_data.len());
    
    // ICO Header (6 bytes)
    ico.extend_from_slice(&[0x00, 0x00]); // Reserved
    ico.extend_from_slice(&[0x01, 0x00]); // Type: ICO (1)
    ico.extend_from_slice(&[0x01, 0x00]); // Number of images
    
    // Directory Entry (16 bytes)
    ico.push(if width >= 256 { 0 } else { width as u8 });
    ico.push(if height >= 256 { 0 } else { height as u8 });
    ico.push(0); // Color palette
    ico.push(0); // Reserved
    ico.extend_from_slice(&[0x01, 0x00]); // Color planes = 1
    ico.extend_from_slice(&[0x20, 0x00]); // Bits per pixel = 32
    
    let image_size = png_data.len() as u32;
    ico.extend_from_slice(&image_size.to_le_bytes()); // Size of image data
    
    let offset: u32 = 6 + 16; // Header + Directory entry
    ico.extend_from_slice(&offset.to_le_bytes()); // Offset
    
    // Append PNG data
    ico.extend_from_slice(&png_data);
    
    fs::write(ico_path, &ico)?;
    
    println!("cargo:warning=Generated icon.ico from 1024x1024.png");
    
    Ok(())
}