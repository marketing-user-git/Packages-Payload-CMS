import { CollectionConfig } from 'payload'

const Clients: CollectionConfig = {
  slug: 'clients',
  access: {
    read: () => true,
    update: () => true,
  },
  admin: {
    useAsTitle: 'clientId',
    defaultColumns: ['clientId', 'region', 'pkg', 'status', 'contacted', 'deposited'],
  },
  fields: [
    { name: 'clientId',   type: 'text',    required: true, unique: true, label: 'Client ID' },
    { name: 'region',     type: 'select',  required: true, label: 'Region',
      options: ['Brazil','South Africa','INT','MENA','LATAM','ROW'] },
    { name: 'country',    type: 'text',    label: 'Country' },
    { name: 'culture',    type: 'text',    label: 'Culture' },
    { name: 'pkg',        type: 'select',  label: 'Package',
      options: ['Platinum','Gold','Silver','Bronze'] },
    { name: 'ams',        type: 'text',    label: 'Account Manager(s)' },
    { name: 'status',     type: 'select',  defaultValue: 'Active', label: 'Journey Status',
      options: ['Active','Converted','Completed','Excluded'] },
    { name: 'contacted',  type: 'checkbox', defaultValue: false, label: 'Contacted' },
    { name: 'deposited',  type: 'checkbox', defaultValue: false, label: 'Deposited' },
    { name: 'submitted',  type: 'date',    label: 'Submission Date' },
    { name: 'converted',  type: 'date',    label: 'Conversion Date' },
  ],
}

export default Clients