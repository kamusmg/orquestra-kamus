use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
pub const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
pub const DETACHED_PROCESS: u32 = 0x00000008;

#[cfg(not(windows))]
pub const CREATE_NO_WINDOW: u32 = 0;
#[cfg(not(windows))]
pub const DETACHED_PROCESS: u32 = 0;

/// Retorna um Command configurado para nunca exibir janela no Windows
pub fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Parser, Debug)]
#[command(
    name = "orq-pc",
    version = "0.2.0",
    about = "CLI nativa ultraleve em Rust para controle local do Orquestra no PC (Kamus Edition)",
    author = "Kamus Edition"
)]
pub struct Cli {
    /// Caminho do Named Pipe de controle (ou via env ORQ_CTRL_PIPE)
    #[arg(short, long)]
    pub pipe: Option<String>,

    /// Workspace alvo (opcional; o host usa o workspace ativo se omitido)
    #[arg(short, long)]
    pub workspace: Option<String>,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(ValueEnum, Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentKind {
    Claude,
    Agy,
    Codex,
    Shell,
}

impl std::fmt::Display for AgentKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AgentKind::Claude => write!(f, "claude"),
            AgentKind::Agy => write!(f, "agy"),
            AgentKind::Codex => write!(f, "codex"),
            AgentKind::Shell => write!(f, "shell"),
        }
    }
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Exibe o status do Orquestra, workspaces, terminais e uso real de RAM no Windows
    Status,

    /// Executa Hot-Swap do agente de um terminal sem perder conexões ou estado (claude|agy|codex|shell)
    Switch {
        /// Nome do terminal
        terminal: String,
        /// Novo agente
        agent: AgentKind,
    },

    /// Descarrega todos os terminais ociosos (idle) para liberar memória RAM
    UnloadIdle,

    /// Descarrega/hiberna um terminal específico preservando suas conexões
    Unload {
        /// Nome do terminal
        terminal: String,
    },

    /// Envia aprovação rápida (y/n) para terminal aguardando confirmação
    Approve {
        /// Nome do terminal
        terminal: String,
        /// Decisão: y, s, yes (padrão 'y') ou n, no
        #[arg(default_value = "y")]
        decision: String,
    },

    /// Envia uma instrução direta ao terminal seguida de Enter (\r)
    Prompt {
        /// Nome do terminal
        terminal: String,
        /// Texto da instrução
        text: String,
    },

    /// Lê a saída recente do terminal limpa de códigos ANSI
    Read {
        /// Nome do terminal
        terminal: String,
        /// Quantidade de linhas para exibir (padrão: 40)
        #[arg(short, long, default_value_t = 40)]
        lines: usize,
    },

    /// Lista os modelos disponíveis ao vivo (agy / claude) e recomendações auto-flash / auto-lead
    Models {
        /// Força atualização consultando `agy models` novamente
        #[arg(long)]
        refresh: bool,
    },

    /// Cria um novo terminal no canvas já com agente, modelo e função embutida
    New {
        /// Nome do novo terminal
        name: String,
        /// Tipo de agente (agy, claude, codex, shell)
        #[arg(long, default_value = "agy")]
        agent: String,
        /// Modelo (ex: gemini-3.8-flash-high, gemini-4-argon-high, auto-flash, auto-lead, opus)
        #[arg(long)]
        model: Option<String>,
        /// Função embutida (persona) para atribuir ao terminal
        #[arg(long)]
        persona: Option<String>,
        /// Pasta de trabalho (opcional)
        #[arg(long)]
        cwd: Option<String>,
        /// Define o terminal como Regente
        #[arg(long)]
        regente: bool,
        /// Nome do terminal ou nota ao qual conectar automaticamente
        #[arg(long)]
        connect_to: Option<String>,
        /// Workspace alvo (opcional)
        #[arg(short, long)]
        workspace: Option<String>,
    },

    /// Encerra apenas a interface gráfica Electron (Orquestra.exe) liberando ~390 MB de RAM
    Headless,

    /// Inicia a interface gráfica Electron (Orquestra.exe) reconectando ao Host
    Gui,

    /// Envia shutdown para o Host encerrando todos os processos com segurança
    Stop,

    /// Reinicia o Orquestra silenciosamente (zero janelas CMD/foco roubado) e retoma a conversa automaticamente
    Restart {
        /// Terminal que deve receber o prompt automático de continuação após o restart (ex: argon-tech-lead)
        #[arg(long)]
        resume_terminal: Option<String>,
        /// Mensagem enviada automaticamente ao terminal para retomar a conversa
        #[arg(
            long,
            default_value = "Auto-restart concluído com sucesso! Continue exatamente de onde parou."
        )]
        resume_prompt: String,
        /// Flag interna para o processo worker desacoplado
        #[arg(long, hide = true)]
        worker: bool,
    },
}

