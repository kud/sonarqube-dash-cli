#!/usr/bin/env node

import { Command } from "commander"
import chalk from "chalk"
import {
  getProjectStatus,
  getIssues,
  getIssueSource,
  getBranches,
} from "../lib/api.js"
import { printProjectStatus, printIssues, printIssuesSummary, printIssue, printHotspots, printHotspot, printRules, printRule, printMeasures, printMeasuresHistory, printComponentTree, printDuplications, printQualityProfiles, printQualityGate } from "../lib/output.js"
import { highlight } from "cli-highlight"
import { spawn } from "child_process"
import { loadConfig, writeConfig, resolveConfigPath } from "../lib/config.js"
import { fetchIssuesSummary, fetchIssue, fetchHotspots, fetchHotspot, fetchRules, fetchRule, fetchMeasures, fetchMeasuresHistory, fetchComponentTree, fetchDuplications, fetchQualityProfiles, fetchQualityGate } from "../lib/api-helpers.js"

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

const configCmd = program
  .command("config")
  .description("Manage configuration file values")
  .option("-c, --config <path>", "Path to config file (overrides default)")

configCmd
  .command("set")
  .description("Set one or more key value pairs")
  .argument("<kv...>", "key=value pairs to set (token project host branch)")
  .action((pairs, opts, cmd) => {
    // pairs includes all key=value arguments
    const parent = cmd.parent?.parent || program
    const parentOpts = parent.opts ? parent.opts() : {}
    const updates = {}
    for (const pair of pairs) {
      const idx = pair.indexOf("=")
      if (idx === -1) {
        console.error(chalk.red(`Invalid format (expected key=value): ${pair}`))
        process.exit(1)
      }
      const key = pair.slice(0, idx)
      const value = pair.slice(idx + 1)
      updates[key] = value
    }
    const result = writeConfig(updates, parentOpts.config)
    console.log(`Updated ${result.path}`)
  })

configCmd
  .command("get")
  .description("Get a single key value")
  .argument("<key>", "token | project | host | branch")
  .action((key, _opts, cmd) => {
    const parent = cmd.parent?.parent || program
    const parentOpts = parent.opts ? parent.opts() : {}
    const { configFromFile } = loadConfig(parentOpts.config)
    if (Object.prototype.hasOwnProperty.call(configFromFile, key)) {
      if (key === "token") console.log("***")
      else console.log(configFromFile[key])
    } else {
      process.exit(1)
    }
  })

configCmd
  .command("path")
  .description("Print the resolved config file path")
  .action((_args, _opts, cmd) => {
    const parent = cmd.parent?.parent || program
    const parentOpts = parent.opts ? parent.opts() : {}
    console.log(resolveConfigPath(parentOpts.config))
  })

configCmd
  .command("show")
  .description("Show stored config (token redacted)")
  .action((_args, _opts, cmd) => {
    const parent = cmd.parent?.parent || program
    const parentOpts = parent.opts ? parent.opts() : {}
    const { configFromFile } = loadConfig(parentOpts.config)
    const out = { ...configFromFile }
    if (out.token) out.token = "***"
    console.log(JSON.stringify(out, null, 2))
  })


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
  `\nExamples:\n  sonarqube-dash metrics -p myproj -t $TOKEN --host https://sonar.example.com\n  sonarqube-dash issues -p myproj --severities CRITICAL,MAJOR --limit 20\n  sonarqube-dash issues:summary -p myproj\n  sonarqube-dash config set token=abc project=myproj host=https://sonar.example.com\n  sonarqube-dash config get host\n  sonarqube-dash config show\n  sonarqube-dash config path\n  sonarqube-dash print-config\n`,
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

