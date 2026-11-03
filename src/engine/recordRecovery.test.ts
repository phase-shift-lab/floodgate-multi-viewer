import {afterEach,expect,it,vi} from 'vitest';
import {parseCsa} from '../domain/csa';
const flags=vi.hoisted(()=>({verified:false}));
vi.mock('./isolation',()=>({get preparationRecovery(){return flags.verified?{purpose:'watch'}:undefined;}}));
afterEach(()=>{sessionStorage.clear();vi.resetModules();flags.verified=false;});
it('restores only an explicitly requested run after a verified preparation reload',async()=>{
  const game=parseCsa('V2.2\nN+A\nN-B\nPI\n+');
  let recovery=await import('./recordRecovery');
  recovery.saveRecordRecovery('watch:test',game,3);
  vi.resetModules();recovery=await import('./recordRecovery');
  expect(recovery.hasRecordRecovery('watch:test')).toBe(false);
  recovery.saveRecordRecovery('watch:test',game,5);flags.verified=true;
  vi.resetModules();recovery=await import('./recordRecovery');
  expect(recovery.hasRecordRecovery('watch:other')).toBe(false);
  expect(recovery.peekRecordRecovery('watch:test')?.seconds).toBe(5);
  expect(recovery.takeRecordRecovery('watch:test')?.game.moveList).toHaveLength(0);
  expect(recovery.hasRecordRecovery('watch:test')).toBe(false);
});
