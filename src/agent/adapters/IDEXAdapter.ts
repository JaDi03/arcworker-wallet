/**
 * Re-export IDEXAdapter from the canonical interfaces module.
 * The full interface definition lives in ../interfaces/index.ts
 * 
 * NOTE: PoolState is a local extension not present in the canonical interface.
 */
export type { IDEXAdapter } from '../interfaces';

export interface PoolState {
    tokenA: string;
    tokenB: string;
    reservesA: string;
    reservesB: string;
    totalSupply: string;
}
