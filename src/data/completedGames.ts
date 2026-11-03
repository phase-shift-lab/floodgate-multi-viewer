import type {GameSummary} from '../domain/types';

const KEY='fgmv:completed-games:v1';
const TTL=24*60*60*1000;
const LIMIT=256;
type Completion=Pick<GameSummary,'live'|'result'|'moves'|'endedAt'> & {at:number};

/** Public result metadata only. Storage failure never blocks watching. */
export class CompletedGames {
  private entries=new Map<string,Completion>();
  constructor() {
    try {
      const serialized=localStorage.getItem(KEY)??'[]';
      if(serialized.length>256*1024)return;
      const raw=JSON.parse(serialized) as unknown;
      if(!Array.isArray(raw))return;
      for(const entry of raw.slice(-LIMIT)) {
        if(!Array.isArray(entry)||entry.length!==2)continue;
        const [id,value]=entry;
        if(typeof id!=='string'||id.length>512||!value||value.live!==false||!Number.isFinite(value.at)
          ||typeof value.moves!=='number'||!Number.isSafeInteger(value.moves)||value.moves<0
          ||(value.result!==undefined&&(typeof value.result!=='string'||value.result.length>128))
          ||(value.endedAt!==undefined&&(typeof value.endedAt!=='string'||value.endedAt.length>64)))continue;
        this.entries.set(id,{live:false,moves:value.moves,result:value.result,endedAt:value.endedAt,at:value.at});
      }
      this.prune();
    }catch{ /* Corrupt or denied storage has the same behavior as a cold start. */ }
  }
  private prune() {
    const now=Date.now();
    for(const [id,value] of this.entries)if(value.at>now||now-value.at>=TTL)this.entries.delete(id);
    while(this.entries.size>LIMIT)this.entries.delete(this.entries.keys().next().value!);
  }
  private save() {this.prune();try{localStorage.setItem(KEY,JSON.stringify([...this.entries]));}catch{ /* Keep the in-memory results. */ }}
  remember(game:GameSummary):boolean {
    if(game.live||game.moves===undefined||!Number.isSafeInteger(game.moves)||game.moves<0)return false;
    this.prune();const previous=this.entries.get(game.id);
    if(previous&&previous.result===game.result&&previous.moves===game.moves&&previous.endedAt===game.endedAt)return false;
    this.entries.delete(game.id);
    this.entries.set(game.id,{live:false,result:game.result,moves:game.moves,endedAt:game.endedAt,at:Date.now()});
    this.save();return true;
  }
  forget(id:string) {if(this.entries.delete(id))this.save();}
  apply(games:GameSummary[]):GameSummary[] {
    this.prune();let corrected=false;
    const result=games.map(game=>{
      const value=this.entries.get(game.id);
      if(value&&game.moves!==undefined&&value.moves!==undefined&&game.moves>value.moves) {
        this.entries.delete(game.id);corrected=true;return game;
      }
      return value?{...game,live:false,result:value.result,moves:value.moves,endedAt:value.endedAt}:game;
    });
    if(corrected)this.save();return result;
  }
}
