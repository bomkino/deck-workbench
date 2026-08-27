#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

import { DurableDeckSession, WorkbenchFailure } from '../../packages/document-store/index.mjs'

const QUERY_NAMES = Object.freeze(new Set([
  'deck.summary',
  'history.summary',
  'story.document',
  'slide.activeProjection',
]))

const COMMAND_NAMES = Object.freeze(new Set([
  'deck.rename',
  'content.add',
  'content.update',
  'content.remove',
  'section.add',
  'section.rename',
  'section.move',
  'section.remove',
  'slide.add',
  'slide.move',
  'slide.intent.set',
  'slide.remove',
  'designOption.applyPattern',
  'designOption.activate',
  'element.frame.update',
]))

const OPTIONS_BY_OPERATION = Object.freeze({
  query: new Set(['document', 'name', 'params']),
  command: new Set(['document', 'name', 'payload', 'expected-revision', 'command-id', 'label']),
  undo: new Set(['document']),
  redo: new Set(['document']),
})

function cliFailure(message) {
  return new WorkbenchFailure('InvalidCommand', message)
}

function parseOptions(args) {
  const [operation, ...tokens] = args
  const allowed = OPTIONS_BY_OPERATION[operation]
  if (!allowed) throw cliFailure('Operation must be query, command, undo, or redo')

  const options = {}
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index]
    const value = tokens[index + 1]
    if (!flag?.startsWith('--') || value === undefined) {
      throw cliFailure('Options must be supplied as --name value pairs')
    }
    const name = flag.slice(2)
    if (!allowed.has(name)) throw cliFailure(`Option is not allowed for ${operation}: --${name}`)
    if (Object.hasOwn(options, name)) throw cliFailure(`Option may only be supplied once: --${name}`)
    options[name] = value
  }

  if (typeof options.document !== 'string' || options.document.length === 0) {
    throw cliFailure('--document is required')
  }
  if (!options.document.endsWith('.pitchdeck')) {
    throw cliFailure('--document must identify a .pitchdeck package')
  }
  return { operation, options, packagePath: resolve(options.document) }
}

function parseJSONObject(source, optionName, fallback = undefined) {
  if (source === undefined && fallback !== undefined) return fallback
  if (typeof source !== 'string') throw cliFailure(`--${optionName} is required`)
  let value
  try {
    value = JSON.parse(source)
  } catch {
    throw cliFailure(`--${optionName} must be valid JSON`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cliFailure(`--${optionName} must be a JSON object`)
  }
  return value
}

function parseRevision(source) {
  if (!/^(0|[1-9][0-9]*)$/.test(source ?? '')) {
    throw cliFailure('--expected-revision must be a non-negative integer')
  }
  const revision = Number(source)
  if (!Number.isSafeInteger(revision)) throw cliFailure('--expected-revision is outside the safe integer range')
  return revision
}

function validateQuery(options) {
  if (!QUERY_NAMES.has(options.name)) throw cliFailure(`Unknown named query: ${String(options.name)}`)
  const params = parseJSONObject(options.params, 'params', {})
  const allowedParams = options.name === 'slide.activeProjection'
    ? new Set(['slideId', 'designOptionId'])
    : new Set()
  for (const [name, value] of Object.entries(params)) {
    if (!allowedParams.has(name)) throw cliFailure(`Query parameter is not allowed for ${options.name}: ${name}`)
    if (typeof value !== 'string' || value.length === 0) {
      throw cliFailure(`Query parameter must be a non-empty string: ${name}`)
    }
  }
  return params
}

function commandEnvelope(options) {
  if (!COMMAND_NAMES.has(options.name)) throw cliFailure(`Unknown named command: ${String(options.name)}`)
  if (typeof options['command-id'] !== 'string' || options['command-id'].length === 0) {
    throw cliFailure('--command-id is required')
  }
  if (options['command-id'].length > 256) throw cliFailure('--command-id must not exceed 256 characters')
  if (options.label !== undefined && (options.label.length === 0 || options.label.length > 256)) {
    throw cliFailure('--label must contain 1 to 256 characters')
  }
  return {
    commandId: options['command-id'],
    expectedRevision: parseRevision(options['expected-revision']),
    type: options.name,
    payload: parseJSONObject(options.payload, 'payload'),
    source: {
      kind: 'cli',
      ...(options.label === undefined ? {} : { label: options.label }),
    },
    issuedAt: new Date().toISOString(),
  }
}

async function loadKernel() {
  const source = await readFile(new URL('../../build/generated/deck-kernel.js', import.meta.url), 'utf8')
  const context = vm.createContext({ console })
  vm.runInContext(source, context, { filename: 'deck-kernel.js' })
  if (!context.DeckKernel) throw new WorkbenchFailure('KernelUnavailable', 'Generated Deck kernel is unavailable')
  return context.DeckKernel
}

export async function invoke(args) {
  const invocation = parseOptions(args)
  const kernel = await loadKernel()
  const session = await DurableDeckSession.open({ packagePath: invocation.packagePath, kernel })
  try {
    if (invocation.operation === 'query') {
      const params = validateQuery(invocation.options)
      return {
        ok: true,
        operation: 'query',
        name: invocation.options.name,
        revision: session.revision,
        value: session.query(invocation.options.name, params),
      }
    }

    if (invocation.operation === 'command') {
      const envelope = commandEnvelope(invocation.options)
      return {
        ok: true,
        operation: 'command',
        name: envelope.type,
        ...(await session.execute(envelope)),
      }
    }

    return {
      ok: true,
      operation: invocation.operation,
      ...(invocation.operation === 'undo' ? await session.undo() : await session.redo()),
    }
  } finally {
    await session.close({ save: false })
  }
}

function errorPayload(error) {
  return {
    ok: false,
    error: {
      name: typeof error?.name === 'string' && error.name !== 'Error' ? error.name : 'KernelUnavailable',
      message: typeof error?.message === 'string' ? error.message : 'Deck Workbench CLI failed',
    },
  }
}

export async function main(args = process.argv.slice(2), io = process) {
  try {
    io.stdout.write(`${JSON.stringify(await invoke(args))}\n`)
    return 0
  } catch (error) {
    io.stderr.write(`${JSON.stringify(errorPayload(error))}\n`)
    return error instanceof WorkbenchFailure && error.name === 'InvalidCommand' ? 2 : 1
  }
}

const isDirectInvocation = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectInvocation) process.exitCode = await main()
