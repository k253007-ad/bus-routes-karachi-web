export async function requestJson(url: string, init: RequestInit = {}, timeout = 12_000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('The service did not allow this request. Please contact the project team.')
      if (response.status === 429) throw new Error('Too many requests. Please wait a minute before trying again.')
      throw new Error('The service is unavailable. Please try again later.')
    }
    return await boundedJson(response, 4_000_000)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection timed out. Please check your internet and try again.')
    if (error instanceof TypeError) throw new Error('Could not connect. Please check your internet and try again.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
import { boundedJson } from './json'
