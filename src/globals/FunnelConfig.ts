import type { GlobalConfig, Field } from 'payload'

const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

export const ROW_SEQUENCE = [
  '01_tv_account_types',
  '02_start_trading_easy',
  '03_know_trading_costs',
  '04_welcome_bonus',
  '05_trading_became_easier',
  '06_platform_choice',
  '07_mt5',
  '08_account_types_reminder',
  '09_gold',
  '10_vanilla_options',
  '11_tv_integration',
  '12_easytrade',
  '13_trade_on_mt5',
  '14_demo_trading',
  '15_account_types_final',
] as const

export const CNJP_SEQUENCE = [
  '02_start_trading_easy',
  '03_know_trading_costs',
  '04_welcome_bonus',
  '05_trading_became_easier',
  '06_platform_choice',
  '09_gold',
  '10_vanilla_options',
  '11_tv_integration',
  '12_easytrade',
  '14_demo_trading',
] as const

export const RULE_OPS = [
  { label: 'equals', value: 'equals' },
  { label: 'not equals', value: 'not_equals' },
  { label: 'in (comma list)', value: 'in' },
  { label: 'not in (comma list)', value: 'not_in' },
  { label: 'prefix (startsWith)', value: 'prefix' },
  { label: 'greater than', value: 'greater_than' },
  { label: 'less than', value: 'less_than' },
  { label: 'exists', value: 'exists' },
  { label: 'does not exist', value: 'not_exists' },
] as const

const ruleFields = (): Field[] => [
  {
    name: 'match',
    type: 'select',
    defaultValue: 'any',
    options: [
      { label: 'ANY condition (OR)', value: 'any' },
      { label: 'ALL conditions (AND)', value: 'all' },
    ],
    admin: { description: 'How to combine the conditions below.' },
  },
  {
    name: 'conditions',
    type: 'array',
    admin: {
      description: "Tag tests against the user's OneSignal tags. Empty rule matches nobody.",
    },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'field',
            type: 'text',
            required: true,
            admin: {
              width: '40%',
              description:
                'OneSignal tag, e.g. STATUS, Country, Culture, CycleStatusName, TotalDepositsUSD',
            },
          },
          {
            name: 'op',
            type: 'select',
            required: true,
            options: [...RULE_OPS],
            admin: { width: '30%' },
          },
          {
            name: 'value',
            type: 'text',
            admin: {
              width: '30%',
              description: 'For in/not_in use a comma list. Not needed for exists/not_exists.',
            },
          },
        ],
      },
    ],
  },
]

