import { firebaseConfig } from './config'

// Firebase manages guest sessions and token refresh. Load authentication only
// when someone sends a contribution; route browsing needs no account.
let session: Promise<import('firebase/auth').Auth> | undefined
let signingIn: Promise<import('firebase/auth').User> | undefined

async function getSession() {
  session ||= Promise.all([import('firebase/app'), import('firebase/auth')]).then(async ([appSdk, authSdk]) => {
    const app = appSdk.getApps().find(item => item.name === 'konis-bus') || appSdk.initializeApp(firebaseConfig, 'konis-bus')
    const auth = authSdk.getAuth(app)
    await auth.authStateReady()
    return auth
  }).catch(error => { session = undefined; throw error })
  return session
}

async function authenticateGuest() {
  try {
    const auth = await getSession()
    const { signInAnonymously } = await import('firebase/auth')
    if (!auth.currentUser) {
      signingIn ||= signInAnonymously(auth).then(result => result.user).finally(() => { signingIn = undefined })
      await signingIn
    }
    const user = auth.currentUser!
    return { uid: user.uid, token: await user.getIdToken() }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (['auth/app-not-authorized', 'auth/invalid-api-key', 'auth/operation-not-allowed', 'auth/unauthorized-domain', 'auth/requests-from-referer-are-blocked', 'auth/requests-from-android-client-are-blocked'].includes(code)) {
      throw new Error('Sending messages is temporarily unavailable. Please contact the project team.')
    }
    throw new Error('Could not connect to the submission service. Check your internet and try again. If this continues, contact the project team.')
  }
}

export async function guestIdentity() {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([authenticateGuest(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Could not connect to the submission service in time. Please check your internet and try again.')), 12_000)
    })])
  } finally { clearTimeout(timer) }
}
