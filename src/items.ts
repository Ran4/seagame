import { Item } from './types';

export function createCutlass(gameTime: number = 0): Item {
  return {
    name: 'Cutlass', createdAt: gameTime, weight: 900,
    description: 'A short, broad sabre favoured by pirates.',
    stackable: false, quantity: 1, spoilAfter: null,
  };
}

export function createSemen(gameTime: number): Item {
  return {
    name: 'Semen', createdAt: gameTime, weight: 5,
    description: 'A viscous fluid.',
    stackable: true, quantity: 1, spoilAfter: 3600,
  };
}
