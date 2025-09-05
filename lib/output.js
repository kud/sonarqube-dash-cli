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

export function printIssuesSummary({ projectKey, branch, total, facets }) {
  console.log(`\n🧮 Issues Summary: ${chalk.bold(projectKey)}${branch ? ` (${branch})` : ""}`)
  console.log(`Total issues: ${chalk.cyan(total)}`)
  const order = ["severities", "types", "statuses"]
  for (const facetName of order) {
    if (!facets[facetName]) continue
    console.log(`\n${chalk.bold(titleCaseMetric(facetName))}:`)
    const entries = Object.entries(facets[facetName])
    const maxKey = Math.max(...entries.map(([k]) => k.length), 0) + 2
    for (const [k, v] of entries.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(maxKey)} ${chalk.green(v)}`)
    }
  }
  // Print any additional facets not in default order
  for (const facetName of Object.keys(facets)) {
    if (order.includes(facetName)) continue
    console.log(`\n${chalk.bold(titleCaseMetric(facetName))}:`)
    const entries = Object.entries(facets[facetName])
    const maxKey = Math.max(...entries.map(([k]) => k.length), 0) + 2
    for (const [k, v] of entries.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(maxKey)} ${chalk.green(v)}`)
    }
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

export function printIssue(issue) {
  console.log(`\n🔎 Issue ${chalk.dim(issue.key)}\n`)
  console.log(`${chalk.bold(issue.severity)} ${chalk.magenta(issue.type)} ${issue.status || ''}`)
  console.log(`${issue.message || '(no message)'}`)
  console.log(chalk.gray(issue.rule || ''))
  const comp = issue.component?.split(':').slice(1).join(':') || issue.component
  if (comp) console.log(chalk.blue(comp) + (issue.line ? ':' + issue.line : ''))
  if (issue.textRange) {
    console.log(`Lines ${issue.textRange.startLine}-${issue.textRange.endLine}`)
  }
  console.log('')
}

export function printHotspots({ projectKey, branch, hotspots }) {
  console.log(`\n🔥 Hotspots for: ${chalk.bold(projectKey || '')}${branch ? ' ('+branch+')' : ''} (showing ${hotspots.length})\n`)
  if (!hotspots.length) { console.log(chalk.green('No hotspots.')); return }
  for (const h of hotspots) {
    const sev = h.vulnerabilityProbability || h.severity || 'UNKNOWN'
    const sevColor = sev === 'HIGH' ? chalk.red : sev === 'MEDIUM' ? chalk.yellow : chalk.gray
    console.log(`${sevColor(sev.padEnd(6))} ${h.securityCategory || ''} ${h.message}`)
    console.log(`  ${chalk.dim(h.key)}`)
    const comp = h.component?.split(':').slice(1).join(':') || h.component
    if (comp) console.log(`  ${chalk.blue(comp)}${h.line ? ':' + h.line : ''}`)
    console.log('')
  }
}

export function printHotspot(h) {
  console.log(`\n🔥 Hotspot ${chalk.dim(h.key)}\n`)
  const sev = h.vulnerabilityProbability || h.severity || 'UNKNOWN'
  console.log(`${sev} ${h.securityCategory || ''}`)
  console.log(h.message || '')
  const comp = h.component?.split(':').slice(1).join(':') || h.component
  if (comp) console.log(chalk.blue(comp) + (h.line ? ':' + h.line : ''))
  console.log('')
}

export function printRules({ rules }) {
  console.log(`\n📐 Rules (showing ${rules.length})\n`)
  if (!rules.length) { console.log(chalk.yellow('No rules matched.')); return }
  for (const r of rules) {
    const sev = r.severity || ''
    const lang = r.lang || ''
    console.log(`${sev.padEnd(8)} ${chalk.magenta(r.key)} ${r.name}`)
    console.log(`  ${chalk.gray(lang)} ${(r.tags||[]).map(t=>'#'+t).join(' ')}`)
  }
  console.log('')
}

export function printRule(rule) {
  console.log(`\n📐 Rule ${chalk.magenta(rule.key)}\n`)
  console.log(rule.name)
  console.log(chalk.gray(rule.lang || ''))
  if (rule.htmlDesc) {
    const text = rule.htmlDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    console.log('\n' + text + '\n')
  }
}

export function printMeasures(componentData) {
  const comp = componentData.key || componentData.id || 'component'
  console.log(`\n📏 Measures for ${chalk.bold(comp)}\n`)
  const measures = componentData.measures || []
  const pad = Math.max(10, ...measures.map(m=> (m.metric||'').length)) + 2
  for (const m of measures) {
    console.log(`${(m.metric||'').padEnd(pad)} ${chalk.cyan(m.value ?? '—')}`)
  }
  console.log('')
}

export function printMeasuresHistory(history) {
  const measures = history.measures || []
  console.log(`\n🕒 Measures History\n`)
  for (const m of measures) {
    console.log(`Metric: ${chalk.bold(m.metric)}`)
    const hist = (m.history||[]).map(h=>({d:h.date, v:h.value}))
    if (!hist.length) { console.log('  (no data)'); continue }
    const numeric = hist.map(h=> parseFloat(h.v)).filter(v=> !isNaN(v))
    let spark = ''
    if (numeric.length === hist.length) {
      const chars = '▁▂▃▄▅▆▇█'
      const min = Math.min(...numeric)
      const max = Math.max(...numeric)
      const rng = max - min || 1
      spark = numeric.map(v=> chars[Math.round(((v - min)/rng)*(chars.length-1))]).join('')
      console.log(`  ${spark}`)
    }
    const last = hist[hist.length-1]
    console.log(`  Latest: ${chalk.cyan(last.v)} at ${last.d}`)
  }
  console.log('')
}

export function printComponentTree(tree) {
  const base = tree.baseComponent || {}
  const comps = tree.components || []
  console.log(`\n🌳 Component Tree: ${chalk.bold(base.key || '')}\n`)
  for (const c of comps) {
    const metrics = (c.measures||[]).map(m=> `${m.metric}=${m.value}`).join(' ')
    console.log(`${c.qualifier || ''} ${chalk.blue(c.key || c.id || '')} ${metrics}`)
  }
  console.log('')
}

export function printDuplications(dups) {
  const dupes = dups.duplications || []
  console.log(`\n🧬 Duplications\n`)
  if (!dupes.length) { console.log('No duplications segments.'); return }
  for (const d of dupes) {
    const blocks = d.blocks || []
    console.log(`Segment (${blocks.length} blocks)`)
    for (const b of blocks) {
      console.log(`  ${chalk.blue(b.from)} lines ${b.startLine}-${b.endLine}`)
    }
  }
  console.log('')
}

export function printQualityProfiles(profiles) {
  console.log(`\n🛠️ Quality Profiles (${profiles.length})\n`)
  for (const p of profiles) {
    console.log(`${chalk.bold(p.language || '')} ${chalk.green(p.name)} ${p.isDefault ? '[default]' : ''} ${p.isInherited ? '[inherited]' : ''}`)
  }
  console.log('')
}

export function printQualityGate(gate) {
  console.log(`\n🚦 Quality Gate Status\n`)
  const status = gate.status === 'OK' ? chalk.green('PASSED') : chalk.red(gate.status)
  console.log(`Status: ${status}`)
  if (Array.isArray(gate.conditions)) {
    for (const c of gate.conditions) {
      const met = c.status === 'OK'
      const line = `${met ? chalk.green('✔') : chalk.red('✖')} ${c.metricKey} ${c.comparator || ''} ${c.errorThreshold || ''} => ${c.value || ''}`
      console.log('  ' + line)
    }
  }
  console.log('')
}
