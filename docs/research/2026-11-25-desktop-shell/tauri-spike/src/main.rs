#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod project_publish;

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Instant,
};
use tauri::{
    Manager, State, WebviewUrl, WebviewWindowBuilder,
    ipc::{InvokeBody, Request},
    webview::DownloadEvent,
};

struct Run {
    started: Instant,
    root: PathBuf,
    transfer: Mutex<Option<StagedTransfer>>,
    downloads: AtomicUsize,
    project_publish: Mutex<Option<Result<serde_json::Value, String>>>,
}

struct StagedTransfer {
    file: File,
    staging: PathBuf,
    bytes: usize,
    start: Instant,
}

#[tauri::command]
fn report(run: State<'_, Run>, event: serde_json::Value) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(run.root.join("events.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(
        file,
        "{}",
        serde_json::json!({
            "nativeMs": run.started.elapsed().as_millis(),
            "event": event
        })
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn completed_downloads(run: State<'_, Run>) -> usize {
    run.downloads.load(Ordering::Relaxed)
}

#[tauri::command]
fn project_publish_result(run: State<'_, Run>) -> Result<Option<serde_json::Value>, String> {
    match &*run
        .project_publish
        .lock()
        .map_err(|error| error.to_string())?
    {
        Some(result) => result.clone().map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
async fn transfer(request: Request<'_>, run: State<'_, Run>) -> Result<serde_json::Value, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw IPC bytes".into());
    };
    if bytes.len() > 128 * 1024 * 1024 {
        return Err("probe payload limit exceeded".into());
    }
    let start = Instant::now();
    let staging = run.root.join("transfer.tmp");
    let output = run.root.join("transfer.bin");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(staging, &output).map_err(|e| e.to_string())?;
    let size = fs::metadata(&output).map_err(|e| e.to_string())?.len();
    fs::remove_file(output).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "bytes": size, "nativeWriteMs": start.elapsed().as_millis() }))
}

#[tauri::command]
fn begin_transfer(run: State<'_, Run>) -> Result<(), String> {
    let mut transfer = run.transfer.lock().map_err(|e| e.to_string())?;
    if transfer.is_some() {
        return Err("another transfer is already open".into());
    }
    let staging = run.root.join("chunks.tmp");
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(|e| e.to_string())?;
    *transfer = Some(StagedTransfer {
        file,
        staging,
        bytes: 0,
        start: Instant::now(),
    });
    Ok(())
}

#[tauri::command]
async fn append_chunk(request: Request<'_>, run: State<'_, Run>) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw IPC bytes".into());
    };
    let mut guard = run.transfer.lock().map_err(|e| e.to_string())?;
    let transfer = guard.as_mut().ok_or("no transfer is open")?;
    if bytes.len() > 1024 * 1024 || transfer.bytes + bytes.len() > 128 * 1024 * 1024 {
        return Err("probe transfer limit exceeded".into());
    }
    transfer.file.write_all(bytes).map_err(|e| e.to_string())?;
    transfer.bytes += bytes.len();
    Ok(())
}

#[tauri::command]
async fn finish_transfer(
    run: State<'_, Run>,
    expected: usize,
) -> Result<serde_json::Value, String> {
    let mut guard = run.transfer.lock().map_err(|e| e.to_string())?;
    let transfer = guard.take().ok_or("no transfer is open")?;
    let StagedTransfer {
        file,
        staging,
        bytes,
        start,
    } = transfer;
    let result = file.sync_all();
    drop(file);
    let publish = || {
        result.map_err(|e| e.to_string())?;
        if bytes != expected {
            return Err("transfer ended before all bytes arrived".into());
        }
        let output = run.root.join("chunks.bin");
        fs::hard_link(&staging, &output).map_err(|e| e.to_string())?;
        let size = fs::metadata(&output).map_err(|e| e.to_string())?.len();
        fs::remove_file(output).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "bytes": size, "nativeElapsedMs": start.elapsed().as_millis() }))
    };
    let result = publish();
    fs::remove_file(staging).map_err(|e| e.to_string())?;
    result
}

fn main() {
    let started = Instant::now();
    let root = std::env::var_os("PIXELDOLL_SPIKE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::temp_dir().join(format!("pixeldoll-spike-{}", std::process::id()))
        });
    fs::create_dir_all(&root).expect("create spike data directory");
    tauri::Builder::default()
        .manage(Run {
            started,
            root,
            transfer: Mutex::default(),
            downloads: AtomicUsize::new(0),
            project_publish: Mutex::default(),
        })
        .invoke_handler(tauri::generate_handler![
            report,
            transfer,
            begin_transfer,
            append_chunk,
            finish_transfer,
            completed_downloads,
            project_publish_result
        ])
        .setup(|app| {
            let run = app.state::<Run>();
            let profile = std::env::var_os("PIXELDOLL_SPIKE_PROFILE")
                .map(PathBuf::from)
                .unwrap_or_else(|| run.root.join("profile"));
            let mode = match std::env::var("PIXELDOLL_SPIKE_CASE").as_deref() {
                Ok("transfer") => "transfer",
                Ok("online") => "online",
                Ok("chunked") => "chunked",
                Ok("download") => "download",
                Ok("backup") => "backup",
                Ok("publish") => "publish",
                _ => "startup",
            };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("PixelDoll Tauri Spike")
                .inner_size(1280., 850.)
                .initialization_script(format!("window.__PIXELDOLL_SPIKE_CASE__ = '{mode}';"))
                .data_directory(profile)
                .on_download(move |window, event| {
                    if !matches!(mode, "download" | "backup" | "publish") {
                        return false;
                    }
                    let run = window.state::<Run>();
                    match event {
                        DownloadEvent::Requested { url, destination } => {
                            if !url.as_str().starts_with("blob:http://tauri.localhost/") {
                                return false;
                            }
                            let index = run.downloads.load(Ordering::Relaxed);
                            *destination = run.root.join(format!("studio-download-{index}.zip"));
                        }
                        DownloadEvent::Finished { success: true, .. } => {
                            run.downloads.fetch_add(1, Ordering::Relaxed);
                            if mode == "publish" {
                                std::thread::spawn(move || {
                                    let run = window.state::<Run>();
                                    let archive = run.root.join("studio-download-0.zip");
                                    let result = project_publish::run(&run.root, &archive);
                                    *run.project_publish.lock().expect("publish result") =
                                        Some(result);
                                });
                            }
                        }
                        _ => {}
                    }
                    true
                })
                .on_navigation(|url| {
                    url.scheme() == "http"
                        && url.host_str() == Some("tauri.localhost")
                        && url.port().is_none()
                        && matches!(url.path(), "/" | "/index.html")
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("run Tauri spike");
}