/// Retorna o caminho padrão do Named Pipe no Windows
pub fn get_default_pipe_path() -> String {
    let username = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "user".to_string());
    format!(r"\\.\pipe\orquestra-ctrl-{}", username)
}

/// Remove sequências de escape ANSI (CSI, OSC e comandos de terminal)
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    // CSI sequence: \x1b[ ... [cmd]
                    chars.next(); // consome '['
                    for next_ch in chars.by_ref() {
                        // Comandos CSI terminam entre 0x40 e 0x7E (@ até ~)
                        if (0x40..=0x7E).contains(&(next_ch as u32)) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    // OSC sequence: \x1b] ... (\x07 ou \x1b\)
                    chars.next(); // consome ']'
                    while let Some(next_ch) = chars.next() {
                        if next_ch == '\x07' {
                            break;
                        }
                        if next_ch == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next(); // consome '\\'
                            break;
                        }
                    }
                }
                Some('(') | Some(')') => {
                    chars.next();
                    chars.next();
                }
                _ => {
                    chars.next();
                }
            }
        } else {
            out.push(ch);
        }
    }

    out
}

/// Converte formato de memória de linha CSV ou string de memória ("145.230 K" ou "145,230 K") em KB
pub fn parse_tasklist_csv_kb(raw: &str) -> Option<u64> {
    let target = if raw.contains("\",\"") {
        let fields: Vec<&str> = raw.split("\",\"").collect();
        if fields.len() >= 5 {
            fields[4].trim_matches('"').trim()
        } else {
            raw.trim_matches('"').trim()
        }
    } else {
        raw.trim_matches('"').trim()
    };

    let digits_only: String = target.chars().filter(|c| c.is_ascii_digit()).collect();
    digits_only.parse::<u64>().ok()
}

/// Faz parsing de linha CSV do tasklist /FO CSV /NH ("Nome","PID","Sessão","Número","Memória")
pub fn parse_tasklist_csv_line(line: &str) -> Option<(String, u32, u64)> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let fields: Vec<String> = trimmed
        .split("\",\"")
        .map(|s| s.trim_matches('"').trim().to_string())
        .collect();

    if fields.len() >= 5 {
        let name = fields[0].clone();
        let pid = fields[1].parse::<u32>().ok()?;
        let kb = parse_tasklist_csv_kb(&fields[4])?;
        Some((name, pid, kb))
    } else {
        None
    }
}

/// Mede a memória RAM (em KB) do Host e da UI Electron via tasklist /FO CSV /NH com CREATE_NO_WINDOW
pub fn get_process_memory_info(host_pid: Option<u32>) -> (u64, u64) {
    let mut host_kb = 0u64;
    let mut electron_kb = 0u64;

    let output = match create_hidden_command("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
    {
        Ok(out) => out,
        Err(_) => return (0, 0),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if let Some((name, pid, kb)) = parse_tasklist_csv_line(line) {
            let lower = name.to_lowercase();
            if lower == "orquestra.exe" {
                electron_kb += kb;
            }
            if let Some(hpid) = host_pid {
                if pid == hpid {
                    host_kb += kb;
                }
            }
        }
    }

    (host_kb, electron_kb)
}

// ==========================================
// Construtores de Payloads JSON
// ==========================================

pub fn build_switch_payload(terminal: &str, agent: &str, workspace: Option<&str>) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "update-terminal",
        "name": terminal,
        "changes": {
            "agent": agent
        }
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_unload_idle_payload(workspace: Option<&str>) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "unload-idle-terminals"
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_unload_payload(terminal: &str, workspace: Option<&str>) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "unload-terminal",
        "name": terminal
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_approve_payload(terminal: &str, decision: &str, workspace: Option<&str>) -> serde_json::Value {
    let normalized = decision.trim().to_lowercase();
    let input = if normalized == "n" || normalized == "no" || normalized == "nao" || normalized == "não" {
        "n\r"
    } else {
        "y\r"
    };
    let mut val = json!({
        "id": 1,
        "type": "send-input",
        "name": terminal,
        "data": input
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_prompt_payload(terminal: &str, text: &str, workspace: Option<&str>) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "send-input",
        "name": terminal,
        "data": format!("{}\r", text)
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_read_payload(terminal: &str, workspace: Option<&str>) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "read-output",
        "name": terminal
    });
    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }
    val
}

pub fn build_shutdown_payload() -> serde_json::Value {
    json!({
        "id": 1,
        "type": "shutdown"
    })
}

pub fn build_ping_payload() -> serde_json::Value {
    json!({
        "id": 1,
        "type": "ping-control"
    })
}

pub fn build_list_payload() -> serde_json::Value {
    json!({
        "id": 1,
        "type": "list"
    })
}

pub fn build_list_models_payload(refresh: bool) -> serde_json::Value {
    json!({
        "id": 1,
        "type": "list-models",
        "refresh": refresh
    })
}

