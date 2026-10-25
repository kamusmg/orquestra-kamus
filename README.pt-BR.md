# Orquestra — Kamus Edition 🔺

[Português](README.pt-BR.md) | [English](README.md)

<div align="center">

### Canvas Visual Espacial para Agentes de IA (`agy`, `claude`, `codex`) no Windows

*Orquestração multi-agente em tempo real sobre ConPTY nativo, com Hot-Swap de motores, isolamento por Git Worktrees (Pisos), CLI ultraleve em Rust (`orq-pc`), economia de RAM Headless e automação Android.*

</div>

---

## 🙏 Agradecimentos e Créditos ao Criador Original

Este projeto é um fork customizado e expandido do [**Orquestra**](https://github.com/engfabiopeixoto/orquestra), idealizado, arquitetado e desenvolvido originalmente por **Fábio Peixoto (Kern)** ([@engfabiopeixoto](https://github.com/engfabiopeixoto)).

Toda a base que torna o Orquestra único — a arquitetura do canvas espacial em React Flow, a comunicação de baixíssima latência via Named Pipes e ConPTY no Windows, o protocolo tipado entre processos (Host ↔ Renderer ↔ CLI `orq`), o sistema de Regente/Funções e o motor visual de fluxo de dados — é fruto direto do trabalho e da visão de engenharia do **Kern**.

Esta **Kamus Edition** nasceu do uso diário intenso do Orquestra e adiciona camadas específicas para o nosso fluxo de operação multi-agente (como troca ao vivo de agentes, controle via binário Rust, colagem direta de prints com `Alt+V`, worktrees isolados e gerenciamento agressivo de memória), mantendo total respeito, admiração e gratidão ao projeto original.

---

## ⚡ O que há de novo na Kamus Edition

- 🔄 **Hot-Swap de Agentes em 1 Clique (`claude` ↔ `agy` ↔ `codex` ↔ `shell`):** Troque o motor de qualquer terminal ao vivo (pela UI ou via `orq-pc switch <terminal> <agente>`) sem perder a posição no canvas, o histórico visual, o diretório (`cwd`) ou as conexões com outros nós.
- 🦀 **CLI Nativa de Controle em Rust (`orq-pc.exe`):** Binário nativo (~400 KB) que conversa diretamente com o Named Pipe de controle do Host em `< 1 ms` para consultar telemetria (`status`), trocar agentes (`switch`), criar terminais (`new`), injetar prompts (`prompt`), ler buffers (`read`) e realizar **auto-restart silencioso** (`restart --resume-terminal`) sem abrir janelas de console (`CREATE_NO_WINDOW`) e sem roubar o foco de aplicações em tela cheia (`ORQ_NO_FOCUS=1`).
- 🧹 **Economia Dupla de RAM (Descarregar Ociosos & Modo Headless):**
  - **Liberar RAM (`Ctrl+Shift+U` ou `orq-pc unload-idle`):** Encerra os processos PTY de todos os terminais `idle` preservando os cards e conexões no canvas para retomada sob demanda.
  - **Modo Headless (`orq-pc headless` / `orq-pc gui`):** Fecha a interface gráfica Electron (liberando ~400–650 MB de RAM) mantendo o Host e todos os agentes vivos em segundo plano, com reconexão instantânea (*Hot-Attach*).
- 🖼️ **Anexo de Prints com `Alt+V` & Drag-and-Drop nos Terminais:**
  - Tire um print no Windows (`Win+Shift+S` ou `PrintScreen`) e pressione **`Alt+V`** direto no terminal: o Orquestra captura o bitmap da área de transferência, salva em PNG temporário com *Garbage Collector* automático, exibe o chip `📎 [imagem]` e injeta o caminho pronto para o agente analisar (ou repassa o atalho nativamente quando o agente é `claude`).
  - Arraste uma ou mais imagens/arquivos do Windows Explorer diretamente para cima de qualquer terminal para injetar seus caminhos formatados.
- 🎯 **Seletor de Modelos Antigravity (`--model`) & Normalizador de Flags:** Escolha o modelo exato por terminal (ex.: `gemini-4-argon-high` para o Tech Lead/Regente e `gemini-3.8-flash-high` para os executores) com tradução automática de flags entre CLIs (`--dangerously-skip-permissions` ↔ `--yolo`).
- 🌳 **Pisos Isolados com Git Worktrees (`orq floor` / `--floor`):** Crie árvores de trabalho Git isoladas (`.orquestra/floors/<piso>`) para que múltiplos agentes editem e testem branches distintas em paralelo sem colisão de arquivos.
- 📱 **Automação Android Nativa (`orq android` / `orq portal devices`):** Integração direta com `adb` e `uiautomator` para inspecionar a árvore de acessibilidade com seletores (`@e1`, `@e2`), tocar, digitar, enviar teclas físicas e capturar screenshots em PNG.
- ⏰ **Rotinas Agendadas (`orq routine`):** Agendador cron/intervalo (`--every 30m`, `--daily 09:00`) com suporte a scripts `pre-run` e injeção dinâmica de saída (`{{output}}`).
- 🛡️ **Regra Zero de Segurança e Git:** Personas nativas (`kamus-security`, `exec-backend-systems`, `exec-frontend-ui`, `exec-qa-security`) que proíbem `git add .`, auditam `git diff --cached` contra vazamento de chaves/tokens e padronizam commits.

---

## 🎼 Recursos Fundamentais do Orquestra (Base Original por Kern)

- **Terminais de Agentes no Canvas:** Execute `claude`, `agy`, `codex` ou `powershell` como cartões espaciais redimensionáveis com renderização WebGL via xterm.js.
- **Conexões e Topologia:** Conecte terminais, notas e portais. Terminais conectados podem ler a tela uns dos outros (`orq read`) e enviar instruções (`orq prompt`).
- **Modo Regente:** Transforme um terminal em Regente para criar novos terminais (`orq new`), gerenciar conexões (`orq link` / `orq unlink`), aplicar funções (`orq brief`) e coordenar esquadrões inteiros.
- **Notas Compartilhadas:** Documentos Markdown vivos no canvas (`orq note list | show | write | append`) usados como quadro de progresso e memória coletiva entre agentes.
- **Portais Web:** Navegadores integrados ao canvas que os agentes conectados podem navegar, inspecionar DOM, clicar, preencher formulários e capturar telas (`orq portal`).
- **Fluxo Visual de Dados:** Grafo de processamento no mesmo canvas com nós de entrada, arquivo, algoritmo (JS/Python), validação, teste, visualização e saída.
- **Monitoramento de Assinaturas:** Acompanhamento de janelas de uso e renovação de cotas na barra lateral.

---

## 🛠️ Uso Rápido das CLIs (`orq` e `orq-pc`)

### 1. Dentro de qualquer terminal do Orquestra (`orq`)
```powershell
orq whoami                                            # identifica seu terminal e agente atual
orq peers                                             # lista os terminais conectados e seus estados
orq read flash-executor --lines 30                    # lê as últimas 30 linhas de um par conectado
orq note write nota-1 --file relatorio.md             # atualiza uma nota compartilhada no canvas
orq new qa-sec --agent agy --persona exec-qa-security # cria um novo terminal já conectado ao Regente
```

### 2. Controle externo e gerenciamento de recursos (`orq-pc`)
```powershell
# Painel de status (PID do Host, consumo de RAM, workspaces e terminais ativos)
.\crates\orq-pc\target\release\orq-pc.exe status

# Hot-swap de agente em tempo real preservando conexões
.\crates\orq-pc\target\release\orq-pc.exe switch flash-executor agy

# Enviar prompt assíncrono para um terminal específico
.\crates\orq-pc\target\release\orq-pc.exe prompt flash-executor "Rode os testes unitários"

# Descarregar terminais ociosos ou ativar modo Headless para liberar RAM
.\crates\orq-pc\target\release\orq-pc.exe unload-idle
.\crates\orq-pc\target\release\orq-pc.exe headless
.\crates\orq-pc\target\release\orq-pc.exe gui

# Auto-restart silencioso com swap atômico de app.asar e retomada automática na conversa
.\crates\orq-pc\target\release\orq-pc.exe restart --resume-terminal argon-tech-lead
```

### 3. Pisos Isolados (Git Worktrees), Android e Rotinas
```powershell
# Git Worktrees isolados
orq floor create feature-x --branch feat/feature-x
orq new dev-x --agent agy --floor feature-x

# Automação Android via ADB
orq android devices
orq android snapshot
orq android tap 540 1200

# Rotinas agendadas
orq routine create "Build Check" "npm run typecheck" --every 30m
```

---

## 🚀 Desenvolvimento e Build Local

```powershell
# Instalar dependências
npm install

# Rodar a suíte de testes (Vitest + Rust)
npm test
cargo test --manifest-path crates/orq-pc/Cargo.toml

# Verificar tipagem TypeScript (e2e type-safety)
npm run typecheck

# Compilar o bundle do Host e da aplicação Electron
npx tsx packages/host/pack.ts
npm run build -w @orquestra/app
```

---

<div align="center">

Criado originalmente por [**Fábio Peixoto (Kern)**](https://github.com/engfabiopeixoto/orquestra) · Expandido na **Kamus Edition** por [@kamusmg](https://github.com/kamusmg)

</div>
