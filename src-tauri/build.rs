fn main() {
    // Tell cargo to rerun if this script changes
    println!("cargo:rerun-if-changed=build.rs");

    // Use tauri_build which handles icons and other build requirements
    tauri_build::build();
}