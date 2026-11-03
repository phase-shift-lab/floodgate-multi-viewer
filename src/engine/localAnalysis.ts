import { parseCandidate, type Candidate, type LocalScore } from '../domain/localEvaluation';
import type { Side } from '../domain/types';
import engineChecksums from '../../public/engine/SHA256SUMS.txt?raw';

export interface AnalysisState { phase: 'loading' | 'queued' | 'running' | 'done' | 'paused' | 'error'; score?: LocalScore; candidates?: Candidate[]; message?: string }
interface Job { key: string; sfen: string; turn: Side; update: (state: AnalysisState) => void; cancelled?: boolean; score?: LocalScore; candidates: Map<number, Candidate>; milliseconds: number; cacheKey: string }
export interface AnalysisOptions { milliseconds?: 500 | 1000 | 3000 | 5000 | 10000; bypassCache?: boolean }
interface CachedAnalysis { score: LocalScore; candidates: Candidate[] }
function currentCandidates(job: Job): Candidate[] {
  return [...job.candidates.values()].filter((candidate) => candidate.score.depth === job.score?.depth).sort((a, b) => a.rank - b.rank);
}

// One engine and one bounded search shared by all visible panels.
export class LocalAnalysis {
  private worker?: Worker;
  private ready = false;
  private active?: Job;
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private cache = new Map<string, CachedAnalysis>();
  private timer?: ReturnType<typeof setTimeout>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private failure?: string;
  private exclusive?: string;

  /** A full-record run shares this worker but temporarily holds normal jobs. */
  reserve(key: string): () => void {
    if (this.exclusive && this.exclusive !== key) throw new Error('別の棋譜を解析中です。先に停止してください。');
    this.exclusive = key;
    if (this.active && this.active.key !== key) {
      this.active.cancelled = true;
      this.queue.unshift(this.active);
      this.active.update({phase:'queued'});
      this.stopActive();
    }
    return () => { if (this.exclusive === key) { this.exclusive = undefined; this.pump(); } };
  }

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.active) {
          const active = this.active;
          active.cancelled = true;
          this.queue.unshift(active);
          this.stopActive();
        }
        for (const job of this.queue) if (this.jobs.get(job.key) === job) job.update({ phase: 'paused' });
      } else {
        for (const job of this.queue) if (this.jobs.get(job.key) === job) job.update({ phase: this.ready ? 'queued' : 'loading' });
        this.pump();
      }
    });
  }

  request(key: string, sfen: string, turn: Side, update: Job['update'], options: AnalysisOptions = {}): () => void {
    clearTimeout(this.idleTimer);
    const milliseconds = options.milliseconds ?? 500;
    const cacheKey = `${engineChecksums}|pv3|${milliseconds}|${sfen}`;
    const job: Job = { key, sfen, turn, update, candidates: new Map(), milliseconds, cacheKey };
    this.jobs.set(key, job);
    const cached = options.bypassCache ? undefined : this.cache.get(cacheKey);
    if (cached) queueMicrotask(() => { if (this.jobs.get(key) === job) update({ phase: 'done', ...cached }); });
    else {
      this.queue.push(job);
      queueMicrotask(() => {
        if (this.jobs.get(key) !== job) return;
        if (this.failure) { update({ phase: 'error', message: this.failure }); return; }
        update({ phase: document.hidden ? 'paused' : this.ready ? 'queued' : 'loading' });
        this.pump();
      });
    }
    return () => {
      if (this.jobs.get(key) === job) this.jobs.delete(key);
      this.queue = this.queue.filter((item) => item !== job);
      if (this.active === job) { this.active.cancelled = true; this.stopActive(); }
      if (!this.jobs.size) {
        this.idleTimer = setTimeout(() => this.dispose(), 500);
      }
    };
  }

  private start() {
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/analysis-worker.js`);
    this.worker.onerror = () => this.fail('解析エンジンを起動できませんでした。');
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'error') { this.fail(`解析エンジン: ${data.message}`); return; }
      if (data.type === 'ready') { clearTimeout(this.timer); this.ready = true; this.pump(); return; }
      const job = this.active;
      if (!job || data.type !== 'line') return;
      const candidate = parseCandidate(data.line, job.turn);
      if (candidate && !job.cancelled && this.jobs.get(job.key) === job) {
        job.candidates.set(candidate.rank, candidate);
        if (candidate.rank === 1) job.score = candidate.score;
        job.update({ phase: 'running', score: job.score, candidates: currentCandidates(job) });
      }
      if (data.line.startsWith('bestmove ')) {
        clearTimeout(this.timer);
        if (!job.cancelled && this.jobs.get(job.key) === job) {
          if (job.score) {
            this.cache.set(job.cacheKey, { score: job.score, candidates: currentCandidates(job) });
            if (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
          }
          job.update({ phase: 'done', score: job.score, candidates: currentCandidates(job) });
        }
        this.active = undefined;
        this.pump();
      }
    };
    this.worker.postMessage({ type: 'init' });
    this.timer = setTimeout(() => this.fail('解析エンジンの読み込みがタイムアウトしました。'), 30_000);
  }

  private send(command: string) { this.worker?.postMessage({ type: 'command', command }); }

  private stopActive() {
    this.send('stop');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('停止応答がないため解析エンジンを終了しました。再解析で再試行できます。'), 2_000);
  }

  /** Only an explicit user retry may clear a latched worker failure. */
  retry() { if (this.failure) { this.dispose(); this.failure = undefined; } }
  stopAll(): void {
    this.jobs.clear(); this.queue = [];
    if (this.active) { this.active.cancelled = true; this.stopActive(); }
  }
  async settle(): Promise<void> {
    this.stopAll();
    const until = Date.now() + 2_100;
    while (this.active && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
    if (this.active) this.dispose();
  }

  private pump() {
    if (document.hidden || this.failure || !this.queue.length) return;
    if (!this.worker) { this.start(); return; }
    if (!this.ready || this.active) return;
    this.queue = this.queue.filter(job => this.jobs.get(job.key) === job);
    const index = this.queue.findIndex(job => !this.exclusive || job.key === this.exclusive);
    const job = index < 0 ? undefined : this.queue.splice(index, 1)[0];
    if (!job) return;
    job.cancelled = false;
    job.score = undefined;
    job.candidates.clear();
    this.active = job;
    job.update({ phase: 'running' });
    this.send('usinewgame');
    this.send(`position sfen ${job.sfen}`);
    this.send(`go movetime ${job.milliseconds}`);
    this.timer = setTimeout(() => this.fail('解析が応答しないため停止しました。再解析で再試行できます。'), job.milliseconds + 5_000);
  }

  private fail(message: string) {
    this.failure = message;
    for (const job of this.jobs.values()) job.update({ phase: 'error', message });
    this.queue = [];
    this.dispose();
  }

  private dispose() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = false;
    this.active = undefined;
    this.queue = [];
  }
}

export const localAnalysis = new LocalAnalysis();
