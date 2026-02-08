use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;

// ============ CONFIG ============

#[derive(Debug, Deserialize)]
struct Config {
    default: Option<String>,
    projects: HashMap<String, ProjectConfig>,
}

#[derive(Debug, Deserialize, Clone)]
struct ProjectConfig {
    name: String,
    root: String,
}

/// Built-in inline default config. Returned in-memory only when no file exists.
const INLINE_DEFAULT_TOML: &str = r#"# Copilot Code Saver - Project Configuration
# default = "my-project"
[projects.example]
name = "Example Project"
root = "/home/user/projects/example"
"#;

fn config_path() -> PathBuf {
    let candidates = [
        // Snap-specific location (check first)
        dirs::home_dir().map(|h| h.join("snap/chromium/common/copilot-code-saver/projects.toml")),
        // Home directory
        dirs::home_dir().map(|h| h.join("copilot-code-saver").join("projects.toml")),
        // Standard config location
        dirs::config_dir().map(|c| c.join("copilot-code-saver").join("projects.toml")),
    ];
    
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return candidate;
        }
    }
    
    // Default to snap location for creation
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("snap/chromium/common/copilot-code-saver")
        .join("projects.toml")
}

fn load_config() -> Result<Config> {
    let path = config_path();

    if !path.exists() {
        // No file on disk: parse and return inline defaults (do NOT write).
        let config: Config = toml::from_str(INLINE_DEFAULT_TOML)
            .with_context(|| "Failed to parse inline default config")?;
        return Ok(config);
    }

    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config: {:?}", path))?;
    let config: Config = toml::from_str(&content)
        .with_context(|| "Failed to parse config")?;
    Ok(config)
}

// ============ NATIVE MESSAGING PROTOCOL ============

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum Request {
    ListProjects,
    Save {
        project: String,
        path: String,
        content: String,
    },
    GetConfig,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Response {
    Projects {
        success: bool,
        projects: Vec<ProjectInfo>,
        default: Option<String>,
    },
    SaveResult {
        success: bool,
        full_path: Option<String>,
        error: Option<String>,
    },
    Config {
        success: bool,
        config_path: String,
    },
    Error {
        success: bool,
        error: String,
    },
}

#[derive(Debug, Serialize)]
struct ProjectInfo {
    id: String,
    name: String,
    root: String,
}

// ============ MESSAGE I/O ============

fn read_message() -> Result<Request> {
    let mut len_bytes = [0u8; 4];
    io::stdin().read_exact(&mut len_bytes)?;
    let len = u32::from_ne_bytes(len_bytes) as usize;
    
    let mut buffer = vec![0u8; len];
    io::stdin().read_exact(&mut buffer)?;
    
    let request: Request = serde_json::from_slice(&buffer)?;
    Ok(request)
}

fn write_message(response: &Response) -> Result<()> {
    let json = serde_json::to_vec(response)?;
    let len = json.len() as u32;
    
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    
    handle.write_all(&len.to_ne_bytes())?;
    handle.write_all(&json)?;
    handle.flush()?;
    
    Ok(())
}

// ============ HANDLERS ============

fn handle_list_projects(config: &Config) -> Response {
    let projects: Vec<ProjectInfo> = config
        .projects
        .iter()
        .map(|(id, proj)| ProjectInfo {
            id: id.clone(),
            name: proj.name.clone(),
            root: proj.root.clone(),
        })
        .collect();
    
    Response::Projects {
        success: true,
        projects,
        default: config.default.clone(),
    }
}

fn handle_save(config: &Config, project_id: &str, rel_path: &str, content: &str) -> Response {
    // Find project
    let project = match config.projects.get(project_id) {
        Some(p) => p,
        None => {
            return Response::SaveResult {
                success: false,
                full_path: None,
                error: Some(format!("Project '{}' not found", project_id)),
            }
        }
    };
    
    // Build full path
    let root = PathBuf::from(&project.root);
    
    // Sanitize relative path (prevent directory traversal)
    let rel_path = rel_path.trim_start_matches('/').trim_start_matches("../");
    let full_path = root.join(rel_path);
    
    // Ensure path is still within project root
    match full_path.canonicalize() {
        Ok(canonical) => {
            if !canonical.starts_with(&root) {
                return Response::SaveResult {
                    success: false,
                    full_path: None,
                    error: Some("Path escapes project root".to_string()),
                };
            }
        }
        Err(_) => {
            // File doesn't exist yet, check parent
            if let Some(parent) = full_path.parent() {
                if parent.exists() {
                    if let Ok(canonical_parent) = parent.canonicalize() {
                        if !canonical_parent.starts_with(&root) {
                            return Response::SaveResult {
                                success: false,
                                full_path: None,
                                error: Some("Path escapes project root".to_string()),
                            };
                        }
                    }
                }
            }
        }
    }
    
    // Create parent directories if needed
    if let Some(parent) = full_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            return Response::SaveResult {
                success: false,
                full_path: None,
                error: Some(format!("ttttFFFFFFFailed to create directories: {}", e)),
            };
        }
    }
    
    // Write file
    match fs::write(&full_path, content) {
        Ok(_) => Response::SaveResult {
            success: true,
            full_path: Some(full_path.to_string_lossy().to_string()),
            error: None,
        },
        Err(e) => Response::SaveResult {
            success: false,
            full_path: None,
            error: Some(format!("Failed to write file: {}", e)),
        },
    }
}

fn handle_get_config() -> Response {
    Response::Config {
        success: true,
        config_path: config_path().to_string_lossy().to_string(),
    }
}

// ============ MAIN ============

fn main() {
    let config = match load_config() {
        Ok(c) => c,
        Err(e) => {
            let _ = write_message(&Response::Error {
                success: false,
                error: format!("Config error: {}", e),
            });
            return;
        }
    };
    
    loop {
        let request = match read_message() {
            Ok(r) => r,
            Err(_) => break, // EOF or error, exit cleanly
        };
        
        let response = match request {
            Request::ListProjects => handle_list_projects(&config),
            Request::Save { project, path, content } => {
                handle_save(&config, &project, &path, &content)
            }
            Request::GetConfig => handle_get_config(),
        };
        
        if write_message(&response).is_err() {
            break;
        }
    }
}
