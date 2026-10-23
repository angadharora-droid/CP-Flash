import assert from 'node:assert/strict';
import test from 'node:test';
import { OUTLET_ACCOUNTS, extractAccount } from './importBankPosition.js';

const account = (name) => OUTLET_ACCOUNTS.find((entry) => entry.account === name);

test('Dhantoli imports the shifted totals and adds OD to FD exactly once', () => {
  const rows = [
    ['', 'Balance Available as per bank', '', '', '', '- 5,54,35,482.10'],
    ['Less :', 'Cheques Issued - Annex - B', '', '', '2,33,62,864', '', '2,12,62,079'],
    ['', 'Cheques in Hand', '', '', '21,00,785', '', '', 'TOTL FIXED DEPOSITE', '', '7,924'],
    ['', '', '', 'Add : OD LIMIT', '8,00,00,000.00'],
    ['', '', '', 'FD Add :', '7,924'],
    ['', '', 'Effective Available Balance', '', '', '14,20,898', '35,21,683'],
  ];
  assert.deepEqual(extractAccount(rows, account('HDFC Dhantoli')), {
    actualBalance: -55435482.1, fdTotal: 80007924, chequeTotalAmount: 23362864,
    chequesIssued: 21262079, chequesInHand: 2100785, netBalance: 3521683,
  });
  // Labels must remain usable when the source inserts rows.
  rows.unshift([], []);
  assert.equal(extractAccount(rows, account('HDFC Dhantoli')).fdTotal, 80007924);
});

test('CP NM reads Net Balance and still accepts the previous Effective Balance label', () => {
  const rows = [
    ['', 'Balance as per bank', '34,58,484'],
    ['Less :', 'Cheques Issued - Annex -B', '29,56,489', '17,12,929'],
    ['', 'Net Balance', '5,01,994', '17,45,555'],
  ];
  const expected = {
    actualBalance: 3458484, fdTotal: 0, chequeTotalAmount: 2956489,
    chequesIssued: 1712929, chequesInHand: 1243560, netBalance: 1745555,
  };
  assert.deepEqual(extractAccount(rows, account('VIJAN MOTORS SERVICE PVT. LTD.')), expected);
  rows[2][1] = 'Effective Balance';
  assert.deepEqual(extractAccount(rows, account('VIJAN MOTORS SERVICE PVT. LTD.')), expected);
});

test('ordinary OD accounts retain their single OD amount', () => {
  const rows = [
    ['', 'Balance as per bank', '-18,79,917'],
    ['', 'Cheques Issued', '1,04,299', '1,04,299'],
    ['', 'OD Limit', '22,50,000', '22,50,000'],
    ['', 'Effective Balance', '2,65,784', '2,65,784'],
  ];
  assert.equal(extractAccount(rows, account('AFVPL YES Bank')).fdTotal, 2250000);
  assert.equal(extractAccount(rows, account('AFVPL YES Bank')).netBalance, 265784);
});
