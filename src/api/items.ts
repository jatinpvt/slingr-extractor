import type { SlingrClient } from './slingrClient.js';
import type { ScmItem } from '../types.js';

export function getScmItem(client: SlingrClient, itemId: string): Promise<ScmItem> {
  return client.getRecord<ScmItem>('scm.items', itemId);
}
