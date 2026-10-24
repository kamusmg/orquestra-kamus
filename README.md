# Orquestra Kamus Edition 🔺

[English](README.md) | [Português](README.pt-BR.md)

<div align="center">

### Spatial Visual Canvas for AI Coding Agents (agy, Claude, Codex) on Windows

*Custom edition featuring Git Worktree isolation (Floors), native Android automation, cron routines, and Rule Zero security.*

</div>

---

## 🎖️ Credits to the Original Creator

This project is a customized edition of the outstanding [**Orquestra**](https://github.com/engfabiopeixoto/orquestra) created and engineered by **Fábio Peixoto (Kern)** ([@engfabiopeixoto](https://github.com/engfabiopeixoto)).

All credit for the spatial canvas architecture, Windows low-latency ConPTY integration, typed inter-agent protocol, and visual data flow engine belongs to Kern. This Kamus Edition introduces enhancements tailored for parallel agent isolation, mobile automation, and strict security rules while honoring the original foundation.

---

## ⚡ Kamus Edition Features

- 🌳 **Isolated Git Worktrees (`orq floor` / `--floor`):** Run multiple agents in parallel on separate branches without file collisions.
- 📱 **Native Android Automation (`orq android` / `orq portal devices`):** ADB integration to list devices, inspect accessibility hierarchy (`uiautomator`), tap, type, send hardware keys, and take PNG screenshots.
- ⏰ **Scheduled Routines Engine (`orq routine`):** Cron and interval scheduler (`--every 30m`, `--daily 09:00`) with dynamic script output injection (`{{output}}`).
- 🛡️ **Rule Zero Security Personas:** Built-in `kamus-security`, `revisor`, and `implementador` personas to guarantee zero credential leaks, explicit file staging (`no git add .`), and clean commit messages.
- 🤖 **Dedicated Antigravity (`agy`) Skill:** Inter-agent orchestration and MCP bridge ready for AGY subagents.
- 🗂️ **Expanded Workspaces:** Multi-project support expanded up to 10 simultaneous workspaces.
- 🔕 **Zero Ghost Windows:** Strict `windowsHide: true` enforcement preventing flashing CMD popup windows.