export const FunnelConfig: GlobalConfig = {
  slug: 'funnel-config',
  label: 'Funnel Config',
  admin: { group: 'RegFunnelOps' },
  access: { read: isInternal, update: isInternal },
  fields: [
    {
      type: 'collapsible',
      label: 'Timing & status',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'statusRegisteredValue',
              type: 'text',
              required: true,
              defaultValue: 'NON ACTIVE',
              admin: { width: '50%', description: 'Case-sensitive. Entry requires this STATUS.' },
            },
            {
              name: 'statusActiveValue',
              type: 'text',
              required: true,
              defaultValue: 'ACTIVE',
              admin: {
                width: '50%',
                description: 'Case-sensitive. Convenience default for conversion.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'firstDelayHours',
              type: 'number',
              required: true,
              defaultValue: 1,
              admin: { width: '33%' },
            },
            {
              name: 'intervalDays',
              type: 'number',
              required: true,
              defaultValue: 2,
              admin: { width: '33%' },
            },
            {
              name: 'maxTagSyncRetries',
              type: 'number',
              required: true,
              defaultValue: 5,
              admin: {
                width: '34%',
                description:
                  'On enrollment, if OneSignal tags are not synced yet, retry this many times before discarding.',
              },
            },
          ],
        },
        {
          name: 'enrollmentCutoffDate',
          type: 'date',
          admin: {
            description:
              'Only enroll users registered on/after this date. Protects against back-filling the whole DB. Leave empty to allow all.',
          },
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Region & OneSignal app routing',
      fields: [
        {
          name: 'cnjpCountries',
          type: 'array',
          label: 'Countries on the compressed (10-email) sequence',
          defaultValue: [{ value: 'China' }, { value: 'Japan' }],
          fields: [{ name: 'value', type: 'text', required: true }],
        },
        {
          name: 'chinaCountries',
          type: 'array',
          label: 'Countries that send via the CHINA OneSignal app (Japan NOT here)',
          defaultValue: [{ value: 'China' }],
          fields: [{ name: 'value', type: 'text', required: true }],
        },
        {
          name: 'oneSignalApps',
          type: 'group',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'globalAppId', type: 'text', admin: { width: '50%' } },
                {
                  name: 'globalKeyRef',
                  type: 'text',
                  admin: {
                    width: '50%',
                    description: 'n8n credential name for the global REST key.',
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'chinaAppId', type: 'text', admin: { width: '50%' } },
                {
                  name: 'chinaKeyRef',
                  type: 'text',
                  admin: {
                    width: '50%',
                    description: 'n8n credential name for the china REST key.',
                  },
                },
              ],
            },
            {
              name: 'identityAppId',
              type: 'text',
              admin: {
                description:
                  'App queried to READ tags/subscriptions at enrollment when a dedicated identity app is used.',
              },
            },
          ],
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Sequences',
      fields: [
        {
          name: 'sequenceRow',
          type: 'array',
          label: 'ROW sequence (15 ordered step_ids)',
          fields: [{ name: 'stepId', type: 'text', required: true }],
          defaultValue: ROW_SEQUENCE.map((stepId) => ({ stepId })),
        },
        {
          name: 'sequenceCnjp',
          type: 'array',
          label: 'CN/JP sequence (10 ordered step_ids)',
          fields: [{ name: 'stepId', type: 'text', required: true }],
          defaultValue: CNJP_SEQUENCE.map((stepId) => ({ stepId })),
        },
      ],
    },

    {
      name: 'templates',
      type: 'array',
      label: 'Template map — one row per (stepId × variant)',
      admin: {
        description:
          'global UUID for ROW + Japan. china UUID for country===China. A CN step needs both.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'stepId', type: 'text', required: true, admin: { width: '40%' } },
            {
              name: 'variant',
              type: 'select',
              required: true,
              admin: { width: '20%' },
              options: [
                { label: 'A', value: 'A' },
                { label: 'B', value: 'B' },
              ],
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'global', type: 'text', admin: { width: '50%' } },
            { name: 'china', type: 'text', admin: { width: '50%' } },
          ],
        },
      ],
    },

    {
      type: 'collapsible',
      label: 'Entry exclusions & rules',
      fields: [
        {
          name: 'restrictedCountries',
          type: 'array',
          label: 'Restricted countries — never enter the funnel',
          fields: [{ name: 'value', type: 'text', required: true }],
        },
        {
          name: 'restrictionRules',
          type: 'array',
          label: 'User exclusion rules — user NEVER enters if any rule matches',
          admin: { description: 'Generic OneSignal tag rules evaluated by the orchestration layer.' },
          fields: ruleFields(),
        },
        {
          name: 'stepRestrictions',
          type: 'array',
          label: 'Step restrictions — block a specific email for matching users',
          admin: {
            description:
              'User stays in the funnel but skips this step. Works for any country/culture/tag.',
          },
          fields: [{ name: 'stepId', type: 'text', required: true }, ...ruleFields()],
        },
        {
          name: 'conversionRules',
          type: 'array',
          label: 'Conversion rules — user EXITS (converted) if any rule matches',
          admin: {
            description:
              'e.g. STATUS equals ACTIVE. Checked before every send.',
          },
          defaultValue: [
            { match: 'any', conditions: [{ field: 'STATUS', op: 'equals', value: 'ACTIVE' }] },
          ],
          fields: ruleFields(),
        },
      ],
    },
  ],
}

export default FunnelConfig
