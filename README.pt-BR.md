# Orquestra Kamus Edition 🔺

<div align="center">

### Canvas Visual Espacial para Agentes de IA (agy, Claude, Codex) no Windows

*Edição customizada com suporte a Git Worktrees isolados (Floors), automação Android nativa, rotinas agendadas e Regra Zero de segurança.*

</div>

---

## 🎖️ Créditos ao Criador Original

Este projeto é uma versão customizada e expandida do excelente [**Orquestra**](https://github.com/engfabiopeixoto/orquestra), concebido e desenvolvido com maestria pelo engenheiro **Fábio Peixoto (Kern)** ([@engfabiopeixoto](https://github.com/engfabiopeixoto)).

Todo o mérito da criação da arquitetura do canvas, integração ConPTY/node-pty de baixa latência para Windows, protocolo tipado inter-agentes e motor visual pertence ao Kern. Esta edição Kamus adiciona otimizações e ferramentas específicas para os nossos fluxos de trabalho autônomos e segurança estrita, preservando com orgulho as fundações originais do projeto.

---

## ⚡ Modificações da Edição Kamus

- 🌳 **Pisos Isolados com Git Worktrees (`orq floor` / `--floor`):** Permite rodar múltiplos agentes trabalhando em paralelo em branches diferentes sem qualquer colisão de arquivos locais (`orq floor create <piso> --branch <branch>`).
- 📱 **Automação Android Nativa (`orq android` / `orq portal devices`):** Integração direta com o `adb.exe` para listar dispositivos/emuladores, extrair a árvore de acessibilidade nativa via `uiautomator` com seletores (`@e1`, `@e2`), efetuar toques, digitação, teclas (`back`, `home`) e capturar telas em PNG.
- ⏰ **Motor de Rotinas Agendadas (`orq routine`):** Agendamento periódico de tarefas (`--every 30m`, `--daily 09:00`) com suporte a injeção dinâmica de saída via scripts `pre-run` (`{{output}}`).
- 🛡️ **Personas Globais com Regra Zero de Git:** Inclusão nativa da persona `kamus-security` (tolerância zero a vazamento de chaves/senhas, proibição de `git add .`, inspeção de `git diff` e commits padronizados) e personas de `revisor` e `implementador`.
- 🤖 **Skill Dedicada para Antigravity (`agy`):** Mapeamento completo de todos os comandos do `orq` e MCP stdio para que o `agy` e seus subagentes orquestrem o canvas de ponta a ponta.
- 🗂️ **Workspaces Expandidos:** Limite de projetos simultâneos aumentado de 3 para até 10 abas ativas.
- 🔕 **Proteção Total contra CMDs Fantasmas:** Garantia estrita de `windowsHide: true` em 100% das chamadas a processos de sistema operacional.

---

## Recursos Originais do Orquestra

- **Terminais de agentes.** Execute os agentes de CLI `claude`, `agy` e `codex`, ou um shell PowerShell, como nós no canvas.
- **Conexões.** Ligue terminais e notas. Terminais ligados podem enviar prompts e ler uns aos outros. Remova uma ligação selecionando-a e apertando Delete, pelo menu de contexto ou pelo botão × na linha.
- **Regente.** Marque um terminal como regente. Ele recebe um guia e pode criar, ligar, remover e instruir outros terminais com `orq`.
- **Funções (personas).** Salve instruções reutilizáveis por projeto ou globalmente e entregue uma a qualquer terminal.
- **Notas.** Notas em Markdown no canvas que os agentes conectados podem ler e escrever.
- **Grupos.** Agrupe terminais, notas e nós de fluxo em uma moldura e mova todos juntos.
- **Workspaces.** Mantenha projetos abertos ao mesmo tempo, cada um com seu canvas.
- **Portais de navegador.** Conecte um navegador a um agente para ele navegar, clicar, digitar, rolar a página e capturar telas.
- **Monitoramento de atividade.** Ative o monitoramento por terminal para receber uma notificação do Windows quando ele terminar um turno ou esperar por você com o app fora de foco.
- **Uso das assinaturas.** Veja as janelas de uso e os horários de renovação do Claude, do Codex e do agy.
- **Fluxo visual de dados.** Monte um grafo de processamento no mesmo canvas com nós de entrada, arquivo, algoritmo (JavaScript ou Python), validação, teste, visualização e saída.

---

## O CLI `orq`

O Orquestra injeta `ORQ_PIPE` e `ORQ_TOKEN` em cada terminal que inicia e coloca o `orq` no `PATH` dele. O comando só funciona dentro de um terminal do Orquestra. Adicione `--json` a qualquer comando para obter saída legível por máquina. A ajuda e as mensagens estão em português.

```powershell
orq whoami                                            # seu nome e tipo no canvas
orq peers                                             # terminais conectados a você
orq prompt reviewer "Revise src/app.ts" --timeout 8m
orq read reviewer --lines 40                          # tela atual do peer
orq note write plano "Passo 1: ..."
```

### Comandos de Pisos / Git Worktrees (Kamus Edition):
```powershell
orq floor list                                        # lista pisos isolados
orq floor create exp-1 --branch feat/exp-1            # cria worktree em .orquestra/floors/exp-1
orq new implementador --agent codex --floor exp-1     # cria terminal isolado no piso
orq floor remove exp-1                                # remove o piso
```

### Comandos Android (Kamus Edition):
```powershell
orq android devices                                   # lista aparelhos/emuladores
orq android snapshot                                  # lê acessibilidade com @e1, @e2
orq android tap 540 1200                              # toque na tela
orq android key home                                  # botão Home
orq android screenshot                                # captura PNG
```

### Comandos de Rotinas (Kamus Edition):
```powershell
orq routine list
orq routine create "Audit Diário" "npm audit" --daily 09:00
orq routine create "Digest" "Commit hoje:\n{{output}}" --every 1h --pre-run "git log -1 --oneline"
orq routine run "Digest"
```
