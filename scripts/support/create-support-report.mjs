#!/usr/bin/env node

import { createSupportReport, encodeSupportReport, writeSupportReport } from '../../packages/support-bundle/index.mjs'

function usage() {
  return [
    'Usage: node scripts/support/create-support-report.mjs',
    '  --deck <explicit.pitchdeck> --third-party <THIRD_PARTY.md>',
    '  --commit <full-git-sha> --app-version <semver>',
    '  --platform <darwin|linux> --architecture <arm64|x64>',
    '  [--output <support-report.json>]',
  ].join('\n')
}

function parseArguments(argumentsList) {
  const values = {}
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index]
    const value = argumentsList[index + 1]
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) throw new Error(usage())
    const name = flag.slice(2)
    if (!['deck', 'third-party', 'commit', 'app-version', 'platform', 'architecture', 'output'].includes(name)) {
      throw new Error(usage())
    }
    values[name] = value
  }
  for (const required of ['deck', 'third-party', 'commit', 'app-version', 'platform', 'architecture']) {
    if (!values[required]) throw new Error(usage())
  }
  return values
}

try {
  const values = parseArguments(process.argv.slice(2))
  const request = {
    deckPath: values.deck,
    thirdPartyPath: values['third-party'],
    commitSha: values.commit,
    appVersion: values['app-version'],
    platform: values.platform,
    architecture: values.architecture,
  }
  if (values.output) {
    const receipt = await writeSupportReport({ ...request, outputPath: values.output })
    process.stdout.write(`${JSON.stringify(receipt)}\n`)
  } else {
    process.stdout.write(encodeSupportReport(await createSupportReport(request)))
  }
} catch (error) {
  process.stderr.write(`${error.name ?? 'SupportBundleFailure'}: ${error.message}\n`)
  process.exitCode = 1
}
