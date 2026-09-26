export const RULES_V1_ID = "fuzzy-city-rules/v1" as const;
export const RULES_V2_ID = "fuzzy-city-rules/v2" as const;
export type RulesId = typeof RULES_V1_ID | typeof RULES_V2_ID;

export interface SimulationRules {
  id: RulesId;
  relationship: {
    connectionWeight: number;
    tensionWeight: number;
    centerConnection: boolean;
    centerTension: boolean;
    socialNeedRelief: number;
  };
  state: {
    restEnergyPerMinute: number;
    restStressPerMinute: number;
    workEnergyPerMinute: number;
    workStressPerMinute: number;
    activeEnergyPerMinute: number;
    parkStressPerMinute: number;
    socialNeedDisconnectedPerMinute: number;
    socialNeedConnectedPerMinute: number;
    wageBasePerMinute: number;
    wageAmbitionPerMinute: number;
  };
}

export const RULES_V1: SimulationRules = {
  id: RULES_V1_ID,
  relationship: {
    connectionWeight: 0.08,
    tensionWeight: 0.06,
    centerConnection: true,
    centerTension: false,
    socialNeedRelief: 0.3,
  },
  state: {
    restEnergyPerMinute: 0.0013,
    restStressPerMinute: -0.0008,
    workEnergyPerMinute: -0.00065,
    workStressPerMinute: 0.0004,
    activeEnergyPerMinute: -0.00018,
    parkStressPerMinute: -0.0005,
    socialNeedDisconnectedPerMinute: 0.00018,
    socialNeedConnectedPerMinute: 0.00004,
    wageBasePerMinute: 0.1,
    wageAmbitionPerMinute: 0.1,
  },
};

// Frozen before the v2 mock soak. The changes correct known directional drift;
// they are not fitted to produce more dramatic stories.
export const RULES_V2: SimulationRules = {
  id: RULES_V2_ID,
  relationship: {
    connectionWeight: 0.08,
    tensionWeight: 0.06,
    centerConnection: true,
    centerTension: true,
    socialNeedRelief: 0.18,
  },
  state: {
    restEnergyPerMinute: 0.00075,
    restStressPerMinute: -0.00035,
    workEnergyPerMinute: -0.0006,
    workStressPerMinute: 0.00035,
    activeEnergyPerMinute: -0.00018,
    parkStressPerMinute: -0.00035,
    socialNeedDisconnectedPerMinute: 0.000075,
    socialNeedConnectedPerMinute: 0.000015,
    wageBasePerMinute: 0.018,
    wageAmbitionPerMinute: 0.012,
  },
};

export const CURRENT_RULES = RULES_V2;

export function rulesFor(id: string): SimulationRules {
  if (id === RULES_V1_ID) return RULES_V1;
  if (id === RULES_V2_ID) return RULES_V2;
  throw new Error(`Unsupported simulation rules: ${id}`);
}
