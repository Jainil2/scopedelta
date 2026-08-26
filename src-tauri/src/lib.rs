mod security;

use std::{
    collections::VecDeque,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use regex::Regex;
use reqwest::redirect::Policy;
use security::{
    DeepLinkTarget, allowed_provider_url, normalize_origin, parse_deep_link, same_origin,
    validate_route,
};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Manager, Runtime, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    menu::{MenuBuilder, SubmenuBuilder},
    webview::NewWindowResponse,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::{NotificationExt, PermissionState};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const SETTINGS_FILE: &str = "desktop-preferences.json";
const MAX_CURSOR_LENGTH: usize = 2048;
const MAX_EVENT_ID_LENGTH: usize = 96;
const MAX_EVENT_BATCH: usize = 100;
const MAX_DEDUPE_IDS: usize = 256;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    selected_origin: Option<String>,
    notifications_enabled: bool,
    notification_cursor: Option<String>,
    #[serde(default)]
    seen_event_ids: VecDeque<String>,
}

#[derive(Debug)]
struct RuntimeState {
    preferences: Mutex<Preferences>,
    pending_deep_link: Mutex<Option<DeepLinkTarget>>,
    settings_path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalSettings {
    cloud_origin: Option<String>,
    selected_origin: Option<String>,
    notifications_enabled: bool,
    pending_deep_link: Option<DeepLinkTarget>,
    updater_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPreferenceResult {
    enabled: bool,
    permission: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteNotificationContext {
    enabled: bool,
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bootstrap {
    product: String,
    protocol_version: u8,
    canonical_origin: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NotificationEvent {
    id: String,
    category: NotificationCategory,
    created_at: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
enum NotificationCategory {
    WorkItemActivity,
    ClientActivity,
}

fn validate_notification_payload(cursor: &str, events: &[NotificationEvent]) -> Result<(), String> {
    let cursor_expression =
        Regex::new(r"^[A-Za-z0-9_-]+$").expect("notification cursor expression must compile");
    if cursor.is_empty()
        || cursor.len() > MAX_CURSOR_LENGTH
        || !cursor_expression.is_match(cursor)
        || events.len() > MAX_EVENT_BATCH
    {
        return Err("The desktop notification payload is invalid.".into());
    }
    let event_id = Regex::new(
        r"^(?:workspace|client-internal|client-portal):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    )
    .expect("notification event ID expression must compile");
    for event in events {
        if event.id.len() > MAX_EVENT_ID_LENGTH
            || !event_id.is_match(&event.id)
            || event.created_at.len() > 40
            || time::OffsetDateTime::parse(
                &event.created_at,
                &time::format_description::well_known::Rfc3339,
            )
            .is_err()
        {
            return Err("The desktop notification payload is invalid.".into());
        }
        validate_route(&event.path)?;
    }
    Ok(())
}

fn load_preferences(path: &Path) -> Preferences {
    let mut preferences: Preferences = fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default();
    preferences.selected_origin = preferences
        .selected_origin
        .and_then(|origin| normalize_origin(&origin, cfg!(debug_assertions)).ok());
    preferences.notification_cursor = preferences
        .notification_cursor
        .filter(|cursor| !cursor.is_empty() && cursor.len() <= MAX_CURSOR_LENGTH);
    preferences.seen_event_ids.truncate(MAX_DEDUPE_IDS);
    preferences
}

fn persist_preferences(state: &RuntimeState, preferences: &Preferences) -> Result<(), String> {
    let parent = state
        .settings_path
        .parent()
        .ok_or_else(|| "The preferences directory is unavailable.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Could not create the preferences directory.".to_string())?;
    let temporary = state.settings_path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(preferences)
        .map_err(|_| "Could not encode desktop preferences.".to_string())?;
    fs::write(&temporary, bytes).map_err(|_| "Could not save desktop preferences.".to_string())?;
    fs::rename(temporary, &state.settings_path)
        .map_err(|_| "Could not commit desktop preferences.".to_string())
}

fn local_asset_url() -> Url {
    #[cfg(debug_assertions)]
    let value = "http://127.0.0.1:1420/";
    #[cfg(all(not(debug_assertions), target_os = "windows"))]
    let value = "http://tauri.localhost/";
    #[cfg(all(not(debug_assertions), not(target_os = "windows")))]
    let value = "tauri://localhost/";
    Url::parse(value).expect("the bundled asset URL must be valid")
}

fn is_local_asset_url(url: &Url) -> bool {
    if url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost") {
        return true;
    }
    cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1") | Some("localhost"))
        && url.port() == Some(1420)
}

fn require_local_caller(window: &WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "Could not verify the desktop window.".to_string())?;
    if window.label() != "main" || !is_local_asset_url(&url) {
        return Err("This command is available only to the bundled desktop UI.".into());
    }
    Ok(())
}

fn require_remote_caller(
    window: &WebviewWindow,
    state: &RuntimeState,
) -> Result<Preferences, String> {
    let preferences = state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())?
        .clone();
    let selected = preferences
        .selected_origin
        .as_deref()
        .ok_or_else(|| "No ScopeDelta deployment is selected.".to_string())?;
    let url = window
        .url()
        .map_err(|_| "Could not verify the product origin.".to_string())?;
    if !remote_caller_allowed(window.label(), &url, selected, cfg!(debug_assertions)) {
        return Err("The desktop bridge rejected this origin.".into());
    }
    Ok(preferences)
}

fn remote_caller_allowed(
    window_label: &str,
    current_url: &Url,
    selected_origin: &str,
    debug: bool,
) -> bool {
    window_label == "main"
        && normalize_origin(selected_origin, debug)
            .is_ok_and(|normalized| same_origin(current_url, &normalized))
}

fn prepare_server_switch<F>(
    preferences: &mut Preferences,
    canonical: &str,
    clear_browsing_data: F,
) -> Result<bool, String>
where
    F: FnOnce() -> Result<(), String>,
{
    let changed = preferences.selected_origin.as_deref() != Some(canonical);
    if changed {
        clear_browsing_data()?;
        preferences.notification_cursor = None;
        preferences.seen_event_ids.clear();
    }
    preferences.selected_origin = Some(canonical.to_string());
    Ok(changed)
}

async fn verify_server(origin: &str) -> Result<String, String> {
    let normalized = normalize_origin(origin, cfg!(debug_assertions))?;
    let endpoint = format!("{normalized}/api/v1/desktop/bootstrap");
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Could not initialize secure server verification.".to_string())?;
    let response = client
        .get(&endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| {
            "The server could not be reached or its TLS certificate is invalid.".to_string()
        })?;
    if response.url().as_str() != endpoint || response.status().is_redirection() {
        return Err("The bootstrap endpoint must not redirect.".into());
    }
    if !response.status().is_success() {
        return Err("The server did not accept desktop verification.".into());
    }
    let bootstrap = response
        .json::<Bootstrap>()
        .await
        .map_err(|_| "The server returned an invalid desktop bootstrap response.".to_string())?;
    if bootstrap.product != "scopedelta" || bootstrap.protocol_version != 1 {
        return Err("The server uses an unsupported desktop protocol.".into());
    }
    let canonical = normalize_origin(&bootstrap.canonical_origin, cfg!(debug_assertions))?;
    if canonical != normalized {
        return Err("The server canonical origin does not match the selected deployment.".into());
    }
    Ok(canonical)
}

#[tauri::command]
fn local_settings(
    window: WebviewWindow,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<LocalSettings, String> {
    require_local_caller(&window)?;
    let preferences = state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())?
        .clone();
    let pending = state
        .pending_deep_link
        .lock()
        .map_err(|_| "Desktop link state is unavailable.".to_string())?
        .clone();
    let cloud_origin = option_env!("SCOPEDELTA_CLOUD_ORIGIN")
        .and_then(|value| normalize_origin(value, cfg!(debug_assertions)).ok());
    Ok(LocalSettings {
        cloud_origin,
        selected_origin: preferences.selected_origin,
        notifications_enabled: preferences.notifications_enabled,
        pending_deep_link: pending,
        updater_enabled: updater_configuration().is_some(),
    })
}

#[tauri::command]
async fn select_server(
    window: WebviewWindow,
    state: State<'_, Arc<RuntimeState>>,
    origin: String,
    path: Option<String>,
) -> Result<(), String> {
    require_local_caller(&window)?;
    let canonical = verify_server(&origin).await?;
    let destination =
        path.map_or_else(|| Ok("/app".to_string()), |value| validate_route(&value))?;

    let mut preferences = state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())?
        .clone();
    prepare_server_switch(&mut preferences, &canonical, || {
        window
            .clear_all_browsing_data()
            .map_err(|_| "Could not clear browsing data before switching servers.".to_string())
    })?;
    persist_preferences(&state, &preferences)?;
    *state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())? = preferences;
    *state
        .pending_deep_link
        .lock()
        .map_err(|_| "Desktop link state is unavailable.".to_string())? = None;
    window
        .navigate(
            Url::parse(&format!("{canonical}{destination}"))
                .map_err(|_| "The selected product route is invalid.".to_string())?,
        )
        .map_err(|_| "Could not open the selected ScopeDelta deployment.".to_string())
}

#[tauri::command]
fn set_notifications_enabled(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    enabled: bool,
) -> Result<NotificationPreferenceResult, String> {
    require_local_caller(&window)?;
    let permission = if enabled {
        app.notification()
            .request_permission()
            .unwrap_or(PermissionState::Denied)
    } else {
        app.notification()
            .permission_state()
            .unwrap_or(PermissionState::Denied)
    };
    let granted = permission == PermissionState::Granted;
    let final_enabled = enabled && granted;
    let mut preferences = state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())?
        .clone();
    if final_enabled && !preferences.notifications_enabled {
        preferences.notification_cursor = None;
        preferences.seen_event_ids.clear();
    }
    preferences.notifications_enabled = final_enabled;
    persist_preferences(&state, &preferences)?;
    *state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())? = preferences;
    Ok(NotificationPreferenceResult {
        enabled: final_enabled,
        permission: match permission {
            PermissionState::Granted => "granted",
            PermissionState::Denied => "denied",
            PermissionState::Prompt | PermissionState::PromptWithRationale => "prompt",
        }
        .into(),
    })
}

