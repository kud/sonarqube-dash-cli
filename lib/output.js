import chalk from "chalk"

function titleCaseMetric(name) {
  return name
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function printProjectStatus({
  qualityGate,
  metrics,
  projectKey,
  branch,
}) {
  const status =
    qualityGate.status === "OK"
      ? chalk.green("PASSED ✅")
      : chalk.red("FAILED ❌")

  const projectName =
    projectKey ||
    qualityGate?.project ||
    qualityGate?.conditions?.[0]?.componentKey ||
    "Unknown"

  console.log(
    `\n📊 Project: ${chalk.bold(projectName)}${branch ? ` (${branch})` : ""}\n`,
  )
  console.log(`🚦 Quality Gate: ${status}`)
  if (qualityGate.qualityGate?.name) {
    console.log(`🎯 Gate Name: ${qualityGate.qualityGate.name}\n`)
  }

  if (!metrics || metrics.length === 0) {
    console.log(chalk.yellow("No metrics returned."))
    console.log("")
    return
  }

  const padLen =
    Math.max(...metrics.map((m) => titleCaseMetric(m.metric).length)) + 2
  for (const metric of metrics) {
    const label = titleCaseMetric(metric.metric).padEnd(padLen)
    const value = chalk.cyan(metric.value ?? "—")
    console.log(`• ${label} ${value}`)
  }
  console.log("")
}

export function printIssues({ projectKey, issues, branch }) {
  console.log(
    `\n📝 Issues for: ${chalk.bold(projectKey)}${
      branch ? ` (${branch})` : ""
    } (showing ${issues.length})\n`,
  )
  if (!issues.length) {
    console.log(chalk.green("No issues found with provided filters.") + "\n")
    return
  }
  for (const issue of issues) {
    const sevColor =
      issue.severity === "BLOCKER"
        ? chalk.bgRed.white
        : issue.severity === "CRITICAL"
        ? chalk.red
        : issue.severity === "MAJOR"
        ? chalk.yellow
        : issue.severity === "MINOR"
        ? chalk.cyan
        : chalk.gray
    const key = chalk.dim(issue.key)
    const msg = issue.message || "(no message)"
    const rule = chalk.gray(issue.rule)
    const type = chalk.magenta(issue.type)
    const comp =
      issue.component?.split(":").slice(1).join(":") || issue.component
    console.log(
      `${sevColor(issue.severity.padEnd(8))} ${type.padEnd(10)} ${msg}`,
    )
    console.log(`  ${key} ${rule}`)
    if (comp)
      console.log(`  ${chalk.blue(comp)}${issue.line ? ":" + issue.line : ""}`)
    console.log("")
  }
}
