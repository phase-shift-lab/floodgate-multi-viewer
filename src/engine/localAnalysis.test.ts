import { LocalAnalysis, type AnalysisState } from './localAnalysis';

class WorkerStub {
  static instances: WorkerStub[] = [];
  commands: string[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminated = false;
  constructor() { WorkerStub.instances.push(this); }
  postMessage(data: { command?: string }) { if (data.command) this.commands.push(data.command); }
  terminate() { this.terminated = true; }
  emit(data: unknown) { this.onmessage?.({ data }); }
}

describe('shared local analysis scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', WorkerStub);
    WorkerStub.instances = [];
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('serializes panels and discards a cancelled search before switching position', async () => {
    const service = new LocalAnalysis();
    const a = vi.fn<(state: AnalysisState) => void>(), b = vi.fn<(state: AnalysisState) => void>();
    const cancelA = service.request('a', 'position-a', '+', a);
    const cancelB = service.request('b', 'position-b', '-', b);
    await Promise.resolve();
    const worker = WorkerStub.instances[0];
    expect(WorkerStub.instances).toHaveLength(1);
    worker.emit({ type: 'ready' });
    expect(worker.commands.filter((command) => command.startsWith('position'))).toEqual(['position sfen position-a']);
    cancelA();
    expect(worker.commands.at(-1)).toBe('stop');
    worker.emit({ type: 'line', line: 'info depth 5 score cp 999' });
    expect(a.mock.calls.some(([state]) => state.score)).toBe(false);
    worker.emit({ type: 'line', line: 'bestmove 7g7f' });
    expect(worker.commands.at(-1)).toBe('go movetime 500');
    worker.emit({ type: 'line', line: 'info depth 8 score cp 120' });
    worker.emit({ type: 'line', line: 'bestmove 3c3d' });
    expect(b).toHaveBeenLastCalledWith({ phase: 'done', score: {kind: 'cp', value: -120, depth: 8, bound: undefined}, candidates: [{rank: 1, score: {kind: 'cp', value: -120, depth: 8, bound: undefined}, pv: []}] });
    cancelB();
    vi.advanceTimersByTime(500);
    expect(worker.terminated).toBe(true);
  });

  it('stops when hidden, resumes the same position, and cancels safely while paused', async () => {
    const service = new LocalAnalysis();
    const update = vi.fn();
    const cancel = service.request('a', 'position-a', '+', update);
    await Promise.resolve();
    const worker = WorkerStub.instances[0];
    worker.emit({type: 'ready'});
    Object.defineProperty(document, 'hidden', {configurable: true, value: true});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(worker.commands.at(-1)).toBe('stop');
    worker.emit({ type: 'line', line: 'bestmove 7g7f' });
    expect(update).toHaveBeenLastCalledWith({phase: 'paused'});
    Object.defineProperty(document, 'hidden', {configurable: true, value: false});
    document.dispatchEvent(new Event('visibilitychange'));
    expect(worker.commands.filter((command) => command.startsWith('go'))).toHaveLength(2);
    cancel();
    vi.advanceTimersByTime(500);
    expect(worker.terminated).toBe(true);
  });

  it('does not retry a failed engine automatically on a new position', async () => {
    const service = new LocalAnalysis();
    const cancelA = service.request('a', 'position-a', '+', vi.fn());
    await Promise.resolve();
    WorkerStub.instances[0].emit({type: 'error', message: 'bad model'});
    const updateB = vi.fn();
    const cancelB = service.request('b', 'position-b', '+', updateB);
    await Promise.resolve();
    expect(WorkerStub.instances).toHaveLength(1);
    expect(updateB).toHaveBeenLastCalledWith({phase: 'error', message: '解析エンジン: bad model'});
    cancelA(); cancelB(); vi.advanceTimersByTime(500);
  });
  it('retains completed results when the tab is hidden and shown again', async () => {
    const service = new LocalAnalysis();
    const update = vi.fn();
    const cancel = service.request('a', 'position-a', '+', update);
    await Promise.resolve();
    const worker = WorkerStub.instances[0];
    worker.emit({type: 'ready'});
    worker.emit({type: 'line', line: 'info depth 8 score cp 20'});
    worker.emit({type: 'line', line: 'bestmove 7g7f'});
    for (const hidden of [true, false]) {
      Object.defineProperty(document, 'hidden', {configurable: true, value: hidden});
      document.dispatchEvent(new Event('visibilitychange'));
    }
    expect(update.mock.lastCall?.[0].phase).toBe('done');
    expect(worker.commands.filter((command) => command.startsWith('go'))).toHaveLength(1);
    cancel(); vi.advanceTimersByTime(500);
  });
  it('keeps candidate depths coherent and reuses cached variations', async () => {
    const service = new LocalAnalysis();
    const update = vi.fn();
    const cancel = service.request('a', 'position-a', '+', update);
    await Promise.resolve();
    const worker = WorkerStub.instances[0];
    worker.emit({type:'ready'});
    worker.emit({type:'line',line:'info depth 8 multipv 1 score cp 30 pv 7g7f 3c3d'});
    worker.emit({type:'line',line:'info depth 8 multipv 2 score cp 20 pv 2g2f 8c8d'});
    worker.emit({type:'line',line:'info depth 7 multipv 3 score cp 10 pv 5g5f'});
    worker.emit({type:'line',line:'bestmove 7g7f'});
    expect(update.mock.lastCall?.[0].candidates.map((candidate: {rank:number})=>candidate.rank)).toEqual([1,2]);
    cancel(); vi.advanceTimersByTime(500);
    const cached = vi.fn();
    const cancelCached = service.request('a', 'position-a', '+', cached);
    await Promise.resolve();
    expect(cached.mock.lastCall?.[0].candidates[1].pv).toEqual(['2g2f','8c8d']);
    expect(WorkerStub.instances).toHaveLength(1);
    cancelCached(); vi.advanceTimersByTime(500);
  });
});
