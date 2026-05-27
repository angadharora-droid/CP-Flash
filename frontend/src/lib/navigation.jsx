import React from 'react';

export const SHEET_URLS = {
  bankPosition: 'https://docs.google.com/spreadsheets/d/1X_e5_fMfaaMHnlKkqHpYZyWBSsaXzvHf/',
  pabloCost: 'https://docs.google.com/spreadsheets/d/1SliCSYQIhRekgYy-6YN0nn5nFtlZQooH/',
  daliCost: 'https://docs.google.com/spreadsheets/d/1cgU6utD59v57HwlunQtSBCsVfpiMwX7F/',
  mickysLeads: 'https://docs.google.com/spreadsheets/d/1jvnmwP4AaNQW54E3QVlzR9ZMj589HXZugJfhBOye_gs/'
};

export const pages = [
  ['sources', '00', 'Source Control'],
  ['bank', '01', 'Bank Position'],
  ['pnl', '02', 'Unit-wise P&L'],
  ['flags', '03', 'Flag Summary'],
  ['hotels', '04', 'Hotels'],
  ['fnb', '05', 'F&B Outlets'],
  ['rabbit', '06', 'Rabbit'],
  ['mickys', '07', "Micky's"],
  ['purosoul', '08', 'Purosoul'],
  ['settlement', '09', 'Settlement'],
  ['ai', '10', 'AI Notes'],
  ['pdf', '11', 'PDF Preview'],
  ['aop', '12', 'AOP Targets']
];

// `icon` is a Material Symbol name (rendered via `<span class="material-symbols-outlined">{icon}</span>`).
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { key: 'sources', label: 'Source Control', icon: 'dataset' },
      { key: 'bank',    label: 'Bank Position',  icon: 'account_balance_wallet' },
      { key: 'pnl',     label: 'P&L Summary',    icon: 'monitoring' },
      { key: 'flags',   label: 'Flag Summary',   icon: 'flag' }
    ]
  },
  {
    label: 'Unit Data',
    items: [
      { key: 'hotels',   label: 'Hotels',      icon: 'hotel' },
      { key: 'fnb',      label: 'F&B Outlets', icon: 'restaurant' },
      { key: 'rabbit',   label: 'Rabbit',      icon: 'delivery_dining' },
      { key: 'mickys',   label: "Micky's",     icon: 'inventory_2' },
      { key: 'purosoul', label: 'Purosoul',    icon: 'factory' }
    ]
  },
  {
    label: 'Close of Day',
    items: [
      { key: 'settlement', label: 'Settlement', icon: 'point_of_sale' },
      { key: 'ai',         label: 'AI Notes',   icon: 'auto_awesome' },
      { key: 'pdf',        label: 'PDF Preview', icon: 'picture_as_pdf' }
    ]
  },
  {
    label: 'Configuration',
    items: [
      { key: 'aop', label: 'AOP Targets', icon: 'flag' }
    ]
  }
];

export const NAV_ITEM_BY_KEY = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]));

export const BOTTOM_TABS = [
  { key: 'bank', label: 'Bank' },
  { key: 'pnl', label: 'P&L' },
  { key: 'flags', label: 'Flags' },
  { key: 'settlement', label: 'Settlement' }
];
