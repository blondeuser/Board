fn main() {
  // macOS: ONNX Runtime's CoreML code calls __isPlatformVersionAtLeast, which lives in clang's runtime lib and is not linked by default.
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
    if let Ok(out) = std::process::Command::new("xcrun").args(["clang", "-print-resource-dir"]).output() {
      let dir = String::from_utf8_lossy(&out.stdout).trim().to_string();
      println!("cargo:rustc-link-search=native={dir}/lib/darwin");
      println!("cargo:rustc-link-lib=static=clang_rt.osx");
    }
  }
  tauri_build::build()
}
