import { parseCandidate, type Candidate, type LocalScore } from '../domain/localEvaluation';
import type { Side } from '../domain/types';

export interface AnalysisState { phase: 'loading' | 'queued' | 'running' | 'done' | 'paused' | 'error'; score?: LocalScore; candidates?: Candidate[]; message?: string }
interface Job { key: string; sfen: string; turn: Side; update: (state: AnalysisState) => void; cancelled?: boolean; score?: LocalScore; candidates: Map<number, Candidate> }
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

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.active) {
          const active = this.active;
          active.cancelled = true;
          this.queue.unshift(active);
          this.send('stop');
        }
        for (const job of this.queue) if (this.jobs.get(job.key) === job) job.update({ phase: 'paused' });
      } else {
        for (const job of this.queue) if (this.jobs.get(job.key) === job) job.update({ phase: this.ready ? 'queued' : 'loading' });
        this.pump();
      }
    });
  }

  request(key: string, sfen: string, turn: Side, update: Job['update']): () => void {
    clearTimeout(this.idleTimer);
    const job: Job = { key, sfen, turn, update, candidates: new Map() };
    this.jobs.set(key, job);
    const cached = this.cache.get(sfen);
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
      this.queue = this.queue.filter((item) => item.key !== key);
      if (this.active?.key === key) { this.active.cancelled = true; this.send('stop'); }
      if (!this.jobs.size) {
        this.failure = undefined;
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
            this.cache.set(job.sfen, { score: job.score, candidates: currentCandidates(job) });
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

  private pump() {
    if (document.hidden || this.failure || !this.queue.length) return;
    if (!this.worker) { this.start(); return; }
    if (!this.ready || this.active) return;
    let job: Job | undefined;
    while ((job = this.queue.shift())) {
      if (this.jobs.get(job.key) === job) break;
    }
    if (!job) return;
    job.cancelled = false;
    job.score = undefined;
    job.candidates.clear();
    this.active = job;
    job.update({ phase: 'running' });
    this.send('usinewgame');
    this.send(`position sfen ${job.sfen}`);
    this.send('go movetime 500');
    this.timer = setTimeout(() => this.fail('解析が応答しないため停止しました。OFFにして再度お試しください。'), 5_000);
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
