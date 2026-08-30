function defaultDelay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

export async function settleRuntimeViewport({
  readViewport,
  requestedViewport,
  delay = defaultDelay,
  maxAttempts = 80,
  delayMilliseconds = 25,
}) {
  let observed = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    observed = await readViewport()
    if (observed.width === requestedViewport.width && observed.height === requestedViewport.height) {
      return { attempts: attempt, viewport: observed }
    }
    if (attempt < maxAttempts) await delay(delayMilliseconds)
  }
  throw Object.assign(
    new Error(
      `Runtime viewport did not settle at ${requestedViewport.width}x${requestedViewport.height}; observed ${observed?.width ?? 'unknown'}x${observed?.height ?? 'unknown'}`,
    ),
    { name: 'RuntimeUISetupFailed' },
  )
}
