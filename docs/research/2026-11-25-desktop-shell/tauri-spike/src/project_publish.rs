use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, File},
    io::{self, Cursor, Read, Write},
    path::Path,
};

const MAX_BYTES: u64 = 128 * 1024 * 1024;
const WALK_SHEET: &str = "layers/body/base/main/walk.png";
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

fn stage_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = File::create_new(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

fn publish(root: &Path, files: &Files) -> Result<usize, Box<dyn std::error::Error>> {
    let target = root.join("game/assets/pixeldoll/adventurer");
    let index = root.join("managed-export.json");
    let previous: Hashes = match fs::read(&index) {
        Ok(bytes) => serde_json::from_slice(&bytes)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Hashes::new(),
        Err(error) => return Err(error.into()),
    };
    // Keep ownership history for omitted files without removing them from the game.
    let mut current = previous.clone();
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
    fs::create_dir(&staging)
        .map_err(|error| format!("could not start fresh export staging: {error}"))?;
    for (name, bytes) in &changes {
        let path = staging.join("files").join(name);
        fs::create_dir_all(path.parent().ok_or("missing staging parent")?)?;
        stage_file(&path, bytes)?;
    }
    let index_stage = staging.join("ownership.json");
    stage_file(&index_stage, &serde_json::to_vec(&current)?)?;
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

fn revised_walk_sheet(source: &[u8]) -> Result<(Vec<u8>, [usize; 3]), Box<dyn std::error::Error>> {
    let mut decoder = png::Decoder::new(Cursor::new(source));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info()?;
    let mut pixels = vec![
        0;
        reader
            .output_buffer_size()
            .ok_or("invalid walk sheet size")?
    ];
    let info = reader.next_frame(&mut pixels)?;
    if info.color_type != png::ColorType::Rgba {
        return Err("expected an RGBA walk sheet".into());
    }
    let pixels = &mut pixels[..info.buffer_size()];
    let (index, pixel) = pixels
        .chunks_exact_mut(4)
        .enumerate()
        .find(|(_, pixel)| pixel[3] == 255)
        .ok_or("walk sheet has no opaque pixel")?;
    pixel[0] ^= 255;
    let width = info.width as usize;
    let sample = [index % width, index / width, pixel[0] as usize];
    let mut output = Vec::new();
    let mut encoder = png::Encoder::new(&mut output, info.width, info.height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.write_header()?.write_image_data(pixels)?;
    Ok((output, sample))
}

fn run_scenario(root: &Path, archive: &Path) -> Result<Value, Box<dyn std::error::Error>> {
    let mut files = read_export(archive)?;
    let project = root.join("game");
    fs::create_dir(&project)
        .map_err(|error| format!("expected a fresh scratch game project: {error}"))?;
    let first = publish(root, &files)?;
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
    let (art, sample) = revised_walk_sheet(files.get(WALK_SHEET).ok_or("missing walk sheet")?)?;
    files.insert(WALK_SHEET.to_string(), art);
    let omitted = files.remove("README.txt").ok_or("missing export README")?;
    let updated = publish(root, &files)?;
    let repeat_revision = publish(root, &files)?;
    let omitted_preserved = fs::read(target.join("README.txt"))? == omitted;
    let art_written = fs::read(target.join(WALK_SHEET))? == files[WALK_SHEET];
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
    if first != files.len() + 1
        || no_change != 0
        || updated != 2
        || repeat_revision != 0
        || !omitted_preserved
        || !art_written
        || !refused
        || !preserved
    {
        return Err(
            "project publication scenario did not preserve the owned and unrelated files".into(),
        );
    }
    Ok(
        json!({ "created": first, "identicalWritten": no_change, "updated": updated,
            "repeatRevisionWritten": repeat_revision, "omittedPreserved": omitted_preserved,
            "conflictRefused": refused, "artPixel": sample }),
    )
}
