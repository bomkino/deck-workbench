export async function performNativeAction(operation, presentFailure) {
  try {
    return await operation()
  } catch (error) {
    if (error?.name === 'JobCancelled') return undefined
    const failure = Object.freeze({
      name: typeof error?.name === 'string' ? error.name : 'UnexpectedFailure',
      message: typeof error?.message === 'string' ? error.message : String(error),
    })
    await presentFailure(failure)
    return undefined
  }
}