pub fn build_create_terminal_payload(
    name: &str,
    agent: &str,
    model: Option<&str>,
    persona: Option<&str>,
    cwd: Option<&str>,
    regente: bool,
    connect_to: Option<&str>,
    workspace: Option<&str>,
) -> serde_json::Value {
    let mut val = json!({
        "id": 1,
        "type": "create-terminal",
        "name": name,
        "agent": agent,
        "regente": regente,
    });

    if let Some(m) = model {
        if agent == "agy" || agent == "claude" {
            val["args"] = json!(["--model", m, "--dangerously-skip-permissions"]);
        } else {
            val["args"] = json!(["--model", m]);
        }
    }

    if let Some(p) = persona {
        val["persona"] = json!(p);
    }

    if let Some(c) = cwd {
        val["cwd"] = json!(c);
    }

    if let Some(conn) = connect_to {
        val["connectTo"] = json!(conn);
    }

    if let Some(ws) = workspace {
        val["workspace"] = json!(ws);
    }

    val
}

/// Extrai a resposta que corresponde ao id esperado, ignorando linhas de eventos assíncronos
pub fn extract_command_reply(
    line: &str,
    expected_id: u64,
) -> Result<Option<serde_json::Value>, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let val: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };

    if let Some(id_val) = val.get("id").and_then(|v| v.as_u64()) {
        if id_val == expected_id {
            if let Some(false) = val.get("ok").and_then(|v| v.as_bool()) {
                let code = val
                    .get("error")
                    .and_then(|e| e.get("code"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("ERROR");
                let msg = val
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .or_else(|| val.get("error").and_then(|e| e.as_str()))
                    .unwrap_or("Erro desconhecido do host");
                return Err(format!("[{code}] {msg}"));
            }
            return Ok(Some(val));
        }
    }
    Ok(None)
}

/// Conecta ao Named Pipe, envia o comando em formato JSON com newline, dá flush e lê a resposta filtrada
pub fn send_host_command(
    pipe_path: &str,
    payload: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .open(pipe_path)
        .map_err(|e| {
            format!(
                "Não foi possível conectar ao Named Pipe do Orquestra ({pipe_path}). O Host está ativo? Erro: {e}"
            )
        })?;

    let expected_id = payload.get("id").and_then(|v| v.as_u64()).unwrap_or(1);
    let mut json_str = serde_json::to_string(payload)
        .map_err(|e| format!("Erro ao serializar payload JSON: {e}"))?;
    json_str.push('\n');

    file.write_all(json_str.as_bytes())
        .map_err(|e| format!("Erro ao enviar comando pelo pipe: {e}"))?;
    file.flush()
        .map_err(|e| format!("Erro no flush do pipe: {e}"))?;

    let reader = BufReader::new(file);
    for line in reader.lines() {
        let line = line.map_err(|e| format!("Erro ao ler resposta do pipe: {e}"))?;
        if let Some(reply) = extract_command_reply(&line, expected_id)? {
            return Ok(reply);
        }
    }

    Err("O Host fechou a conexão antes de responder ao comando.".to_string())
}

/// Encerra processos da interface gráfica Electron (Orquestra.exe)
pub fn kill_electron_gui() -> Result<u64, String> {
    let (_, electron_kb) = get_process_memory_info(None);
    if electron_kb == 0 {
        return Err("A interface gráfica (Orquestra.exe) não está em execução no momento.".to_string());
    }

    let status = create_hidden_command("taskkill")
        .args(["/IM", "Orquestra.exe", "/F"])
        .status()
        .map_err(|e| format!("Falha ao executar taskkill: {e}"))?;

    if status.success() {
        Ok(electron_kb / 1024)
    } else {
        Err("taskkill retornou código de erro ao tentar fechar Orquestra.exe".to_string())
    }
}

/// Inicia a interface gráfica Electron (Orquestra.exe)
pub fn launch_gui_with_opts(no_focus: bool) -> Result<(), String> {
    let default_path = r"D:\projetos D\orquestra\packages\app\release\win-unpacked\Orquestra.exe";
    let exe_path = std::env::var("ORQ_GUI_PATH").unwrap_or_else(|_| default_path.to_string());

    if !std::path::Path::new(&exe_path).exists() {
        return Err(format!(
            "Binário da interface gráfica não encontrado em '{exe_path}'. Certifique-se de que o app desktop foi compilado."
        ));
    }

    let mut cmd = Command::new(&exe_path);
    if no_focus {
        cmd.env("ORQ_NO_FOCUS", "1");
    }
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
        .map_err(|e| format!("Falha ao iniciar {exe_path}: {e}"))?;

    Ok(())
}

pub fn launch_gui() -> Result<(), String> {
    launch_gui_with_opts(false)
}

fn main() {
    let cli = Cli::parse();
    let pipe_path = cli
        .pipe
        .or_else(|| std::env::var("ORQ_CTRL_PIPE").ok())
        .unwrap_or_else(get_default_pipe_path);
    let ws = cli.workspace.as_deref();

    match cli.command {
        Commands::Status => {
            println!("🔍 Consultando status do Orquestra (Pipe: {})...", pipe_path);

            // 1. ping-control
            let ping_reply = match send_host_command(&pipe_path, &build_ping_payload()) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("❌ Host não está respondendo ao ping: {e}");
                    std::process::exit(1);
                }
            };

            let host_pid = ping_reply
                .get("result")
                .and_then(|r| r.get("pid"))
                .and_then(|p| p.as_u64())
                .map(|p| p as u32);

            let ping_rss_mb = ping_reply
                .get("result")
                .and_then(|r| r.get("rssBytes"))
                .and_then(|b| b.as_u64())
                .map(|b| b / (1024 * 1024));

            // 2. RAM measurement
            let (host_kb, electron_kb) = get_process_memory_info(host_pid);
            let host_mb = if host_kb > 0 {
                host_kb / 1024
            } else {
                ping_rss_mb.unwrap_or(0)
            };
            let electron_mb = electron_kb / 1024;

            // 3. list workspaces e terminais
            let list_reply = match send_host_command(&pipe_path, &build_list_payload()) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("⚠️ Não foi possível obter a lista de terminais: {e}");
                    json!({})
                }
            };

            println!("\n╔═══════════════════════════════════════════════════════════════╗");
            println!("║              ORQUESTRA (KAMUS EDITION) — PAINEL               ║");
            println!("╚═══════════════════════════════════════════════════════════════╝");
            println!("  Host PID:        {}", host_pid.map(|p| p.to_string()).unwrap_or_else(|| "N/A".into()));
            println!("  RAM Host:        ~{} MB", host_mb);
            if electron_mb > 0 {
                println!("  RAM UI Electron: ~{} MB (economizável com 'orq-pc headless')", electron_mb);
            } else {
                println!("  RAM UI Electron: 0 MB (Modo Headless ativo)");
            }
            println!("  RAM Total:       ~{} MB", host_mb + electron_mb);
            println!("─────────────────────────────────────────────────────────────────");

            // Workspaces e Terminais
            let empty_vec = vec![];
            let workspaces = list_reply
                .get("result")
                .and_then(|r| r.get("workspaces"))
                .and_then(|w| w.as_array())
                .or_else(|| list_reply.get("workspaces").and_then(|w| w.as_array()))
                .unwrap_or(&empty_vec);

            if workspaces.is_empty() {
                // Tenta terminais direto se list retornar terminais direto
                let terminals = list_reply
                    .get("result")
                    .and_then(|r| r.get("terminals"))
                    .and_then(|t| t.as_array())
                    .or_else(|| list_reply.get("terminals").and_then(|t| t.as_array()));

                if let Some(terms) = terminals {
                    println!("\nTerminais Ativos:");
                    println!("{:<16} {:<10} {:<12} {:<10}", "NOME", "AGENTE", "ESTADO", "DESCARREGADO");
                    println!("{:-<16} {:-<10} {:-<12} {:-<10}", "", "", "", "");
                    for t in terms {
                        let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("-");
                        let agent = t.get("agent").and_then(|v| v.as_str()).unwrap_or("-");
                        let state = t.get("state").and_then(|v| v.as_str()).unwrap_or("-");
                        let unloaded = t.get("unloaded").and_then(|v| v.as_bool()).unwrap_or(false);
                        let unloaded_str = if unloaded { "Sim (idle)" } else { "Não" };
                        println!("{:<16} {:<10} {:<12} {:<10}", name, agent, state, unloaded_str);
                    }
                } else {
                    println!("\nNenhum workspace ou terminal ativo encontrado no Host.");
                }
            } else {
                for (idx, ws_item) in workspaces.iter().enumerate() {
                    let name = ws_item.get("name").and_then(|v| v.as_str()).unwrap_or("Sem nome");
                    let status = ws_item.get("status").and_then(|v| v.as_str()).unwrap_or("open");
                    let dir = ws_item.get("dir").and_then(|v| v.as_str()).unwrap_or("-");
                    println!("\n📁 Workspace #{}: {} [{}] ({})", idx + 1, name, status, dir);

                    let ws_terms = ws_item.get("terminals").and_then(|t| t.as_array());
                    if let Some(terms) = ws_terms {
                        println!("  {:<16} {:<10} {:<12} {:<12}", "NOME", "AGENTE", "ESTADO", "DESCARREGADO");
                        println!("  {:-<16} {:-<10} {:-<12} {:-<12}", "", "", "", "");
                        for t in terms {
                            let tname = t.get("name").and_then(|v| v.as_str()).unwrap_or("-");
                            let tagent = t.get("agent").and_then(|v| v.as_str()).unwrap_or("-");
                            let tstate = t.get("state").and_then(|v| v.as_str()).unwrap_or("-");
                            let unloaded = t.get("unloaded").and_then(|v| v.as_bool()).unwrap_or(false);
                            let unloaded_str = if unloaded { "Sim (idle)" } else { "Não" };
                            println!("  {:<16} {:<10} {:<12} {:<12}", tname, tagent, tstate, unloaded_str);
                        }
                    }
                }
            }
            println!("─────────────────────────────────────────────────────────────────\n");
        }

        Commands::Switch { terminal, agent } => {
            let agent_str = agent.to_string();
            let payload = build_switch_payload(&terminal, &agent_str, ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!(
                        "✨ Hot-Swap concluído com sucesso: terminal '{}' agora opera com o agente '{}'.",
                        terminal, agent_str
                    );
                }
                Err(e) => {
                    eprintln!("❌ Falha ao executar Hot-Swap: {e}");
                    std::process::exit(1);
                }
            }
        }

        Commands::UnloadIdle => {
            let payload = build_unload_idle_payload(ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(reply) => {
                    let empty = vec![];
                    let unloaded = reply
                        .get("result")
                        .and_then(|r| r.get("unloaded"))
                        .and_then(|u| u.as_array())
                        .or_else(|| reply.get("unloaded").and_then(|u| u.as_array()))
                        .unwrap_or(&empty);

                    if unloaded.is_empty() {
                        println!("💤 Nenhum terminal ocioso (idle) pendente para hibernação.");
                    } else {
                        let names: Vec<String> = unloaded
                            .iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect();
                        println!(
                            "🚀 Economia de RAM ativada: {} terminais ociosos hibernados: [{}]",
                            names.len(),
                            names.join(", ")
                        );
                    }
                }
                Err(e) => {
                    eprintln!("❌ Falha ao descarregar terminais ociosos: {e}");
                    std::process::exit(1);
                }
            }
        }

        Commands::Unload { terminal } => {
            let payload = build_unload_payload(&terminal, ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!("💤 Terminal '{}' descarregado com sucesso da memória.", terminal);
                }
                Err(e) => {
                    eprintln!("❌ Falha ao descarregar terminal '{}': {e}", terminal);
                    std::process::exit(1);
                }
            }
        }

        Commands::Approve { terminal, decision } => {
            let payload = build_approve_payload(&terminal, &decision, ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!("✅ Decisão '{}' enviada ao terminal '{}'.", decision, terminal);
                }
                Err(e) => {
                    eprintln!("❌ Falha ao aprovar no terminal '{}': {e}", terminal);
                    std::process::exit(1);
                }
            }
        }

        Commands::Prompt { terminal, text } => {
            let payload = build_prompt_payload(&terminal, &text, ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!("💬 Instrução enviada ao terminal '{}'.", terminal);
                }
                Err(e) => {
                    eprintln!("❌ Falha ao enviar prompt para '{}': {e}", terminal);
                    std::process::exit(1);
                }
            }
        }

        Commands::Read { terminal, lines } => {
            let payload = build_read_payload(&terminal, ws);
            match send_host_command(&pipe_path, &payload) {
                Ok(reply) => {
                    let text = reply
                        .get("result")
                        .and_then(|r| r.get("output").or_else(|| r.get("data")).or_else(|| r.get("text")))
                        .and_then(|v| v.as_str())
                        .or_else(|| reply.get("output").and_then(|v| v.as_str()))
                        .or_else(|| reply.get("data").and_then(|v| v.as_str()))
                        .unwrap_or("");

                    let cleaned = strip_ansi(text);
                    let all_lines: Vec<&str> = cleaned.lines().collect();
                    let start_idx = all_lines.len().saturating_sub(lines);

                    println!("─── [Saída: {} (últimas {} linhas)] ───", terminal, lines);
                    for l in &all_lines[start_idx..] {
                        println!("{}", l);
                    }
                    println!("───────────────────────────────────────────────────");
                }
                Err(e) => {
                    eprintln!("❌ Falha ao ler saída do terminal '{}': {e}", terminal);
                    std::process::exit(1);
                }
            }
        }

        Commands::Models { refresh } => {
            let payload = build_list_models_payload(refresh);
            match send_host_command(&pipe_path, &payload) {
                Ok(reply) => {
                    let result = reply.get("result").unwrap_or(&reply);
                    let rec_flash = result
                        .get("recommendedFlash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("auto-flash");
                    let rec_lead = result
                        .get("recommendedLead")
                        .and_then(|v| v.as_str())
                        .unwrap_or("auto-lead");

                    println!("\n╔═══════════════════════════════════════════════════════════════╗");
                    println!("║             MODELOS DISPONÍVEIS (ORQUESTRA / AGY)             ║");
                    println!("╚═══════════════════════════════════════════════════════════════╝");
                    println!("  Auto-Flash (Recomendado):  {}", rec_flash);
                    println!("  Auto-Lead  (Recomendado):  {}", rec_lead);
                    println!("─────────────────────────────────────────────────────────────────");

                    let empty_vec = vec![];
                    let models = result
                        .get("models")
                        .and_then(|v| v.as_array())
                        .unwrap_or(&empty_vec);

                    if models.is_empty() {
                        println!("  Nenhum modelo retornado pelo Host.");
                    } else {
                        println!("  {:<32} {:<24} {:<8}", "ID DO MODELO", "LABEL", "AGENTE");
                        println!("  {:-<32} {:-<24} {:-<8}", "", "", "");
                        for m in models {
                            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("-");
                            let label = m.get("label").and_then(|v| v.as_str()).unwrap_or("-");
                            let agent = m.get("agent").and_then(|v| v.as_str()).unwrap_or("-");
                            println!("  {:<32} {:<24} {:<8}", id, label, agent);
                        }
                    }
                    println!("─────────────────────────────────────────────────────────────────\n");
                }
                Err(e) => {
                    eprintln!("❌ Falha ao listar modelos do Host: {e}");
                    std::process::exit(1);
                }
            }
        }

        Commands::New {
            name,
            agent,
            model,
            persona,
            cwd,
            regente,
            connect_to,
            workspace: cmd_ws,
        } => {
            let target_ws = cmd_ws.as_deref().or(ws);
            let payload = build_create_terminal_payload(
                &name,
                &agent,
                model.as_deref(),
                persona.as_deref(),
                cwd.as_deref(),
                regente,
                connect_to.as_deref(),
                target_ws,
            );

            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!("\n✨ Terminal '{}' criado com sucesso no Orquestra!", name);
                    println!("   Agente:   {}", agent);
                    if let Some(ref m) = model {
                        println!("   Modelo:   {}", m);
                    }
                    if let Some(ref p) = persona {
                        println!("   Função:   {}", p);
                    }
                    if let Some(ref c) = cwd {
                        println!("   Pasta:    {}", c);
                    }
                    if regente {
                        println!("   Regente:  sim");
                    }
                    if let Some(ref conn) = connect_to {
                        println!("   Conexão:  conectado a '{}'", conn);
                    }
                    if let Some(w) = target_ws {
                        println!("   Workspace: {}", w);
                    }
                    println!();
                }
                Err(e) => {
                    eprintln!("❌ Falha ao criar terminal '{}': {e}", name);
                    std::process::exit(1);
                }
            }
        }

        Commands::Headless => match kill_electron_gui() {
            Ok(freed_mb) => {
                println!(
                    "⚡ Modo Headless ativado: interface gráfica Orquestra.exe encerrada. ~{} MB de RAM liberados! O Host permanece ativo em segundo plano.",
                    freed_mb
                );
            }
            Err(e) => {
                println!("ℹ️ {e}");
            }
        },

        Commands::Gui => match launch_gui() {
            Ok(_) => {
                println!("🚀 Interface gráfica Orquestra.exe iniciada em segundo plano conectando ao Host via Hot-Attach.");
            }
            Err(e) => {
                eprintln!("❌ {e}");
                std::process::exit(1);
            }
        },

        Commands::Stop => {
            let payload = build_shutdown_payload();
            match send_host_command(&pipe_path, &payload) {
                Ok(_) => {
                    println!("🛑 Comando de encerramento enviado ao Host com sucesso.");
                }
                Err(e) => {
                    eprintln!("❌ Falha ao enviar desligamento ao Host: {e}");
                    std::process::exit(1);
                }
            }
        }

        Commands::Restart {
            resume_terminal,
            resume_prompt,
            worker,
        } => {
            if !worker {
                let current_exe = std::env::current_exe()
                    .unwrap_or_else(|_| std::path::PathBuf::from("orq-pc.exe"));
                let mut cmd = Command::new(current_exe);
                cmd.arg("--pipe").arg(&pipe_path);
                if let Some(w) = ws {
                    cmd.arg("--workspace").arg(w);
                }
                cmd.arg("restart").arg("--worker");
                if let Some(ref term) = resume_terminal {
                    cmd.arg("--resume-terminal").arg(term);
                }
                cmd.arg("--resume-prompt").arg(&resume_prompt);
                #[cfg(windows)]
                {
                    cmd.creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
                }
                match cmd.spawn() {
                    Ok(_) => {
                        println!(
                            "🔄 Auto-restart silencioso agendado (zero janelas CMD / sem roubar foco). Retomando conversa em instantes..."
                        );
                    }
                    Err(e) => {
                        eprintln!("❌ Falha ao iniciar worker de restart: {e}");
                        std::process::exit(1);
                    }
                }
            } else {
                std::thread::sleep(std::time::Duration::from_millis(1500));
                let _ = send_host_command(&pipe_path, &build_shutdown_payload());
                std::thread::sleep(std::time::Duration::from_millis(1200));
                let _ = create_hidden_command("taskkill")
                    .args(["/IM", "Orquestra.exe", "/F"])
                    .status();
                std::thread::sleep(std::time::Duration::from_millis(800));

                let asar_new = r"D:\projetos D\orquestra\packages\app\release\win-unpacked\resources\app.asar.new";
                let asar_target = r"D:\projetos D\orquestra\packages\app\release\win-unpacked\resources\app.asar";
                if std::path::Path::new(asar_new).exists() {
                    for _ in 0..15 {
                        let _ = std::fs::remove_file(asar_target);
                        if std::fs::rename(asar_new, asar_target).is_ok() {
                            break;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(300));
                    }
                }

                let unpacked_new = r"D:\projetos D\orquestra\packages\app\release\win-unpacked\resources\app.asar.new.unpacked";
                let unpacked_target = r"D:\projetos D\orquestra\packages\app\release\win-unpacked\resources\app.asar.unpacked";
                if std::path::Path::new(unpacked_new).exists() {
                    let _ = std::fs::remove_dir_all(unpacked_target);
                    let _ = std::fs::rename(unpacked_new, unpacked_target);
                }

                let _ = launch_gui_with_opts(true);

                // Aguarda o Host responder e listar terminais abertos no workspace (até 30s)
                for _ in 0..60 {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    if let Ok(reply) = send_host_command(&pipe_path, &build_list_payload()) {
                        let empty_vec = vec![];
                        let workspaces = reply
                            .get("result")
                            .and_then(|r| r.get("workspaces"))
                            .and_then(|w| w.as_array())
                            .or_else(|| reply.get("workspaces").and_then(|w| w.as_array()))
                            .unwrap_or(&empty_vec);
                        let has_terminals = workspaces.iter().any(|w| {
                            w.get("terminalCount")
                                .and_then(|c| c.as_u64())
                                .unwrap_or(0) > 0
                        });
                        if has_terminals {
                            break;
                        }
                    }
                }

                // Se foi solicitado retomar conversa em um terminal, aguarda 5s para o agy carregar a cv e envia o prompt
                if let Some(term) = resume_terminal {
                    std::thread::sleep(std::time::Duration::from_millis(5000));
                    let prompt_text = if resume_prompt.ends_with('\r') || resume_prompt.ends_with('\n') {
                        resume_prompt
                    } else {
                        format!("{}\r", resume_prompt)
                    };
                    let prompt_payload = build_prompt_payload(&term, &prompt_text, ws);
                    let _ = send_host_command(&pipe_path, &prompt_payload);
                }
            }
        }
    }
}

