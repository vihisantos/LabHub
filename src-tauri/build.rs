use std::fs;
use std::path::Path;

fn main() {
    // Tell cargo to rerun if this script changes
    println!("cargo:rerun-if-changed=build.rs");
    
    let icon_path = Path::new("icons/icon.ico");
    let png_path = Path::new("icons/1024x1024.png");
    
    // Only generate icon.ico if it doesn't exist
    if !icon_path.exists() {
        // Try to find the source PNG
        let source_png = Path::new("../public/logo-512.png");
        let png_to_use = if png_path.exists() {
            png_path.to_path_buf()
        } else if source_png.exists() {
            // Copy the public logo as source
            fs::create_dir_all("icons").ok();
            fs::copy(source_png, "icons/1024x1024.png").ok();
            png_path.to_path_buf()
        } else {
            println!("cargo:warning=No source PNG found for icon generation");
            return;
        };
        
        if let Err(e) = convert_png_to_ico(&png_to_use, icon_path) {
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
    
    // Create ICO file - ICO format 3.00 is required by Windows Resource Compiler
    let mut ico = Vec::with_capacity(6 + 16 + png_data.len());
    
    // ICO Header (6 bytes):
    // 0-1: Reserved (0x0000)
    // 2-3: Type (0x0001 = ICO)
    // 4-5: Number of images (0x0001)
    ico.extend_from_slice(&[0x00, 0x00]); // Reserved
    ico.extend_from_slice(&[0x01, 0x00]); // Type: ICO (1)
    ico.extend_from_slice(&[0x01, 0x00]); // Number of images
    
    // Directory Entry (16 bytes):
    // 0: Width (0 means 256)
    // 1: Height (0 means 256)
    // 2-3: Colors in palette
    // 4: Reserved
    // 5-6: Color planes
    // 7-8: Bits per pixel
    // 9-12: Size of image data (4 bytes little-endian)
    // 13-16: Offset to image data (4 bytes little-endian)
    ico.push(0x00); // Width = 256 (0 means 256)
    ico.push(0x00); // Height = 256
    ico.push(0x00); // Colors
    ico.push(0x00); // Reserved
    ico.extend_from_slice(&[0x01, 0x00]); // Color planes = 1
    ico.extend_from_slice(&[0x20, 0x00]); // Bits per pixel = 32
    
    let image_size = png_data.len() as u32;
    ico.extend_from_slice(&image_size.to_le_bytes()); // Size of image data
    
    let offset: u32 = 6 + 16; // Header + Directory entry
    ico.extend_from_slice(&offset.to_le_bytes()); // Offset
    
    // Append PNG data
    ico.extend_from_slice(&png_data);
    
    // Ensure icons directory exists
    if let Some(parent) = ico_path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    fs::write(ico_path, &ico)?;
    
    Ok(())
}