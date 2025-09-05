#!/usr/bin/env node

import { Command } from "commander"
import chalk from "chalk"
import {
  getProjectStatus,
  getIssues,
  getIssueSource,
  getBranches,
} from "../lib/api.js"
import { printProjectStatus, printIssues } from "../lib/output.js"
import { highlight } from "cli-highlight"
import { loadConfig, writeConfig, resolveConfigPath } from "../lib/config.js"

const program = new Command()

program.name("sonarqube-dash").description("SonarQube dashboard CLI")

program
  .command("metrics")
  .alias("m")
  .description("Fetch project metrics & quality gate")
  .option("-t, --token <token>", "SonarQube auth token (or env)")
  .option("-p, --project <projectKey>", "SonarQube project key (or env)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-h, --host <url>", "SonarQube host URL (or env)")
  .option("-c, --config <path>", "Path to config file (JSON)")
  .option("--print-config", "Print resolved configuration and exit", false)
  .option("-j, --json", "Output as JSON instead of pretty text", false)
  .action(runMetrics)

program
  .command("config")
  .description("Get or set configuration values")
  .option("-c, --config <path>", "Path to config file")
  .option("--get <key>", "Get a single key value (token/project/host/branch)")
  .option("--set <kv...>", "Set one or more key=value pairs")
  .option("--path", "Print the resolved config file path")
  .action(runConfig)

program
  .command("print-config")
  .description("Print resolved runtime configuration (from metrics command)")
  .option("-c, --config <path>", "Path to config file (JSON)")
  .action((opts) => {
    const { configFromFile, envConfig } = loadConfig(opts.config)
    const merged = { ...configFromFile, ...envConfig }
    if (merged.token) merged.token = "***"
    console.log(JSON.stringify(merged, null, 2))
  })

program.addHelpText(
  "after",
  `\nExamples:\n  sonarqube-dash metrics -p myproj -t $TOKEN --host https://sonar.example.com\n  sonarqube-dash issues -p myproj --severities CRITICAL,MAJOR --limit 20\n  sonarqube-dash config --set token=abc project=myproj host=https://sonar.example.com\n  sonarqube-dash config --get host\n  sonarqube-dash print-config\n`,
)

program
  .command("issues")
  .description("List issues for a project")
  .option("-p, --project <projectKey>", "Project key (or from config)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option(
    "--severities <list>",
    "Comma list: BLOCKER,CRITICAL,MAJOR,MINOR,INFO",
  )
  .option(
    "--types <list>",
    "Comma list: BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT",
  )
  .option(
    "--statuses <list>",
    "Comma list: OPEN,CONFIRMED,REOPENED,RESOLVED,CLOSED",
  )
  .option("-l, --limit <n>", "Max issues to show (default 10)", parseInt)
  .option("--json", "JSON output")
  .option(
    "-i, --interactive",
    "Full-screen interactive TUI (split list/detail/code)",
  )
  .action(runIssues)

program.parse(process.argv)

function buildRuntimeConfig(opts) {
  const { configFromFile, envConfig } = loadConfig(opts.config)
  const envFiltered = Object.fromEntries(
    Object.entries(envConfig).filter(([_, v]) => v !== undefined && v !== ""),
  )
  const merged = { ...configFromFile, ...envFiltered }
  // CLI precedence
  if (opts.token) merged.token = opts.token
  if (opts.project) merged.project = opts.project
  if (opts.branch) merged.branch = opts.branch
  if (opts.host) merged.host = opts.host
  merged.json = opts.json
  if (!merged.host) merged.host = "https://sonarqube.example.com"
  return merged
}

async function runMetrics(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (opts.printConfig) {
    const out = { ...cfg }
    if (out.token) out.token = "***"
    console.log(JSON.stringify(out, null, 2))
    return
  }
  if (!cfg.token) {
    console.error(chalk.red("Missing token (set via config, env, or --token)"))
    process.exit(1)
  }
  if (!cfg.project) {
    console.error(
      chalk.red("Missing project (set via config, env, or --project)"),
    )
    process.exit(1)
  }
  try {
    const result = await getProjectStatus(cfg)
    let branchForDisplay = cfg.branch
    if (!branchForDisplay) {
      // Try to discover main branch for display only (do not re-fetch metrics with branch to avoid edition limitations)
      try {
        const branches = await getBranches({
          token: cfg.token,
          host: cfg.host,
          project: cfg.project,
        })
        const main = branches.find((b) => b.isMain) || branches[0]
        if (main) branchForDisplay = main.name
      } catch {
        // ignore
      }
    }
    if (cfg.json)
      console.log(
        JSON.stringify({ ...result, branch: branchForDisplay }, null, 2),
      )
    else printProjectStatus({ ...result, branch: branchForDisplay })
  } catch (err) {
    console.error(chalk.red("❌ Error fetching project status:"), err.message)
    if (err.response) {
      console.error(
        chalk.gray(
          `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        ),
      )
    }
    process.exit(1)
  }
}

async function runIssues(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) {
    console.error(chalk.red("Missing token (set via config, env, or --token)"))
    process.exit(1)
  }
  if (!cfg.project) {
    console.error(
      chalk.red("Missing project (set via config, env, or --project)"),
    )
    process.exit(1)
  }
  try {
    const issuesData = await getIssues({
      token: cfg.token,
      host: cfg.host,
      project: cfg.project,
      branch: cfg.branch,
      severities: opts.severities,
      types: opts.types,
      statuses: opts.statuses,
      limit: opts.limit || 10,
    })
    if (opts.json) console.log(JSON.stringify(issuesData, null, 2))
    else if (opts.interactive)
      await browseIssuesTui({ ...issuesData, token: cfg.token, host: cfg.host })
    else printIssues(issuesData)
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    console.error(chalk.red("❌ Error fetching issues:"), msg)
    if (err.response) {
      console.error(
        chalk.gray(
          `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        ),
      )
    }
    process.exit(1)
  }
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str
}

