import axios from "axios"
import { apiRequest } from "./api-helpers.js"

export async function getProjectStatus({ token, host, project, branch }) {
  const gateParams = { projectKey: project }
  if (branch) gateParams.branch = branch
  const gateRes = await apiRequest({
    host,
    token,
    path: "/api/qualitygates/project_status",
    params: gateParams,
  })

  const metricKeys = [
    "bugs",
    "vulnerabilities",
    "code_smells",
    "coverage",
    "duplicated_lines_density",
  ].join(",")
  const measureParams = { component: project, metricKeys }
  if (branch) measureParams.branch = branch
  const metricRes = await apiRequest({
    host,
    token,
    path: "/api/measures/component",
    params: measureParams,
  })

  const qualityGate = gateRes.projectStatus || {}
  if (!qualityGate.project) qualityGate.project = project
  return {
    projectKey: project,
    branch,
    qualityGate,
    metrics: metricRes.component?.measures || [],
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
  const params = { componentKeys: project, p: 1, ps: Math.min(limit, 500) }
  if (branch) params.branch = branch
  if (severities) params.severities = severities
  if (types) params.types = types
  if (statuses) params.statuses = statuses

  const res = await apiRequest({ host, token, path: "/api/issues/search", params })
  return {
    projectKey: project,
    branch,
    paging: res.paging,
    issues: (res.issues || []).slice(0, limit),
  }
}

// Fetch source snippet for an issue (best-effort). We derive the file key from issue.component
// and request its source. Then we slice around the issue.line or textRange.
export async function getIssueSource({ token, host, issue, contextLines = 5 }) {
  if (!issue || !issue.component) return null
  try {
    const key = issue.component
    let content
    try {
      const raw = await apiRequest({ host, token, path: "/api/sources/raw", params: { key } })
      content = raw
    } catch (e) {
      const show = await apiRequest({ host, token, path: "/api/sources/show", params: { key } })
      if (show && Array.isArray(show.sources)) {
        content = show.sources.map((l) => l.code).join("\n")
      } else {
        return null
      }
    }
    if (!content) return null
    const lines = content.split(/\r?\n/)
    let focusLine = issue.line || issue.textRange?.startLine
    if (!focusLine) return { content, snippet: null }
    const idx = Math.max(1, focusLine)
    const start = Math.max(1, idx - contextLines)
    const end = Math.min(lines.length, idx + contextLines)
    const snippetLines = []
    for (let ln = start; ln <= end; ln++) {
      const prefix = ln === idx ? ">" : " "
      snippetLines.push(`${prefix} ${ln.toString().padStart(4)} | ${lines[ln - 1]}`)
    }
    return { content, snippet: snippetLines.join("\n"), start, end, focus: idx }
  } catch (err) {
    return null
  }
}

export async function getBranches({ token, host, project }) {
  try {
    const res = await apiRequest({
      host,
      token,
      path: "/api/project_branches/list",
      params: { project },
    })
    return res.branches || []
  } catch {
    return []
  }
}
