fn main() {
    println!("cargo:rerun-if-env-changed=SCOPEDELTA_DESKTOP_UPDATES_REQUIRED");
    println!("cargo:rerun-if-env-changed=SCOPEDELTA_DESKTOP_UPDATER_ENDPOINT");
    println!("cargo:rerun-if-env-changed=SCOPEDELTA_DESKTOP_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=TAURI_SIGNING_PRIVATE_KEY");
    if std::env::var("SCOPEDELTA_DESKTOP_UPDATES_REQUIRED").as_deref() == Ok("1") {
        for name in [
            "SCOPEDELTA_DESKTOP_UPDATER_ENDPOINT",
            "SCOPEDELTA_DESKTOP_UPDATER_PUBLIC_KEY",
            "TAURI_SIGNING_PRIVATE_KEY",
        ] {
            assert!(
                std::env::var(name).is_ok_and(|value| !value.trim().is_empty()),
                "update-enabled release build requires {name}"
            );
        }
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "local_settings",
            "select_server",
            "set_notifications_enabled",
            "remote_notification_context",
            "remote_submit_notifications",
            "check_for_update",
        ]),
    ))
    .expect("failed to build ScopeDelta desktop metadata");
}