// ==========================================
// TESTES UNITÁRIOS
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_csi_and_osc() {
        // CSI sequences (colors, cursor movements)
        let colored = "\x1b[32mTexto Verde\x1b[0m e \x1b[1;31mVermelho Negrito\x1b[0m";
        assert_eq!(strip_ansi(colored), "Texto Verde e Vermelho Negrito");

        // OSC sequences (window title, hyperlinks)
        let osc = "\x1b]0;Titulo da Janela\x07Conteudo Real";
        assert_eq!(strip_ansi(osc), "Conteudo Real");

        // Mixed CSI and OSC
        let mixed = "\x1b]0;Term\x07\x1b[34mAzul\x1b[0m";
        assert_eq!(strip_ansi(mixed), "Azul");
    }

    #[test]
    fn test_parse_tasklist_csv_kb_ptbr_and_enus() {
        // PT-BR uses dot as thousands separator
        assert_eq!(parse_tasklist_csv_kb("145.230 K"), Some(145230));

        // EN-US uses comma as thousands separator
        assert_eq!(parse_tasklist_csv_kb("145,230 K"), Some(145230));

        // Quoted variants
        assert_eq!(parse_tasklist_csv_kb("\"145,230 K\""), Some(145230));
        assert_eq!(parse_tasklist_csv_kb("\"42.100 K\""), Some(42100));

        // Plain digits with or without K
        assert_eq!(parse_tasklist_csv_kb("392000 K"), Some(392000));
    }

    #[test]
    fn test_parse_tasklist_csv_line() {
        // Windows PT-BR tasklist line
        let line_ptbr = "\"Orquestra.exe\",\"1234\",\"Console\",\"1\",\"145.230 K\"";
        let parsed = parse_tasklist_csv_line(line_ptbr);
        assert!(parsed.is_some());
        let (name, pid, kb) = parsed.unwrap();
        assert_eq!(name, "Orquestra.exe");
        assert_eq!(pid, 1234);
        assert_eq!(kb, 145230);

        // Windows EN-US tasklist line
        let line_enus = "\"node.exe\",\"5678\",\"Console\",\"1\",\"52,400 K\"";
        let (name2, pid2, kb2) = parse_tasklist_csv_line(line_enus).unwrap();
        assert_eq!(name2, "node.exe");
        assert_eq!(pid2, 5678);
        assert_eq!(kb2, 52400);
    }

    #[test]
    fn test_build_payloads() {
        // Switch payload
        let sw = build_switch_payload("executor", "agy", Some("meu-workspace"));
        assert_eq!(sw["id"], 1);
        assert_eq!(sw["type"], "update-terminal");
        assert_eq!(sw["name"], "executor");
        assert_eq!(sw["changes"]["agent"], "agy");
        assert_eq!(sw["workspace"], "meu-workspace");

        // Switch payload without workspace
        let sw_no_ws = build_switch_payload("regente", "claude", None);
        assert_eq!(sw_no_ws["changes"]["agent"], "claude");
        assert!(sw_no_ws.get("workspace").is_none());

        // Unload-idle payload
        let un_idle = build_unload_idle_payload(Some("ws-1"));
        assert_eq!(un_idle["type"], "unload-idle-terminals");
        assert_eq!(un_idle["workspace"], "ws-1");

        // Approve payload (yes variants)
        let app_y = build_approve_payload("executor", "y", None);
        assert_eq!(app_y["type"], "send-input");
        assert_eq!(app_y["data"], "y\r");

        let app_yes = build_approve_payload("executor", "yes", None);
        assert_eq!(app_yes["data"], "y\r");

        // Approve payload (no variant)
        let app_n = build_approve_payload("executor", "n", None);
        assert_eq!(app_n["data"], "n\r");

        // Prompt payload
        let prompt = build_prompt_payload("executor", "cargo check", None);
        assert_eq!(prompt["type"], "send-input");
        assert_eq!(prompt["data"], "cargo check\r");

        // Shutdown payload
        let shut = build_shutdown_payload();
        assert_eq!(shut["type"], "shutdown");

        // Models payload
        let models_payload = build_list_models_payload(true);
        assert_eq!(models_payload["id"], 1);
        assert_eq!(models_payload["type"], "list-models");
        assert_eq!(models_payload["refresh"], true);

        // New terminal payload with agy and model
        let new_agy = build_create_terminal_payload(
            "executor",
            "agy",
            Some("gemini-3.8-flash-high"),
            Some("Full-Stack"),
            Some("D:\\projects"),
            false,
            Some("regente"),
            Some("ws-1"),
        );
        assert_eq!(new_agy["type"], "create-terminal");
        assert_eq!(new_agy["name"], "executor");
        assert_eq!(new_agy["agent"], "agy");
        assert_eq!(new_agy["persona"], "Full-Stack");
        assert_eq!(new_agy["cwd"], "D:\\projects");
        assert_eq!(new_agy["regente"], false);
        assert_eq!(new_agy["connectTo"], "regente");
        assert_eq!(new_agy["workspace"], "ws-1");
        assert_eq!(
            new_agy["args"],
            serde_json::json!(["--model", "gemini-3.8-flash-high", "--dangerously-skip-permissions"])
        );

        // New terminal payload with claude and model
        let new_claude = build_create_terminal_payload(
            "regente",
            "claude",
            Some("opus"),
            None,
            None,
            true,
            None,
            None,
        );
        assert_eq!(new_claude["regente"], true);
        assert_eq!(
            new_claude["args"],
            serde_json::json!(["--model", "opus", "--dangerously-skip-permissions"])
        );

        // New terminal payload with codex and model
        let new_codex = build_create_terminal_payload(
            "helper",
            "codex",
            Some("o3-mini"),
            None,
            None,
            false,
            None,
            None,
        );
        assert_eq!(
            new_codex["args"],
            serde_json::json!(["--model", "o3-mini"])
        );

        // New terminal without model
        let new_plain = build_create_terminal_payload(
            "sh",
            "shell",
            None,
            None,
            None,
            false,
            None,
            None,
        );
        assert!(new_plain.get("args").is_none());
    }

    #[test]
    fn test_extract_command_reply_filtering() {
        // Async event should be ignored (returns Ok(None))
        let event_line = r#"{"type":"terminal.state","name":"executor","state":"busy"}"#;
        assert_eq!(extract_command_reply(event_line, 1), Ok(None));

        let event_obj = r#"{"event":{"type":"notice","message":"hello"}}"#;
        assert_eq!(extract_command_reply(event_obj, 1), Ok(None));

        // Reply for another ID should be ignored
        let other_id = r#"{"id":99,"ok":true,"result":{"done":true}}"#;
        assert_eq!(extract_command_reply(other_id, 1), Ok(None));

        // Successful reply with matching id
        let good_reply = r#"{"id":1,"ok":true,"result":{"unloaded":["t1","t2"]}}"#;
        let res = extract_command_reply(good_reply, 1).unwrap();
        assert!(res.is_some());
        let val = res.unwrap();
        assert_eq!(val["ok"], true);
        assert_eq!(val["result"]["unloaded"][0], "t1");

        // Error reply with matching id returns Err
        let err_reply = r#"{"id":1,"ok":false,"error":{"code":"USAGE","message":"Terminal not found"}}"#;
        let err = extract_command_reply(err_reply, 1);
        assert!(err.is_err());
        assert_eq!(err.unwrap_err(), "[USAGE] Terminal not found");
    }
}
