import axios from "axios"

export async function apiRequest({ host, token, path, params = {}, method = "GET", data }) {
  const base = host.replace(/\/$/, "")
  const url = path.startsWith("/") ? base + path : base + "/" + path
  const auth = { username: token, password: "" }
  const res = await axios.request({ url, method, auth, params, data })
  return res.data
}

// Fetch aggregated issues facets (summary). Default facets: severities,types,statuses
export async function fetchIssuesSummary({ host, token, project, branch, facets }) {
  const facetList = (facets && facets.trim()) || "severities,types,statuses"
  const data = await apiRequest({
    host,
    token,
    path: "/api/issues/search",
    params: {
      componentKeys: project,
      p: 1,
      ps: 1, // we don't need the list, just facets
      facets: facetList,
      ...(branch ? { branch } : {}),
    },
  })
  const outFacets = {}
  if (Array.isArray(data.facets)) {
    for (const facet of data.facets) {
      const map = {}
      for (const v of facet.values || []) map[v.val] = v.count
      outFacets[facet.property] = map
    }
  }
  const total = data.paging?.total ?? data.total ?? 0
  return { projectKey: project, branch, total, facets: outFacets, requestedFacets: facetList.split(",") }
}

export async function fetchIssue({ host, token, issueKey }) {
  const data = await apiRequest({ host, token, path: "/api/issues/show", params: { issue: issueKey } })
  return data.issue || null
}

export async function fetchHotspots({ host, token, project, branch, status, severity, limit = 50 }) {
  const params = { projectKey: project, p: 1, ps: Math.min(limit, 500) }
  if (branch) params.branch = branch
  if (status) params.status = status
  if (severity) params.severity = severity
  const data = await apiRequest({ host, token, path: "/api/hotspots/search", params })
  return { projectKey: project, branch, hotspots: data.hotspots || [], paging: data.paging }
}

export async function fetchHotspot({ host, token, hotspotKey }) {
  const data = await apiRequest({ host, token, path: "/api/hotspots/show", params: { hotspot: hotspotKey } })
  return data.hotspot || null
}

export async function fetchRules({ host, token, query, languages, tags, repository, activeSeverities, limit = 50 }) {
  const params = { p: 1, ps: Math.min(limit, 500) }
  if (query) params.q = query
  if (languages) params.languages = languages
  if (tags) params.tags = tags
  if (repository) params.repositories = repository
  if (activeSeverities) params.severities = activeSeverities
  const data = await apiRequest({ host, token, path: "/api/rules/search", params })
  return { rules: data.rules || [], paging: data.paging }
}

export async function fetchRule({ host, token, key }) {
  const data = await apiRequest({ host, token, path: "/api/rules/show", params: { key } })
  return data.rule || null
}

export async function fetchMeasures({ host, token, component, metricKeys, branch }) {
  const params = { component, metricKeys: Array.isArray(metricKeys) ? metricKeys.join(',') : metricKeys }
  if (branch) params.branch = branch
  const data = await apiRequest({ host, token, path: "/api/measures/component", params })
  return data.component || null
}

export async function fetchMeasuresHistory({ host, token, component, metrics, branch, from, to, pageSize = 100 }) {
  const params = {
    component,
    metrics: Array.isArray(metrics) ? metrics.join(',') : metrics,
    ps: Math.min(pageSize, 500),
  }
  if (branch) params.branch = branch
  if (from) params.from = from
  if (to) params.to = to
  const data = await apiRequest({ host, token, path: "/api/measures/search_history", params })
  return data || {}
}

export async function fetchComponentTree({ host, token, component, branch, qualifiers = 'FIL', metricKeys, strategy = 'leaves', pageSize = 100 }) {
  const params = {
    component,
    qualifiers,
    strategy,
    ps: Math.min(pageSize, 500),
  }
  if (metricKeys) params.metricKeys = Array.isArray(metricKeys) ? metricKeys.join(',') : metricKeys
  if (branch) params.branch = branch
  const data = await apiRequest({ host, token, path: "/api/components/tree", params })
  return data || {}
}

export async function fetchDuplications({ host, token, project, branch, fileKey }) {
  if (!fileKey) throw new Error('fileKey required for duplications')
  const params = { key: fileKey }
  if (branch) params.branch = branch
  const data = await apiRequest({ host, token, path: "/api/duplications/show", params })
  return data || {}
}

export async function fetchQualityProfiles({ host, token, language, project }) {
  const params = {}
  if (language) params.language = language
  if (project) params.project = project
  const data = await apiRequest({ host, token, path: "/api/qualityprofiles/search", params })
  return data.profiles || []
}

export async function fetchQualityGate({ host, token, project }) {
  const data = await apiRequest({ host, token, path: "/api/qualitygates/project_status", params: { projectKey: project } })
  return data.projectStatus || null
}
