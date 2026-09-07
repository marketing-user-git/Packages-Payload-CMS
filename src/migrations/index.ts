import * as migration_20260905_210931_baseline_existing_schema from './20260905_210931_baseline_existing_schema';
import * as migration_20260905_211125_add_regfunnelops_collections from './20260905_211125_add_regfunnelops_collections';
import * as migration_20260907_075443_add_regfunnelops_rules from './20260907_075443_add_regfunnelops_rules';

export const migrations = [
  {
    up: migration_20260905_210931_baseline_existing_schema.up,
    down: migration_20260905_210931_baseline_existing_schema.down,
    name: '20260905_210931_baseline_existing_schema',
  },
  {
    up: migration_20260905_211125_add_regfunnelops_collections.up,
    down: migration_20260905_211125_add_regfunnelops_collections.down,
    name: '20260905_211125_add_regfunnelops_collections',
  },
  {
    up: migration_20260907_075443_add_regfunnelops_rules.up,
    down: migration_20260907_075443_add_regfunnelops_rules.down,
    name: '20260907_075443_add_regfunnelops_rules'
  },
];