#[tauri::command]
fn remote_notification_context(
    window: WebviewWindow,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<RemoteNotificationContext, String> {
    let preferences = require_remote_caller(&window, &state)?;
    Ok(RemoteNotificationContext {
        enabled: preferences.notifications_enabled,
        cursor: preferences.notification_cursor,
    })
}

#[tauri::command]
fn remote_submit_notifications(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
    cursor: String,
    events: Vec<NotificationEvent>,
) -> Result<(), String> {
    let mut preferences = require_remote_caller(&window, &state)?;
    validate_notification_payload(&cursor, &events)?;
    if preferences.notifications_enabled {
        for event in events {
            if preferences.seen_event_ids.contains(&event.id) {
                continue;
            }
            let body = match event.category {
                NotificationCategory::WorkItemActivity => {
                    "New work item activity is ready to review."
                }
                NotificationCategory::ClientActivity => "New client activity is ready to review.",
            };
            if let Some(origin) = preferences.selected_origin.clone() {
                show_native_notification(&app, body, origin, event.path);
            }
            preferences.seen_event_ids.push_back(event.id);
            while preferences.seen_event_ids.len() > MAX_DEDUPE_IDS {
                preferences.seen_event_ids.pop_front();
            }
        }
    }
    preferences.notification_cursor = Some(cursor);
    persist_preferences(&state, &preferences)?;
    *state
        .preferences
        .lock()
        .map_err(|_| "Desktop preferences are unavailable.".to_string())? = preferences;
    Ok(())
}

fn notification_destination(
    selected_origin: Option<&str>,
    event_origin: &str,
    path: &str,
) -> Option<Url> {
    let selected = normalize_origin(selected_origin?, cfg!(debug_assertions)).ok()?;
    if selected != event_origin {
        return None;
    }
    let route = validate_route(path).ok()?;
    Url::parse(&format!("{selected}{route}")).ok()
}

fn show_native_notification(app: &AppHandle, body: &str, origin: String, path: String) {
    let mut notification = notify_rust::Notification::new();
    notification
        .appname("com.scopedelta.desktop")
        .summary("ScopeDelta")
        .body(body)
        .action("default", "Open ScopeDelta")
        .timeout(notify_rust::Timeout::Milliseconds(10_000));
    let Ok(handle) = notification.show() else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        handle.wait_for_action(|action| {
            if action != "default" {
                return;
            }
            let selected = app.try_state::<Arc<RuntimeState>>().and_then(|state| {
                state
                    .preferences
                    .lock()
                    .ok()
                    .and_then(|preferences| preferences.selected_origin.clone())
            });
            let Some(destination) = notification_destination(selected.as_deref(), &origin, &path)
            else {
                return;
            };
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.navigate(destination);
                let _ = window.show();
                let _ = window.set_focus();
            }
        });
    });
}

