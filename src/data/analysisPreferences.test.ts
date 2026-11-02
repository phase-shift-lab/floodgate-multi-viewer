import { disableAutomaticAnalysis, loadAnalysisEnabled, saveAnalysisEnabled } from './analysisPreferences';

describe('automatic analysis preferences', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it('defaults to on and remembers off for the selected game', () => {
    expect(loadAnalysisEnabled('a')).toBe(true);
    saveAnalysisEnabled('a', false);
    expect(loadAnalysisEnabled('a')).toBe(false);
    expect(loadAnalysisEnabled('b')).toBe(true);
    saveAnalysisEnabled('a', true);
    expect(loadAnalysisEnabled('a')).toBe(true);
  });
  it('keeps automatic setup disabled after removal until a manual on', () => {
    saveAnalysisEnabled('a', false);
    disableAutomaticAnalysis();
    expect(loadAnalysisEnabled('b')).toBe(false);
    sessionStorage.clear();
    expect(loadAnalysisEnabled('b')).toBe(false);
    saveAnalysisEnabled('b', true);
    expect(loadAnalysisEnabled('b')).toBe(true);
    expect(loadAnalysisEnabled('a')).toBe(false);
  });
  it('explicit persisted ON wins over a stale session fallback after navigation', () => {
    disableAutomaticAnalysis(); saveAnalysisEnabled('a',true);
    sessionStorage.setItem('fgmv:analysis-disabled','1');
    expect(loadAnalysisEnabled('a')).toBe(true);
    localStorage.clear(); expect(loadAnalysisEnabled('a')).toBe(false);
  });
});
