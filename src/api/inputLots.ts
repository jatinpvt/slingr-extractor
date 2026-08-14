import type { SlingrClient } from './slingrClient.js';
import type { InputLot } from '../types.js';

export function getInputLot(client: SlingrClient, inputLotId: string): Promise<InputLot> {
  return client.getRecord<InputLot>('productionManagement.inputLots', inputLotId);
}