async function browseIssuesTui({ projectKey, branch, issues, token, host }) {
  if (!issues.length) {
    console.log(chalk.green("No issues."))
    return
  }
  const blessedMod = await import("blessed")
  const blessed = blessedMod.default || blessedMod
  const screen = blessed.screen({
    smartCSR: true,
    title: `Issues - ${projectKey}`,
  })

  const help =
    "q:quit  ↑/↓:navigate  enter:view  r:refresh code  b:branches  h:help"

  const list = blessed.list({
    parent: screen,
    label: ` {bold}Issues (${issues.length})${
      branch ? ` [${branch}]` : ""
    }{/bold} `,
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    width: "40%",
    height: "100%-1",
    border: { type: "line" },
    style: {
      selected: { bg: "blue" },
      scrollbar: { bg: "white" },
    },
    scrollbar: { ch: " " },
  })

  const detail = blessed.box({
    parent: screen,
    label: " {bold}Detail{/bold} ",
    tags: true,
    left: "40%",
    width: "60%",
    height: "50%",
    border: { type: "line" },
    scrollable: true,
    keys: true,
    mouse: true,
    alwaysScroll: true,
    scrollbar: { ch: " " },
  })

  const code = blessed.box({
    parent: screen,
    label: " {bold}Code{/bold} ",
    tags: true,
    left: "40%",
    top: "50%",
    width: "60%",
    height: "50%-1",
    border: { type: "line" },
    scrollable: true,
    keys: true,
    mouse: true,
    alwaysScroll: true,
    scrollbar: { ch: " " },
  })

  const status = blessed.box({
    parent: screen,
    bottom: 0,
    height: 1,
    width: "100%",
    tags: true,
    style: { bg: "gray" },
    content: help,
  })

  list.setItems(
    issues.map(
      (i) =>
        `${severityColor(i.severity)} ${i.type.padEnd(11)} ${truncate(
          i.message || "(no message)",
          50,
        )}`,
    ),
  )

  list.select(0)

  let renderSeq = 0
  let lastRendered = -1
  async function render(idx) {
    if (idx === lastRendered) return
    lastRendered = idx
    const mySeq = ++renderSeq
    const issue = issues[idx]
    if (!issue) return
    const header = `{bold}${escapeTag(issue.message || "(no message)")}{/bold}`
    const meta = `${issue.key}  ${issue.severity}  ${issue.type}  ${
      issue.status || ""
    }${branch ? `  [${branch}]` : ""}`
    const location = issue.component
      ? `${issue.component}${issue.line ? ":" + issue.line : ""}`
      : ""
    let flow = ""
    if (issue.flow && issue.flow.length) {
      flow =
        "\n{cyan-fg}Flow:{/cyan-fg}\n" +
        issue.flow
          .map((f, i) => {
            const loc = f.locations?.[0]
            if (!loc) return ""
            return `  ${i + 1}. ${escapeTag(loc.msg || "")} (${loc.component}:${
              loc.textRange?.startLine || "?"
            })`
          })
          .join("\n")
    }
    detail.setContent(
      `${header}\n${meta}\n${location}${
        issue.textRange
          ? `\nLines: ${issue.textRange.startLine}-${issue.textRange.endLine}`
          : ""
      }${flow}`,
    )
    code.setContent("Loading code snippet...")
    screen.render()
    const snippet = await getIssueSource({ token, host, issue })
    if (mySeq !== renderSeq) return // stale
    if (snippet && snippet.snippet) {
      code.setContent(colorizeSnippet(snippet.snippet, issue))
    } else {
      code.setContent("(no snippet)")
    }
    screen.render()
  }

  // When selection confirmed (enter) also force render (in case user waits)
  list.on("select", async (_item, idx) => {
    await render(idx)
  })

  // Update on navigation (arrow keys / vi keys)
  list.on("keypress", async (_ch, key) => {
    if (["up", "down", "k", "j"].includes(key.name)) {
      // blessed updates list.selected before keypress event completes
      await render(list.selected)
    }
  })

  screen.key(["q", "C-c"], () => {
    screen.destroy()
    process.exit(0)
  })
  // Rely on list's own key handling for movement; enter triggers 'select'
  screen.key(["r"], async () => {
    status.setContent(help + "  refreshing code...")
    await render(list.selected)
  })
  screen.key(["b"], async () => {
    status.setContent(help + "  loading branches...")
    screen.render()
    const branches = await getBranches({ token, host, project: projectKey })
    if (!branches.length) {
      status.setContent(help + "  no branches")
      screen.render()
      return
    }
    const blessedMod = await import("blessed")
    const blessed = blessedMod.default || blessedMod
    const box = blessed.list({
      parent: screen,
      label: " {bold}Branches{/bold} ",
      width: "30%",
      height: "50%",
      left: "center",
      top: "center",
      border: { type: "line" },
      keys: true,
      vi: true,
      mouse: true,
      items: branches.map((b) => b.name + (b.isMain ? " *" : "")),
      style: { selected: { bg: "blue" } },
      tags: true,
    })
    box.focus()
    screen.render()
    box.on("select", async (item, idx) => {
      const chosen = branches[idx].name
      // Refetch issues for chosen branch
      try {
        const refreshed = await getIssues({
          token,
          host,
          project: projectKey,
          branch: chosen,
          limit: issues.length,
        })
        issues = refreshed.issues
        list.setItems(
          issues.map(
            (i) =>
              `${severityColor(i.severity)} ${i.type.padEnd(11)} ${truncate(
                i.message || "(no message)",
                50,
              )}`,
          ),
        )
        list.select(0)
        // Update label with new branch
        list.setLabel(` {bold}Issues (${issues.length}) [${chosen}]{/bold} `)
        await render(0)
      } catch (e) {
        status.setContent(help + "  branch load failed")
      }
      box.destroy()
      status.setContent(help)
      list.focus()
      screen.render()
    })
    screen.key(["escape"], () => {
      if (!box.destroyed) {
        box.destroy()
        status.setContent(help)
        list.focus()
        screen.render()
      }
    })
  })
  screen.key(["?", "h"], () => {
    status.setContent(help)
    screen.render()
  })

  await render(0)
  list.focus()
  screen.render()
}

