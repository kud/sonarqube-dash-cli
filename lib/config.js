import fs from "fs"
import path from "path"
import os from "os"

// Canonical config locations only

// (Removed legacy project-level config support)

function configFilePath() {
  const xdgBase =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config")
  return path.join(xdgBase, "sonarqube-dash-cli", "config.json")
}

function readJsonIfExists(p) {
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8")
      return JSON.parse(raw)
    }
  } catch (e) {
    console.error("Failed to parse config file", p, e.message)
  }
  return {}
}

export function loadConfig(providedPath) {
  let configFromFile = {}
  let usedFile
  const cwd = process.cwd()

  if (providedPath) {
    const abs = path.isAbsolute(providedPath)
      ? providedPath
      : path.join(cwd, providedPath)
    configFromFile = readJsonIfExists(abs)
    usedFile =
      configFromFile && Object.keys(configFromFile).length ? abs : undefined
  } else {
    const c = configFilePath()
    const data = readJsonIfExists(c)
    if (Object.keys(data).length) {
      configFromFile = data
      usedFile = c
    }
  }

  const envConfig = {
    token: process.env.SONARQUBE_DASH_TOKEN,
    project: process.env.SONARQUBE_DASH_PROJECT,
    host: process.env.SONARQUBE_DASH_HOST,
    branch: process.env.SONARQUBE_DASH_BRANCH,
  }

  return { configFromFile, envConfig, usedFile }
}

export function resolveConfigPath(explicitPath) {
  if (explicitPath) {
    return path.isAbsolute(explicitPath)
      ? explicitPath
      : path.join(process.cwd(), explicitPath)
  }
  return configFilePath()
}

export function writeConfig(data, explicitPath) {
  const filePath = resolveConfigPath(explicitPath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  let current = {}
  if (fs.existsSync(filePath)) {
    try {
      current = JSON.parse(fs.readFileSync(filePath, "utf8"))
    } catch {
      // ignore parse errors, start fresh
    }
  }
  const merged = { ...current, ...data }
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + "\n", "utf8")
  return { path: filePath, data: merged }
}
