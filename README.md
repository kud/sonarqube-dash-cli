# sonarqube-dash

> A fast, focused CLI & TUI for SonarQube metrics, quality gates, issues and code snippets — with branch awareness and zero config friction.

## ✨ Highlights

- 🔍 One‑command project quality overview (metrics + quality gate)
- 🧭 Branch aware (`-b` flag & in‑TUI branch picker)
- 🧵 Issues listing with rich filters (severity / type / status / limit)
- 🖥️ Full‑screen TUI: split panes (issues list • detail • live code snippet)
- 🔦 Syntax‑highlighted contextual code (±5 lines) for each issue
- ⚙️ Layered configuration (user file → env → CLI) with redacted token printouts
- 📦 No external service deps beyond SonarQube (Node-only runtime)
- 🔐 Uses user token only (basic auth style) – nothing stored beyond local config

## 🧩 Install

Global (recommended):

```bash
npm install -g .
```

Local / ad‑hoc:

```bash
npm install
npx sonarqube-dash --help
```

## 🚀 Quick Start

```bash
export SONARQUBE_DASH_TOKEN=<token>
export SONARQUBE_DASH_PROJECT=my-project
export SONARQUBE_DASH_HOST=https://sonarqube.example.com

# Show metrics (auto main branch detection if -b omitted)
sonarqube-dash metrics

# List issues (plain)
sonarqube-dash issues -l 25

# Launch interactive TUI (issues + details + code) on a branch
sonarqube-dash issues -i -b develop
```

## 🛠️ Commands Overview

| Command        | Purpose                                     | Key Options                                                                      |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| `metrics`      | Project metrics + quality gate              | `-p --project`, `-b --branch`, `-t --token`, `-j --json`, `--print-config`       |
| `issues`       | List issues (plain / JSON / TUI)            | `-i` (TUI), `-l --limit`, `--severities`, `--types`, `--statuses`, `-b --branch` |
| `config`       | Manage local config file                    | `--set key=val`, `--get key`, `--path`                                           |
| `print-config` | Show merged runtime config (token redacted) | `-c --config`                                                                    |

### Metrics

```bash
sonarqube-dash metrics -p myproj -b main -t $TOKEN --host https://sonar.example.com
```

Pretty output example:

```
📊 Project: myproj (main)
🚦 Quality Gate: PASSED ✅
🎯 Gate Name: Default

• Bugs                 0
• Vulnerabilities      0
• Code Smells          5
• Coverage             84.2
• Duplicated Lines     0.4
```

JSON:

```bash
sonarqube-dash metrics -p myproj -b main -j
```

### Issues (Plain)

```bash
sonarqube-dash issues -p myproj -b develop --severities CRITICAL,MAJOR --limit 20
```

### Issues (Interactive TUI)

```bash
sonarqube-dash issues -p myproj -b develop -i
```

TUI key bindings:

```
q Quit | ↑/↓ Navigate | enter Load detail+code | r Refresh snippet | b Branch picker | h Help
```

### Branch Support

- Explicit: `--branch <name>` / `-b <name>`
- Metrics: if omitted, the CLI tries to detect and display the main branch name automatically
- TUI: press `b` to open a branch list (marks main with `*` if exposed by the API)
- Configurable via file or env (`SONARQUBE_DASH_BRANCH`)

## ⚙️ Configuration Layers

Precedence (lowest → highest):

1. Config file (default: `$XDG_CONFIG_HOME/sonarqube-dash-cli/config.json` or `~/.config/sonarqube-dash-cli/config.json`, or any file passed via `-c/--config`)
2. Environment variables
3. CLI flags

Example file (at `~/.config/sonarqube-dash-cli/config.json`):

```json
{
  "token": "abcdef123456",
  "project": "myproj",
  "branch": "main",
  "host": "https://sonarqube.example.com"
}
```

### Env Vars

| Var                      | Meaning             |
| ------------------------ | ------------------- |
| `SONARQUBE_DASH_TOKEN`   | Auth token          |
| `SONARQUBE_DASH_PROJECT` | Default project key |
| `SONARQUBE_DASH_HOST`    | Server base URL     |
| `SONARQUBE_DASH_BRANCH`  | Default branch      |

### Config CLI Helpers

```bash
# Create / update values
sonarqube-dash config --set token=abc123 project=myproj host=https://sonarqube.example.com branch=main

# Read a single field
sonarqube-dash config --get project

# Show stored file (token redacted)
sonarqube-dash config

# File path in use (defaults to user config path)
sonarqube-dash config --path
```

## 🧪 Filters (Issues)

| Flag           | Values                                          |
| -------------- | ----------------------------------------------- |
| `--severities` | `BLOCKER,CRITICAL,MAJOR,MINOR,INFO`             |
| `--types`      | `BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT` |
| `--statuses`   | `OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED`       |
| `--limit`      | Max issues to fetch (default 10)                |

## 🔍 Code Snippets

For each issue the tool requests the component's source via:

1. `/api/sources/raw?key=<component>` (preferred)
2. Fallback: `/api/sources/show`

Displayed with ±5 lines context and highlighted (problematic underline color sequences stripped for terminal compatibility).


## 🧱 Output Redaction

`print-config` and `metrics --print-config` mask the token as `***` while leaving other fields intact.

## 🧯 Troubleshooting

| Symptom                    | Hint                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| Empty metrics              | Check project key & token permissions                             |
| No snippet                 | Source browsing may be disabled on server or component not a file |
| Branch not shown           | API user lacks permissions or project has single default branch   |
| Color artifact / odd chars | Try a simpler TERM (e.g. `export TERM=xterm`)                     |

## 🧭 Roadmap (Ideas)

- Paging & search inside TUI
- On‑the‑fly severity filter toggles
- Export reports (markdown / HTML)
- Inline fix suggestions (where rule metadata permits)


## 📄 License

MIT

---

Feel free to open issues or PRs for feature requests. Fast feedback welcome.