fn updater_configuration() -> Option<(Url, &'static str)> {
    let endpoint = option_env!("SCOPEDELTA_DESKTOP_UPDATER_ENDPOINT")?.trim();
    let public_key = option_env!("SCOPEDELTA_DESKTOP_UPDATER_PUBLIC_KEY")?.trim();
    if endpoint.is_empty() || public_key.is_empty() {
        return None;
    }
    let url = Url::parse(endpoint).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    Some((url, public_key))
}

fn customer_server_is_updater_origin(endpoint: &Url, selected_origin: Option<&str>) -> bool {
    selected_origin.is_some_and(|selected| endpoint.origin().ascii_serialization() == selected)
}

#[tauri::command]
async fn check_for_update(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, Arc<RuntimeState>>,
) -> Result<Option<String>, String> {
    require_local_caller(&window)?;
    let Some((endpoint, public_key)) = updater_configuration() else {
        return Ok(None);
    };
    let selected_origin = state
        .preferences
        .lock()
        .ok()
        .and_then(|preferences| preferences.selected_origin.clone());
    if customer_server_is_updater_origin(&endpoint, selected_origin.as_deref()) {
        return Err("A customer deployment cannot be used as the updater origin.".into());
    }
    let updater = app
        .updater_builder()
        .pubkey(public_key)
        .endpoints(vec![endpoint])
        .map_err(|_| "The updater endpoint configuration is invalid.".to_string())?
        .build()
        .map_err(|_| "The signed updater could not be initialized.".to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|_| "Update metadata or its signature could not be verified.".to_string())?;
    let Some(update) = update else {
        return Ok(None);
    };
    let version = update.version.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|_| "The update download or signature verification failed.".to_string())?;
    Ok(Some(version))
}

