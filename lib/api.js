import axios from "axios"

export async function getProjectStatus({ token, host, project, branch }) {
  const auth = {
    username: token,
    password: "",
  }

  // Fetch Quality Gate
  const gateParams = { projectKey: project }
  if (branch) gateParams.branch = branch
  const gateRes = await axios.get(
    `${host.replace(/\/$/, "")}/api/qualitygates/project_status`,
    {
      auth,
      params: gateParams,
    },
  )

  // Fetch Metrics
  const metricKeys = [
    "bugs",
    "vulnerabilities",
    "code_smells",
    "coverage",
    "duplicated_lines_density",
  ].join(",")

  const measureParams = { component: project, metricKeys }
  if (branch) measureParams.branch = branch
  const metricRes = await axios.get(
    `${host.replace(/\/$/, "")}/api/measures/component`,
    {
      auth,
      params: measureParams,
    },
  )

  const qualityGate = gateRes.data.projectStatus || {}
  // Inject project key for downstream display (SonarQube API doesn't include it)
  if (!qualityGate.project) qualityGate.project = project

  return {
    projectKey: project,
    branch,
    qualityGate,
    metrics: metricRes.data.component.measures || [],
  }
}

export async function getIssues({
  token,
  host,
  project,
  branch,
  severities,
  types,
  statuses,
  limit = 10,
}) {
  const auth = { username: token, password: "" }
  const params = { componentKeys: project, p: 1, ps: Math.min(limit, 500) }
  if (branch) params.branch = branch
  if (severities) params.severities = severities
  if (types) params.types = types
  if (statuses) params.statuses = statuses

  const res = await axios.get(`${host.replace(/\/$/, "")}/api/issues/search`, {
    auth,
    params,
  })
  return {
    projectKey: project,
    branch,
    paging: res.data.paging,
    issues: (res.data.issues || []).slice(0, limit),
  }
}

// Fetch source snippet for an issue (best-effort). We derive the file key from issue.component
// and request its source. Then we slice around the issue.line or textRange.
export async function getIssueSource({ token, host, issue, contextLines = 5 }) {
  if (!issue || !issue.component) return null
  const auth = { username: token, password: "" }
  const base = host.replace(/\/$/, "")
  try {
    // /api/sources/raw?key=componentKey returns raw file text (SonarQube 9+). Fallback to /api/sources/show.
    const key = issue.component
    let content
    try {
      const raw = await axios.get(`${base}/api/sources/raw`, {
        auth,
        params: { key },
      })
      content = raw.data
    } catch (e) {
      const show = await axios.get(`${base}/api/sources/show`, {
        auth,
        params: { key },
      })
      // show.data.sources is an array of {line, code}
      if (show.data && Array.isArray(show.data.sources)) {
        content = show.data.sources.map((l) => l.code).join("\n")
      } else {
        return null
      }
    }
    if (!content) return null
    const lines = content.split(/\r?\n/)
    let focusLine = issue.line || issue.textRange?.startLine
    if (!focusLine) return { content, snippet: null }
    // Convert to 1-based index safety
    const idx = Math.max(1, focusLine)
    const start = Math.max(1, idx - contextLines)
    const end = Math.min(lines.length, idx + contextLines)
    const snippetLines = []
    for (let ln = start; ln <= end; ln++) {
      const prefix = ln === idx ? ">" : " "
      snippetLines.push(
        `${prefix} ${ln.toString().padStart(4)} | ${lines[ln - 1]}`,
      )
    }
    return { content, snippet: snippetLines.join("\n"), start, end, focus: idx }
  } catch (err) {
    return null
  }
}

export async function getBranches({ token, host, project }) {
  const auth = { username: token, password: "" }
  const base = host.replace(/\/$/, "")
  try {
    const res = await axios.get(`${base}/api/project_branches/list`, {
      auth,
      params: { project },
    })
    return res.data.branches || []
  } catch {
    return []
  }
}
