use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{self, Read},
    path::Path,
};

const MAX_BYTES: u64 = 128 * 1024 * 1024;
type Files = BTreeMap<String, Vec<u8>>;
type Hashes = BTreeMap<String, String>;

fn read_export(path: &Path) -> Result<Files, Box<dyn std::error::Error>> {
    let mut archive = zip::ZipArchive::new(File::open(path)?)?;
    if archive.len() > 5000 {
        return Err("too many export files".into());
    }
    let mut files = Files::new();
    let mut names = BTreeSet::new();
    let mut remaining = MAX_BYTES;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        if !entry.is_file()
            || entry.is_symlink()
            || !names.insert(name.to_ascii_lowercase())
            || !name.split('/').all(safe_component)
        {
            return Err(format!("unsupported export path: {name}").into());
        }
        if entry.size() > remaining {
            return Err("export expands beyond the byte limit".into());
        }
        let mut bytes = Vec::new();
        (&mut entry).take(remaining + 1).read_to_end(&mut bytes)?;
        remaining = remaining
            .checked_sub(bytes.len() as u64)
            .ok_or("export byte limit exceeded")?;
        files.insert(name, bytes);
    }
    if !files.contains_key("godot/Paperdoll.tscn") || !files.contains_key("manifest.json") {
        return Err("expected a Godot export".into());
    }
    Ok(files)
}

fn safe_component(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    !name.is_empty()
        && !name.starts_with('.')
        && !name.ends_with(['.', ' '])
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b" _-.~".contains(&b))
        && !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn publish(root: &Path, files: &Files) -> Result<usize, Box<dyn std::error::Error>> {
    let target = root.join("game/assets/pixeldoll/adventurer");
    let index = root.join("managed-export.json");
    let previous: Hashes = match fs::read(&index) {
        Ok(bytes) => serde_json::from_slice(&bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Hashes::new(),
        Err(error) => return Err(error.into()),
    };
    if previous.keys().any(|name| !files.contains_key(name)) {
        return Err("export removed managed paths; review required".into());
    }
    let mut current = Hashes::new();
    let mut changes = Vec::new();
    for (name, bytes) in files {
        let expected = hash(bytes);
        let path = target.join(name);
        match fs::read(&path) {
            Ok(on_disk) => {
                let actual = hash(&on_disk);
                if previous.get(name) != Some(&actual) {
                    return Err(format!("project file changed outside PixelDoll: {name}").into());
                }
                if actual != expected {
                    changes.push((name, bytes));
                }
            }
            Err(error)
                if error.kind() == io::ErrorKind::NotFound && !previous.contains_key(name) =>
            {
                changes.push((name, bytes));
            }
            Err(error) => return Err(format!("could not read {name}: {error}").into()),
        }
        current.insert(name.clone(), expected);
    }
    if changes.is_empty() {
        return Ok(0);
    }

    // Fixed scratch destination, same-volume staging. Per-file replacement is atomic;
    // this experiment has no crash journal or protection against simultaneous external writes.
    let staging = root.join("export-stage");
    fs::create_dir(&staging)?;
    for (name, bytes) in &changes {
        let path = staging.join("files").join(name);
        fs::create_dir_all(path.parent().ok_or("missing staging parent")?)?;
        fs::write(path, bytes)?;
    }
    let index_stage = staging.join("ownership.json");
    fs::write(&index_stage, serde_json::to_vec(&current)?)?;
    for (name, _) in &changes {
        let path = target.join(name);
        fs::create_dir_all(path.parent().ok_or("missing target parent")?)?;
        fs::rename(staging.join("files").join(name), path)?;
    }
    fs::rename(index_stage, index)?;
    let resolved = staging.canonicalize()?;
    if resolved != root.canonicalize()?.join("export-stage") {
        return Err("staging directory moved outside the scratch root".into());
    }
    fs::remove_dir_all(resolved)?;
    Ok(changes.len())
}

pub fn run(root: &Path, archive: &Path) -> Result<Value, String> {
    run_scenario(root, archive).map_err(|error| error.to_string())
}

fn run_scenario(root: &Path, archive: &Path) -> Result<Value, Box<dyn std::error::Error>> {
    let mut files = read_export(archive)?;
    let first = publish(root, &files)?;
    let project = root.join("game");
    let target = project.join("assets/pixeldoll/adventurer");
    fs::write(
        project.join("project.godot"),
        "config_version=5\n[application]\nconfig/name=\"PixelDoll workflow probe\"\n",
    )?;
    let outside = project.join("gameplay.txt");
    let sidecar = target.join("godot/Paperdoll.tscn.user-note");
    fs::write(&outside, "game-owned")?;
    fs::write(&sidecar, "import-sidecar substitute")?;
    let no_change = publish(root, &files)?;
    let manifest_path = target.join("manifest.json");
    let mut manifest: Value = serde_json::from_slice(&files["manifest.json"])?;
    manifest["export"]["exportedAt"] = json!("2026-11-25T00:00:00.000Z");
    files.insert("manifest.json".to_string(), serde_json::to_vec(&manifest)?);
    let updated = publish(root, &files)?;
    let changed = target.join("godot/Paperdoll.tscn");
    let scene = fs::read(&changed)?;
    fs::write(&changed, b"user-owned edit")?;
    let before = fs::read(&manifest_path)?;
    let guide_path = target.join("AGENTS.md");
    let guide = fs::read(&guide_path)?;
    files.insert(
        "AGENTS.md".to_string(),
        b"synthetic pending update".to_vec(),
    );
    let refused = publish(root, &files).is_err_and(|error| {
        error.to_string() == "project file changed outside PixelDoll: godot/Paperdoll.tscn"
    });
    let preserved = fs::read(&changed)? == b"user-owned edit"
        && fs::read(&manifest_path)? == before
        && fs::read(guide_path)? == guide
        && fs::read(&outside)? == b"game-owned"
        && fs::read(&sidecar)? == b"import-sidecar substitute";
    fs::write(changed, scene)?;
    if first != files.len() || no_change != 0 || updated != 1 || !refused || !preserved {
        return Err(
            "project publication scenario did not preserve the owned and unrelated files".into(),
        );
    }
    Ok(
        json!({ "created": first, "identicalWritten": no_change, "updated": updated, "conflictRefused": refused }),
    )
}
