export function debugLog(step: string, details?: unknown) {
  const timestamp = new Date().toISOString()
  if (details === undefined) {
    console.info(`[Relay ${timestamp}] ${step}`)
  } else {
    console.info(`[Relay ${timestamp}] ${step}`, details)
  }
}

export function debugError(step: string, error: unknown) {
  console.error(`[Relay ${new Date().toISOString()}] ${step}`, error)
}
