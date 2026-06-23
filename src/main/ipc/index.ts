import { registerAuthIpc } from './auth.ipc'
import { registerAppIpc } from './app.ipc'
import { registerBiliIpc } from './bili.ipc'
import { registerTaxonomyIpc } from './taxonomy.ipc'
import { registerAiIpc } from './ai.ipc'

export function registerAllIpc(): void {
  registerAuthIpc()
  registerAppIpc()
  registerBiliIpc()
  registerTaxonomyIpc()
  registerAiIpc()
}