program
  .command("issues:summary")
  .description("Show aggregated issues counts (facets)")
  .option("-p, --project <projectKey>", "Project key (or from config)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("--facets <list>", "Comma list of facets (default severities,types,statuses)")
  .option("--json", "JSON output")
  .action(runIssuesSummary)

program
  .command("issue")
  .description("Show a single issue by key")
  .argument("<key>", "Issue key")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("--json", "JSON output")
  .option("--url", "Print the SonarQube web URL for the issue")
  .option("--open", "Open the issue in the default browser (mac: open, linux: xdg-open)")
  .action(runIssue)

program
  .command("hotspots")
  .description("List security hotspots")
  .option("-p, --project <projectKey>", "Project key (or from config)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("--status <status>", "Hotspot status (TO_REVIEW or REVIEWED)")
  .option("--severity <severity>", "SEVERITY (LOW, MEDIUM, HIGH)")
  .option("-l, --limit <n>", "Max hotspots (default 50)", parseInt)
  .option("--json", "JSON output")
  .action(runHotspots)

program
  .command("hotspot")
  .description("Show a single hotspot by key")
  .argument("<key>", "Hotspot key")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("--json", "JSON output")
  .option("--url", "Print the SonarQube web URL for the hotspot")
  .option("--open", "Open the hotspot in the default browser")
  .action(runHotspot)

program
  .command("rules")
  .description("Search rules")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("-q, --query <q>", "Search text")
  .option("--languages <list>", "Comma list of languages")
  .option("--tags <list>", "Comma list of tags")
  .option("--repository <repo>", "Repository key")
  .option("--severities <list>", "Comma list severities (BLOCKER,CRITICAL,...)")
  .option("-l, --limit <n>", "Max rules (default 50)", parseInt)
  .option("--json", "JSON output")
  .action(runRules)

program
  .command("rule")
  .description("Show a single rule")
  .argument("<key>", "Rule key")
  .option("-t, --token <token>", "Auth token (or from config)")
  .option("-h, --host <url>", "Host URL (or from config)")
  .option("-c, --config <path>", "Config file path")
  .option("--json", "JSON output")
  .option("--url", "Print the SonarQube web URL for the rule")
  .option("--open", "Open the rule in the default browser")
  .action(runRule)

program
  .command("measures")
  .description("Fetch component measures")
  .requiredOption("-C, --component <key>", "Component key (project or file)")
  .option("-m, --metrics <list>", "Comma list metric keys", "coverage,bugs,vulnerabilities,code_smells")
  .option("-b, --branch <branch>", "Branch name")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("-c, --config <path>", "Config path")
  .action(runMeasures)

program
  .command("measures:history")
  .description("Fetch historical measures")
  .requiredOption("-C, --component <key>", "Component key")
  .option("-m, --metrics <list>", "Comma list metric keys", "coverage,bugs,vulnerabilities,code_smells")
  .option("-b, --branch <branch>", "Branch name")
  .option("--from <date>", "From date (YYYY-MM-DD)")
  .option("--to <date>", "To date (YYYY-MM-DD)")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("-c, --config <path>", "Config path")
  .action(runMeasuresHistory)

program
  .command("component-tree")
  .description("Browse component tree (files)")
  .requiredOption("-C, --component <key>", "Component key (project or module)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-q, --qualifiers <codes>", "Qualifier codes (default FIL)")
  .option("-m, --metrics <list>", "Comma list metric keys")
  .option("--strategy <s>", "Tree strategy (leaves|children)", "leaves")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("-c, --config <path>", "Config path")
  .action(runComponentTree)

program
  .command("duplications")
  .description("Show duplications for a file")
  .requiredOption("-f, --file <fileKey>", "File component key")
  .option("-p, --project <projectKey>", "Project key (optional, used for URL context)")
  .option("-b, --branch <branch>", "Branch name")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("--url", "Print the SonarQube web URL for the file")
  .option("--open", "Open the file duplications page in the browser")
  .option("-c, --config <path>", "Config path")
  .action(runDuplications)

program
  .command("quality-profiles")
  .description("List quality profiles")
  .option("--language <lang>", "Language key")
  .option("-p, --project <projectKey>", "Project key to filter active")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("-c, --config <path>", "Config path")
  .action(runQualityProfiles)

program
  .command("quality-gate")
  .description("Show quality gate project status (shortcut)")
  .option("-p, --project <projectKey>", "Project key")
  .option("-t, --token <token>", "Auth token")
  .option("-h, --host <url>", "Host URL")
  .option("--json", "JSON output")
  .option("-c, --config <path>", "Config path")
  .action(runQualityGate)

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

async function runIssuesSummary(opts) {
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
    const summary = await fetchIssuesSummary({
      host: cfg.host,
      token: cfg.token,
      project: cfg.project,
      branch: cfg.branch,
      facets: opts.facets,
    })
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      printIssuesSummary(summary)
    }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    console.error(chalk.red("❌ Error fetching issues summary:"), msg)
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
  // Workaround: blessed 0.1.81 cannot parse modern terminfo Setulc (underline color) capability
  // observed on some systems (xterm-256color) -> prints noisy error. Downgrade TERM temporarily.
  const __origTERM = process.env.TERM
  let __termDowngraded = false
  if (__origTERM && /xterm-256color/i.test(__origTERM)) {
    try {
      process.env.TERM = "xterm"
      __termDowngraded = true
    } catch {}
  }
  function __restoreTERM() {
    if (__termDowngraded) {
      try {
        process.env.TERM = __origTERM
      } catch {}
    }
  }
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
    // Fancy formatting: severity/type/status first row, path & lines next, flow, then highlighted message at bottom
    const sevTag = `{bold}${severityColor(issue.severity)}{/bold}`
    const typeTag = `{magenta-fg}${issue.type}{/magenta-fg}`
    const statusTag = statusColor(issue.status || "")
    const branchTag = branch ? `{gray-fg}[${branch}]{/gray-fg}` : ""
    const keyTag = `{cyan-fg}${issue.key}{/cyan-fg}`
    const locPath = issue.component
      ? `{blue-fg}${issue.component}{/blue-fg}${issue.line ? ":" + issue.line : ""}`
      : ""
    const linesRange = issue.textRange
      ? `{gray-fg}Lines: ${issue.textRange.startLine}-${issue.textRange.endLine}{/gray-fg}`
      : ""
    let flow = ""
    if (issue.flow && issue.flow.length) {
      flow =
        `{cyan-fg}Flow:{/cyan-fg}\n` +
        issue.flow
          .map((f, i) => {
            const loc = f.locations?.[0]
            if (!loc) return ""
            return `  ${i + 1}. ${escapeTag(loc.msg || "")} ({${"gray-fg"}}${loc.component}:{${"/gray-fg"}}$${
              loc.textRange?.startLine || "?"
            })`
          })
          .join("\n")
    }
    const ruleLine = `{gray-fg}${"─".repeat(50)}{/gray-fg}`
    const messageLine = `{bold}{yellow-fg}${escapeTag(
      issue.message || "(no message)",
    )}{/yellow-fg}{/bold}`
    const metaLine = `${sevTag}  ${typeTag}  ${statusTag}  ${branchTag}  ${keyTag}`
    let body = metaLine
    if (locPath) body += `\n${locPath}`
    if (linesRange) body += `\n${linesRange}`
    if (flow) body += `\n${flow}`
    body += `\n${ruleLine}\n${messageLine}`
    detail.setContent(body)
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
    __restoreTERM()
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
  // Ensure TERM restored on normal exit
  screen.on("destroy", () => __restoreTERM())
 }

function statusColor(status) {
  if (!status) return ""
  const map = {
    OPEN: '{green-fg}OPEN{/green-fg}',
    CONFIRMED: '{green-fg}CONFIRMED{/green-fg}',
    REOPENED: '{yellow-fg}REOPENED{/yellow-fg}',
    RESOLVED: '{cyan-fg}RESOLVED{/cyan-fg}',
    CLOSED: '{gray-fg}CLOSED{/gray-fg}',
  }
  return map[status] || status
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

// ---- New command handlers ----
function buildIssueUrl(host, issueKey, projectKey) {
  const base = host.replace(/\/$/, '')
  const projectPart = projectKey ? `id=${encodeURIComponent(projectKey)}&` : ''
  return `${base}/project/issues?${projectPart}open=${encodeURIComponent(issueKey)}&issues=${encodeURIComponent(issueKey)}`
}
function buildHotspotUrl(host, hotspotKey, projectKey) {
  const base = host.replace(/\/$/, '')
  const projectPart = projectKey ? `id=${encodeURIComponent(projectKey)}&` : ''
  return `${base}/security_hotspots?${projectPart}hotspots=${encodeURIComponent(hotspotKey)}&open=${encodeURIComponent(hotspotKey)}`
}
function buildRuleUrl(host, ruleKey) {
  const base = host.replace(/\/$/, '')
  return `${base}/coding_rules?open=${encodeURIComponent(ruleKey)}&rule_key=${encodeURIComponent(ruleKey)}`
}
function buildFileUrl(host, componentKey, branch) {
  const base = host.replace(/\/$/, '')
  const branchPart = branch ? `&branch=${encodeURIComponent(branch)}` : ''
  return `${base}/code?id=${encodeURIComponent(componentKey)}${branchPart}`
}
function openUrl(url) {
  const opener = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'start' : 'xdg-open')
  try {
    const child = spawn(opener, [url], { stdio: 'ignore', detached: true })
    child.unref()
  } catch (e) {
    console.error(chalk.red('Failed to open browser:'), e.message)
  }
}

async function runIssue(opts, key) {
  const issueKey = typeof key === 'string' ? key : (Array.isArray(key) ? key[0] : undefined)
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  if (!issueKey) { console.error(chalk.red("Issue key required")); process.exit(1) }
  try {
    const issue = await fetchIssue({ host: cfg.host, token: cfg.token, issueKey })
    if (!issue) { console.error(chalk.yellow("Issue not found")); process.exit(1) }
    if (cfg.json || opts.json) console.log(JSON.stringify(issue, null, 2))
    else {
      printIssue(issue)
      if (opts.url) {
        const url = buildIssueUrl(cfg.host, issue.key, issue.project)
        console.log(url)
      }
      if (opts.open) {
        const url = buildIssueUrl(cfg.host, issue.key, issue.project)
        console.log(chalk.gray('Opening: ') + url)
        openUrl(url)
      }
    }
  } catch (e) {
    console.error(chalk.red("❌ Error fetching issue:"), e.message)
    process.exit(1)
  }
}

async function runHotspots(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  if (!cfg.project) { console.error(chalk.red("Missing project")); process.exit(1) }
  try {
    const data = await fetchHotspots({ host: cfg.host, token: cfg.token, project: cfg.project, branch: cfg.branch, status: opts.status, severity: opts.severity, limit: opts.limit || 50 })
    if (cfg.json || opts.json) console.log(JSON.stringify(data, null, 2))
    else printHotspots(data)
  } catch (e) {
    console.error(chalk.red("❌ Error fetching hotspots:"), e.message)
    process.exit(1)
  }
}

async function runHotspot(opts, key) {
  const hotspotKey = typeof key === 'string' ? key : (Array.isArray(key) ? key[0] : undefined)
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  if (!hotspotKey) { console.error(chalk.red("Hotspot key required")); process.exit(1) }
  try {
    const hotspot = await fetchHotspot({ host: cfg.host, token: cfg.token, hotspotKey })
    if (!hotspot) { console.error(chalk.yellow("Hotspot not found")); process.exit(1) }
    if (cfg.json || opts.json) console.log(JSON.stringify(hotspot, null, 2))
    else {
      printHotspot(hotspot)
      if (opts.url) {
        const url = buildHotspotUrl(cfg.host, hotspot.key, hotspot.project)
        console.log(url)
      }
      if (opts.open) {
        const url = buildHotspotUrl(cfg.host, hotspot.key, hotspot.project)
        console.log(chalk.gray('Opening: ') + url)
        openUrl(url)
      }
    }
  } catch (e) {
    console.error(chalk.red("❌ Error fetching hotspot:"), e.message)
    process.exit(1)
  }
}

async function runRules(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  try {
    const data = await fetchRules({ host: cfg.host, token: cfg.token, query: opts.query, languages: opts.languages, tags: opts.tags, repository: opts.repository, activeSeverities: opts.severities, limit: opts.limit || 50 })
    if (cfg.json || opts.json) console.log(JSON.stringify(data, null, 2))
    else printRules(data)
  } catch (e) { console.error(chalk.red("❌ Error searching rules:"), e.message); process.exit(1) }
}

async function runRule(opts, key) {
  const ruleKey = typeof key === 'string' ? key : (Array.isArray(key) ? key[0] : undefined)
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  if (!ruleKey) { console.error(chalk.red("Rule key required")); process.exit(1) }
  try {
    const rule = await fetchRule({ host: cfg.host, token: cfg.token, key: ruleKey })
    if (!rule) { console.error(chalk.yellow("Rule not found")); process.exit(1) }
    if (cfg.json || opts.json) console.log(JSON.stringify(rule, null, 2))
    else {
      printRule(rule)
      if (opts.url) {
        const url = buildRuleUrl(cfg.host, rule.key)
        console.log(url)
      }
      if (opts.open) {
        const url = buildRuleUrl(cfg.host, rule.key)
        console.log(chalk.gray('Opening: ') + url)
        openUrl(url)
      }
    }
  } catch (e) { console.error(chalk.red("❌ Error fetching rule:"), e.message); process.exit(1) }
}

async function runMeasures(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  const component = opts.component
  if (!component) { console.error(chalk.red("Component key required")); process.exit(1) }
  const metrics = opts.metrics
  try {
    const componentData = await fetchMeasures({ host: cfg.host, token: cfg.token, component, metricKeys: metrics, branch: cfg.branch })
    if (!componentData) { console.error(chalk.yellow("No measures returned")); process.exit(1) }
    if (cfg.json || opts.json) console.log(JSON.stringify(componentData, null, 2))
    else printMeasures(componentData)
  } catch (e) { console.error(chalk.red("❌ Error fetching measures:"), e.message); process.exit(1) }
}

async function runMeasuresHistory(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  const component = opts.component
  if (!component) { console.error(chalk.red("Component key required")); process.exit(1) }
  const metrics = opts.metrics
  try {
    const history = await fetchMeasuresHistory({ host: cfg.host, token: cfg.token, component, metrics, branch: cfg.branch, from: opts.from, to: opts.to })
    if (cfg.json || opts.json) console.log(JSON.stringify(history, null, 2))
    else printMeasuresHistory(history)
  } catch (e) { console.error(chalk.red("❌ Error fetching measures history:"), e.message); process.exit(1) }
}

async function runComponentTree(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  const component = opts.component
  if (!component) { console.error(chalk.red("Component key required")); process.exit(1) }
  try {
    const tree = await fetchComponentTree({ host: cfg.host, token: cfg.token, component, branch: cfg.branch, qualifiers: opts.qualifiers || 'FIL', metricKeys: opts.metrics, strategy: opts.strategy })
    if (cfg.json || opts.json) console.log(JSON.stringify(tree, null, 2))
    else printComponentTree(tree)
  } catch (e) { console.error(chalk.red("❌ Error fetching component tree:"), e.message); process.exit(1) }
}

async function runDuplications(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  const fileKey = opts.file
  if (!fileKey) { console.error(chalk.red("File key required")); process.exit(1) }
  try {
    const dups = await fetchDuplications({ host: cfg.host, token: cfg.token, project: opts.project || cfg.project, branch: cfg.branch, fileKey })
    if (cfg.json || opts.json) console.log(JSON.stringify(dups, null, 2))
    else {
      printDuplications(dups)
      if (opts.url || opts.open) {
        const fileKey = opts.file
        const url = buildFileUrl(cfg.host, fileKey, cfg.branch)
        if (opts.url) console.log(url)
        if (opts.open) {
          console.log(chalk.gray('Opening: ') + url)
          openUrl(url)
        }
      }
    }
  } catch (e) { console.error(chalk.red("❌ Error fetching duplications:"), e.message); process.exit(1) }
}

async function runQualityProfiles(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  try {
    const profiles = await fetchQualityProfiles({ host: cfg.host, token: cfg.token, language: opts.language, project: opts.project || cfg.project })
    if (cfg.json || opts.json) console.log(JSON.stringify(profiles, null, 2))
    else printQualityProfiles(profiles)
  } catch (e) { console.error(chalk.red("❌ Error fetching quality profiles:"), e.message); process.exit(1) }
}

async function runQualityGate(opts) {
  const cfg = buildRuntimeConfig(opts)
  if (!cfg.token) { console.error(chalk.red("Missing token")); process.exit(1) }
  if (!cfg.project) { console.error(chalk.red("Missing project")); process.exit(1) }
  try {
    const gate = await fetchQualityGate({ host: cfg.host, token: cfg.token, project: cfg.project })
    if (!gate) { console.error(chalk.yellow("No gate data")); process.exit(1) }
    if (cfg.json || opts.json) console.log(JSON.stringify(gate, null, 2))
    else printQualityGate(gate)
  } catch (e) { console.error(chalk.red("❌ Error fetching quality gate:"), e.message); process.exit(1) }
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

