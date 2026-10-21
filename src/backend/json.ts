// Stop reading as soon as the limit is crossed, rather than buffering an
// arbitrarily large response and checking its size afterwards.
export async function boundedJson(response: Response, limit: number): Promise<unknown> {
  const length = response.headers.get('Content-Length')
  if (length && Number(length) > limit) {
    await response.body?.cancel()
    throw new Error('The service response is too large. Please try again later.')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The service returned an empty response. Please try again later.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new Error('The service response is too large. Please try again later.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown }
  catch { throw new Error('The service returned an invalid response. Please try again later.') }
}
