import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export const interfaceScaleSteps = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])
export const defaultPreferences = Object.freeze({ interfaceScale: 1, artboardZoom: 0.35 })

function defaults() {
  return { ...defaultPreferences }
}

function invalid(message) {
  return Object.assign(new Error(message), { name: 'InvalidPreferences' })
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export function parsePreferences(source) {
  let value
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw invalid(`Preferences are not valid JSON: ${error.message}`)
  }
  const keys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).sort()
    : []
  if (
    JSON.stringify(keys) !== JSON.stringify(['artboardZoom', 'interfaceScale', 'schemaVersion'])
    || value.schemaVersion !== 1
    || !interfaceScaleSteps.includes(value.interfaceScale)
    || !Number.isFinite(value.artboardZoom)
    || value.artboardZoom < 0.1
    || value.artboardZoom > 4
  ) {
    throw invalid('Preferences are invalid or unsupported')
  }
  return { interfaceScale: value.interfaceScale, artboardZoom: value.artboardZoom }
}

export async function loadPreferencesFile(path, { quarantineId = randomUUID() } = {}) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { preferences: defaults(), recovered: false, quarantinePath: null, warning: null }
    }
    return {
      preferences: defaults(),
      recovered: true,
      quarantinePath: null,
      warning: `Preferences could not be read; defaults restored: ${error.message}`,
    }
  }

  try {
    return {
      preferences: parsePreferences(source),
      recovered: false,
      quarantinePath: null,
      warning: null,
    }
  } catch (error) {
    const quarantinePath = `${path}.invalid-${quarantineId}`
    try {
      await rename(path, quarantinePath)
      await syncDirectory(dirname(path))
      return {
        preferences: defaults(),
        recovered: true,
        quarantinePath,
        warning: `${error.message}; invalid file moved aside`,
      }
    } catch (quarantineError) {
      return {
        preferences: defaults(),
        recovered: true,
        quarantinePath: null,
        warning: `${error.message}; invalid file could not be moved aside: ${quarantineError.message}`,
      }
    }
  }
}
