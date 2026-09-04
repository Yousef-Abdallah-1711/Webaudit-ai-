/** Types for the deliberately-plain-JS fixture in `index.js` — see its own module note. */
export declare const FS_READ_SOURCE: string;
export declare const FS_WRITE_SOURCE: string;
export declare const NETWORK_SOURCE: string;
export declare const ENV_READ_SOURCE: string;
export declare const PROCESS_SPAWN_SOURCE: string;
export declare const ALLOCATION_BOMB_SOURCE: string;
export declare const CONSTRUCTOR_CHAIN_SOURCE: string;
export declare const CONSTRUCTOR_CHAIN_REVERIFY_SOURCE: string;
export declare const BENIGN_SOURCE: string;
export declare const HOSTILE_SOURCES: {
  readonly fsRead: string;
  readonly fsWrite: string;
  readonly network: string;
  readonly envRead: string;
  readonly processSpawn: string;
  readonly allocationBomb: string;
};