function severityColor(sev) {
  const map = {
    BLOCKER: "{red-fg}BLOCKER{/red-fg}",
    CRITICAL: "{magenta-fg}CRITICAL{/magenta-fg}",
    MAJOR: "{yellow-fg}MAJOR{/yellow-fg}",
    MINOR: "{green-fg}MINOR{/green-fg}",
    INFO: "{blue-fg}INFO{/blue-fg}",
  }
  return map[sev] || sev
}

function escapeTag(str) {
  return str.replace(/\{/g, "<").replace(/\}/g, ">")
}

function guessLang(issue) {
  const comp = issue.component || ""
  const lower = comp.toLowerCase()
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript"
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript"
  if (lower.endsWith(".java")) return "java"
  if (lower.endsWith(".py")) return "python"
  if (lower.endsWith(".cs")) return "csharp"
  if (lower.endsWith(".cpp") || lower.endsWith(".cc") || lower.endsWith(".hpp"))
    return "cpp"
  if (lower.endsWith(".rb")) return "ruby"
  if (lower.endsWith(".go")) return "go"
  if (lower.endsWith(".php")) return "php"
  if (lower.endsWith(".xml")) return "xml"
  if (lower.endsWith(".json")) return "json"
  return "plaintext"
}

function colorizeSnippet(text, issue) {
  try {
    let out = highlight(text, {
      language: guessLang(issue),
      ignoreIllegals: true,
    })
    // Strip unsupported underline-color sequences (SGR 58 with colon params) that blessed can't parse
    out = out.replace(/\x1b\[58:[0-9:;]*m/g, "") // remove set-underline-color
    out = out.replace(/\x1b\[59m/g, "") // reset underline color
    return out
  } catch (_) {
    return text
  }
}

function runConfig(opts) {
  const pathUsed = resolveConfigPath(opts.config)
  if (opts.path) {
    console.log(pathUsed)
    return
  }
  if (opts.set) {
    const updates = {}
    for (const pair of opts.set) {
      const idx = pair.indexOf("=")
      if (idx === -1) {
        console.error(chalk.red(`Invalid format (expected key=value): ${pair}`))
        process.exit(1)
      }
      const key = pair.slice(0, idx)
      const value = pair.slice(idx + 1)
      updates[key] = value
    }
    const result = writeConfig(updates, opts.config)
    console.log(`Updated ${result.path}`)
    return
  }
  const { configFromFile } = loadConfig(opts.config)
  if (opts.get) {
    if (Object.prototype.hasOwnProperty.call(configFromFile, opts.get)) {
      if (opts.get === "token") console.log("***")
      else console.log(configFromFile[opts.get])
    } else {
      process.exit(1)
    }
    return
  }
  const out = { ...configFromFile }
  if (out.token) out.token = "***"
  console.log(JSON.stringify(out, null, 2))
}
