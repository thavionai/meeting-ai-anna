// Provider selection. AI_PROVIDER=anna routes through Anna; AI_PROVIDER=byok
// (default) uses the user's own key. BYOK is never removed — Anna is additive.

import { AI_PROVIDER } from '../config.mjs'
import { createByokProvider } from './byokProvider.mjs'
import { createAnnaProvider } from './annaProvider.mjs'

export function resolveProvider(name = AI_PROVIDER) {
  switch (name) {
    case 'anna':
      return createAnnaProvider()
    case 'byok':
    default:
      return createByokProvider()
  }
}

export const SUPPORTED_PROVIDERS = ['byok', 'anna']
