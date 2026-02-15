// native-host/src/main.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use wait_timeout::ChildExt;

// ============ PROTOCOL ============

#[derive(Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
enum Request {
    /// Write content to an absolute path
    Save { path: String, content: String },
    /// Execute a shell command in a working directory with optional timeout
    Execute {
        command: String,
        working_dir: String,
        #[serde(default = "default_timeout")]
        timeout_secs: u64,
    },
    /// Connection test
    Ping,
}

fn default_timeout() -> u64 {
    30 // 30 seconds default
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Response {
    SaveResult {
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        full_path: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ExecuteResult {
        success: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        stdout: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        stderr: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    Pong {
        success: bool,
    },
    Error {
        success: bool,
        error: String,
    },
}

// ============ MESSAGE I/O ============

fn read_message() -> io::Result<Request> {
    let mut len_bytes = [0u8; 4];
    io::stdin().read_exact(&mut len_bytes)?;
    let len = u32::from_ne_bytes(len_bytes) as usize;

    let mut buffer = vec![0u8; len];
    io::stdin().read_exact(&mut buffer)?;

    serde_json::from_slice(&buffer)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

fn write_message(response: &Response) -> io::Result<()> {
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

fn handle_save(abs_path: &str, content: &str) -> Response {
    let path = PathBuf::from(abs_path);

    // Basic validation: path must be absolute
    if !path.is_absolute() {
        return Response::SaveResult {
            success: false,
            full_path: None,
            error: Some("Path must be absolute".to_string()),
        };
    }

    // Create parent directories if needed
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return Response::SaveResult {
                    success: false,
                    full_path: None,
                    error: Some(format!("Failed to create directories: {}", e)),
                };
            }
        }
    }

    // Write file
    match fs::write(&path, content) {
        Ok(_) => Response::SaveResult {
            success: true,
            full_path: Some(path.to_string_lossy().to_string()),
            error: None,
        },
        Err(e) => Response::SaveResult {
            success: false,
            full_path: None,
            error: Some(format!("Failed to write file: {}", e)),
        },
    }
}

fn handle_execute(command: &str, working_dir: &str, timeout_secs: u64) -> Response {
    let work_dir = PathBuf::from(working_dir);

    // Validation: working_dir must be absolute
    if !work_dir.is_absolute() {
        return Response::ExecuteResult {
            success: false,
            stdout: None,
            stderr: None,
            exit_code: None,
            error: Some("Working directory must be absolute".to_string()),
        };
    }

    // Validation: working_dir must exist
    if !work_dir.exists() {
        return Response::ExecuteResult {
            success: false,
            stdout: None,
            stderr: None,
            exit_code: None,
            error: Some(format!("Working directory does not exist: {}", working_dir)),
        };
    }

    // Spawn command via shell
    let mut child = match Command::new("/bin/sh")
        .arg("-c")
        .arg(command)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            return Response::ExecuteResult {
                success: false,
                stdout: None,
                stderr: None,
                exit_code: None,
                error: Some(format!("Failed to spawn command: {}", e)),
            }
        }
    };

    // Wait with timeout
    let timeout_duration = Duration::from_secs(timeout_secs);
    match child.wait_timeout(timeout_duration) {
        Ok(Some(status)) => {
            // Command completed within timeout
            let output = child.wait_with_output().unwrap_or_else(|e| {
                eprintln!("Warning: failed to capture output after wait: {}", e);
                std::process::Output {
                    status,
                    stdout: Vec::new(),
                    stderr: Vec::new(),
                }
            });

            let stdout_str = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr_str = String::from_utf8_lossy(&output.stderr).to_string();

            Response::ExecuteResult {
                success: status.success(),
                stdout: if stdout_str.is_empty() {
                    None
                } else {
                    Some(stdout_str)
                },
                stderr: if stderr_str.is_empty() {
                    None
                } else {
                    Some(stderr_str)
                },
                exit_code: status.code(),
                error: None,
            }
        }
        Ok(None) => {
            // Timeout occurred - kill the process
            let _ = child.kill();
            let _ = child.wait(); // Clean up zombie

            Response::ExecuteResult {
                success: false,
                stdout: None,
                stderr: None,
                exit_code: None,
                error: Some(format!(
                    "Command timed out after {} seconds",
                    timeout_secs
                )),
            }
        }
        Err(e) => {
            // Wait failed
            let _ = child.kill();
            Response::ExecuteResult {
                success: false,
                stdout: None,
                stderr: None,
                exit_code: None,
                error: Some(format!("Failed to wait for command: {}", e)),
            }
        }
    }
}

fn handle_ping() -> Response {
    Response::Pong { success: true }
}

// ============ MAIN ============

fn main() {
    loop {
        let request = match read_message() {
            Ok(r) => r,
            Err(_) => break, // EOF or error, exit cleanly
        };

        let response = match request {
            Request::Save { path, content } => handle_save(&path, &content),
            Request::Execute {
                command,
                working_dir,
                timeout_secs,
            } => handle_execute(&command, &working_dir, timeout_secs),
            Request::Ping => handle_ping(),
        };

        if write_message(&response).is_err() {
            break;
        }
    }
}