fn handle_deep_link<R: Runtime>(app: &AppHandle<R>, state: &Arc<RuntimeState>, value: &str) {
    let Ok(target) = parse_deep_link(value, cfg!(debug_assertions)) else {
        return;
    };
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let selected = state
        .preferences
        .lock()
        .ok()
        .and_then(|preferences| preferences.selected_origin.clone());
    if selected.as_deref() == Some(target.server.as_str()) {
        if let Ok(url) = Url::parse(&format!("{}{}", target.server, target.path)) {
            let _ = window.navigate(url);
        }
    } else {
        if let Ok(mut pending) = state.pending_deep_link.lock() {
            *pending = Some(target);
        }
        let _ = window.navigate(local_asset_url());
    }
    let _ = window.show();
    let _ = window.set_focus();
}

fn create_main_window(app: &tauri::App, state: &Arc<RuntimeState>) -> tauri::Result<WebviewWindow> {
    let navigation_state = Arc::clone(state);
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("ScopeDelta")
        .inner_size(1040.0, 760.0)
        .min_inner_size(560.0, 580.0)
        .devtools(cfg!(debug_assertions))
        .on_navigation(move |url| {
            if is_local_asset_url(url) {
                return true;
            }
            let selected = navigation_state
                .preferences
                .lock()
                .ok()
                .and_then(|preferences| preferences.selected_origin.clone());
            if selected
                .as_deref()
                .is_some_and(|origin| same_origin(url, origin))
            {
                return true;
            }
            if allowed_provider_url(url) {
                let _ = open::that_detached(url.as_str());
            }
            false
        })
        .on_new_window(|url, _features| {
            if allowed_provider_url(&url) {
                let _ = open::that_detached(url.as_str());
            }
            NewWindowResponse::Deny
        })
        .build()?;
    if let Some(origin) = state
        .preferences
        .lock()
        .ok()
        .and_then(|preferences| preferences.selected_origin.clone())
        && let Ok(url) = Url::parse(&format!("{origin}/app"))
    {
        let _ = window.navigate(url);
    }
    Ok(window)
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(state) = app.try_state::<Arc<RuntimeState>>() {
                for argument in args {
                    if argument.starts_with("scopedelta://") {
                        handle_deep_link(app, &state, &argument);
                    }
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            local_settings,
            select_server,
            set_notifications_enabled,
            remote_notification_context,
            remote_submit_notifications,
            check_for_update,
        ])
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join(SETTINGS_FILE);
            let state = Arc::new(RuntimeState {
                preferences: Mutex::new(load_preferences(&settings_path)),
                pending_deep_link: Mutex::new(None),
                settings_path,
            });
            app.manage(Arc::clone(&state));
            create_main_window(app, &state)?;
            let application_menu = SubmenuBuilder::new(app, "ScopeDelta")
                .text("preferences", "Server & Preferences…")
                .build()?;
            app.set_menu(MenuBuilder::new(app).item(&application_menu).build()?)?;
            app.on_menu_event(|app_handle, event| {
                if event.id().0.as_str() == "preferences"
                    && let Some(window) = app_handle.get_webview_window("main")
                {
                    let _ = window.navigate(local_asset_url());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            });
            let deep_link_state = Arc::clone(&state);
            let deep_link_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&deep_link_handle, &deep_link_state, url.as_str());
                }
            });
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running ScopeDelta desktop");
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::{Method::GET, MockServer};
    use serde_json::json;

    #[test]
    fn missing_or_insecure_update_configuration_disables_updates() {
        let configured = updater_configuration();
        if let Some((endpoint, key)) = configured {
            assert_eq!(endpoint.scheme(), "https");
            assert!(!key.is_empty());
        }
    }

    #[test]
    fn selected_customer_server_can_never_be_the_updater_origin() {
        let endpoint = Url::parse("https://updates.example/latest.json").unwrap();
        assert!(customer_server_is_updater_origin(
            &endpoint,
            Some("https://updates.example")
        ));
        assert!(!customer_server_is_updater_origin(
            &endpoint,
            Some("https://customer.example")
        ));
        assert!(!customer_server_is_updater_origin(&endpoint, None));
    }

    #[test]
    fn dedupe_storage_is_bounded() {
        let mut ids = VecDeque::new();
        for number in 0..(MAX_DEDUPE_IDS + 10) {
            ids.push_back(number.to_string());
            while ids.len() > MAX_DEDUPE_IDS {
                ids.pop_front();
            }
        }
        assert_eq!(ids.len(), MAX_DEDUPE_IDS);
        assert_eq!(ids.front().map(String::as_str), Some("10"));
    }

    #[test]
    fn notification_bridge_revalidates_every_bounded_field() {
        let valid = NotificationEvent {
            id: "workspace:11111111-1111-4111-8111-111111111111".into(),
            category: NotificationCategory::WorkItemActivity,
            created_at: "2026-08-26T10:00:00Z".into(),
            path: "/app/acme/inbox".into(),
        };
        assert!(validate_notification_payload("eyJ2ZXJzaW9uIjoxfQ", &[valid]).is_ok());

        let invalid = NotificationEvent {
            id: "forged:https://evil.example".into(),
            category: NotificationCategory::ClientActivity,
            created_at: "not-a-date".into(),
            path: "https://evil.example".into(),
        };
        assert!(validate_notification_payload("cursor with spaces", &[invalid]).is_err());
    }

    #[test]
    fn notification_activation_cannot_cross_deployments_or_route_boundaries() {
        assert_eq!(
            notification_destination(
                Some("https://app.example.test"),
                "https://app.example.test",
                "/app/acme/inbox",
            )
            .unwrap()
            .as_str(),
            "https://app.example.test/app/acme/inbox"
        );
        assert!(
            notification_destination(
                Some("https://other.example.test"),
                "https://app.example.test",
                "/app/acme/inbox",
            )
            .is_none()
        );
        assert!(
            notification_destination(
                Some("https://app.example.test"),
                "https://app.example.test",
                "https://evil.example",
            )
            .is_none()
        );
    }

    #[test]
    fn ipc_caller_must_be_main_window_at_exact_selected_origin() {
        let selected = "https://app.example.test";
        assert!(remote_caller_allowed(
            "main",
            &Url::parse("https://app.example.test/app/acme").unwrap(),
            selected,
            false,
        ));
        assert!(!remote_caller_allowed(
            "secondary",
            &Url::parse("https://app.example.test/app/acme").unwrap(),
            selected,
            false,
        ));
        assert!(!remote_caller_allowed(
            "main",
            &Url::parse("https://app.example.test.evil.example/app/acme").unwrap(),
            selected,
            false,
        ));
        assert!(!remote_caller_allowed(
            "main",
            &Url::parse("https://other-deployment.example/app/acme").unwrap(),
            selected,
            false,
        ));
        assert!(!remote_caller_allowed(
            "main",
            &Url::parse("http://attacker.example/app").unwrap(),
            "http://attacker.example",
            false,
        ));
    }

    #[test]
    fn remote_capability_exposes_only_the_two_notification_commands() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/remote-product.json")).unwrap();
        assert_eq!(
            capability["permissions"],
            json!([
                "allow-remote-notification-context",
                "allow-remote-submit-notifications"
            ])
        );
    }

    #[test]
    fn deployment_switch_clears_browsing_state_before_persisting_new_origin() {
        let mut preferences = Preferences {
            selected_origin: Some("https://first.example".into()),
            notification_cursor: Some("cursor-from-first".into()),
            seen_event_ids: VecDeque::from(["event-from-first".into()]),
            ..Preferences::default()
        };
        let clear_observed = std::cell::Cell::new(false);
        let changed = prepare_server_switch(&mut preferences, "https://second.example", || {
            clear_observed.set(true);
            Ok(())
        })
        .unwrap();
        assert!(changed);
        assert!(clear_observed.get());
        assert_eq!(
            preferences.selected_origin.as_deref(),
            Some("https://second.example")
        );
        assert!(preferences.notification_cursor.is_none());
        assert!(preferences.seen_event_ids.is_empty());

        let unchanged = prepare_server_switch(&mut preferences, "https://second.example", || {
            panic!("same-deployment navigation must not clear browsing data")
        })
        .unwrap();
        assert!(!unchanged);
    }

    #[tokio::test]
    async fn verifies_two_synthetic_deployments_without_redirects() {
        let first = MockServer::start_async().await;
        let second = MockServer::start_async().await;
        for server in [&first, &second] {
            let canonical = server.base_url();
            server
                .mock_async(move |when, then| {
                    when.method(GET).path("/api/v1/desktop/bootstrap");
                    then.status(200)
                        .header("content-type", "application/json")
                        .json_body(json!({
                            "product": "scopedelta",
                            "protocolVersion": 1,
                            "canonicalOrigin": canonical,
                        }));
                })
                .await;
        }
        assert_eq!(
            verify_server(&first.base_url()).await.unwrap(),
            first.base_url()
        );
        assert_eq!(
            verify_server(&second.base_url()).await.unwrap(),
            second.base_url()
        );
    }

    #[tokio::test]
    async fn bootstrap_redirect_and_forged_canonical_origin_fail_closed() {
        let redirecting = MockServer::start_async().await;
        redirecting
            .mock_async(|when, then| {
                when.method(GET).path("/api/v1/desktop/bootstrap");
                then.status(302).header("location", "https://evil.example/");
            })
            .await;
        assert!(verify_server(&redirecting.base_url()).await.is_err());

        let forged = MockServer::start_async().await;
        forged
            .mock_async(|when, then| {
                when.method(GET).path("/api/v1/desktop/bootstrap");
                then.status(200)
                    .header("content-type", "application/json")
                    .json_body(json!({
                        "product": "scopedelta",
                        "protocolVersion": 1,
                        "canonicalOrigin": "https://evil.example",
                    }));
            })
            .await;
        assert!(verify_server(&forged.base_url()).await.is_err());
    }

    #[tokio::test]
    async fn invalid_tls_and_unreachable_servers_fail_without_fallback() {
        let plaintext = MockServer::start_async().await;
        let invalid_tls = plaintext.base_url().replacen("http://", "https://", 1);
        assert!(verify_server(&invalid_tls).await.is_err());
        assert!(verify_server("http://127.0.0.1:1").await.is_err());
    }
}
