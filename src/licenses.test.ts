import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { migrate } from './store/migrate';
import { cueSheetCsv, creditLine, duration, licenseWarnings, newLicense, suggestedCredit, syncLicenseLines } from './budget/licenses';
import { mediaIds } from './io/files';

describe('licenses', () => {
  it('older projects get a license list and the Licensing & Clearances account', () => {
    const old = newProject('x') as unknown as { budget: Record<string, unknown> };
    delete old.budget.licenses;
    (old.budget.accounts as { code: string }[]).splice((old.budget.accounts as { code: string }[]).findIndex((a) => a.code === '4600'), 1);
    const p = migrate(old);
    expect(p.budget.licenses).toEqual([]);
    const codes = p.budget.accounts.map((a) => a.code);
    expect(codes).toContain('4600');
    expect(codes.indexOf('4600')).toBe(codes.indexOf('4500') + 1);
  });

  it('licenses with a fee become budget lines in the right account, and leave when declined', () => {
    let p = produce(newProject('x'), (d) => {
      d.budget.licenses = [
        { ...newLicense('music'), id: 'm1', title: 'Night Drive', fee: 500, status: 'licensed' },
        { ...newLicense('stock'), id: 's1', title: 'City aerials', fee: 120, status: 'quoted' },
        { ...newLicense('font'), id: 'f1', title: 'Free font', fee: 0 },
      ];
      syncLicenseLines(d);
    });
    const lines = p.budget.lines.filter((l) => l.link?.kind === 'license');
    expect(lines.map((l) => [l.link!.id, p.budget.accounts.find((a) => a.id === l.accountId)!.code, l.rate])).toEqual([['m1', '4200', 500], ['s1', '4600', 120]]);
    p = produce(p, (d) => { d.budget.licenses[1].status = 'declined'; syncLicenseLines(d); });
    expect(p.budget.lines.filter((l) => l.link?.kind === 'license').map((l) => l.link!.id)).toEqual(['m1']);
  });

  it('adds the Licensing & Clearances account if a budget is missing it, instead of using Editorial', () => {
    const p = produce(newProject('x'), (d) => {
      d.budget.accounts = d.budget.accounts.filter((a) => a.code !== '4600');
      d.budget.licenses = [{ ...newLicense('stock'), fee: 199 }];
      syncLicenseLines(d);
    });
    const acc = p.budget.accounts.find((a) => a.code === '4600')!;
    expect(acc.name).toBe('Licensing & Clearances');
    expect(p.budget.lines.find((l) => l.link?.kind === 'license')!.accountId).toBe(acc.id);
    const codes = p.budget.accounts.map((a) => a.code);
    expect(codes.indexOf('4600')).toBe(codes.indexOf('4500') + 1);
  });

  it('suggests credit lines, works out durations and builds a cue sheet', () => {
    const song = { ...newLicense('music'), title: 'Night Drive', writers: 'A. Writer', performer: 'The Band', label: 'Indie Records' };
    expect(suggestedCredit(song)).toBe('“Night Drive”\nWritten by A. Writer\nPerformed by The Band\nCourtesy of Indie Records');
    expect(creditLine({ ...song, credit: 'Custom' })).toBe('Custom');
    expect(suggestedCredit({ ...newLicense('stock'), title: 'Aerials', source: 'Pond5' })).toBe('Aerials — Footage courtesy of Pond5');
    expect(duration({ ...song, tcIn: '01:00:10:00', tcOut: '01:02:05:12' })).toBe('1:55');
    const p = produce(newProject('x'), (d) => { d.budget.licenses = [{ ...song, id: 'm', tcIn: '01:00:10:00', tcOut: '01:02:05:00' }]; });
    const rows = cueSheetCsv(p).trim().split(/\r?\n/);
    expect(rows[0]).toMatch(/^Cue,Title,Composer/);
    expect(rows[1]).toContain('Night Drive');
    expect(rows[1]).toContain('1:55');
  });

  it('warns about uncleared music in the cut and licenses about to expire, and bundles files', () => {
    const p = produce(newProject('x'), (d) => {
      d.budget.licenses = [
        { ...newLicense('music'), id: 'a', title: 'Used', tcIn: '00:01:00', status: 'quoted' },
        { ...newLicense('stock'), id: 'b', title: 'Soon', status: 'licensed', expires: '2026-11-01', fileId: 'doc1' },
      ];
    });
    expect(licenseWarnings(p, '2026-10-19').map((w) => w.id)).toEqual(['a', 'b']);
    expect(mediaIds(p)).toContain('doc1');
  });
});
