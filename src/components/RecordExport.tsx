import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { exportRecord, recordFilename, type RecordFormat } from '../domain/recordExport';
import type { ParsedGame } from '../domain/types';

export function RecordExport({game,variation,isVariation=false,headerTarget,onShare}:{game:ParsedGame;variation?:ParsedGame;isVariation?:boolean;headerTarget?:HTMLDivElement|null;onShare?:()=>Promise<string>}) {
  const [format,setFormat]=useState<RecordFormat>('kif');
  const [target,setTarget]=useState('source');
  const [message,setMessage]=useState('');
  useEffect(()=>{if(!message||/^https?:\/\//.test(message))return;const timer=setTimeout(()=>setMessage(''),2500);return()=>clearTimeout(timer);},[message]);
  const selected=target==='variation' && variation?variation:game;
  const copy=async()=>{
    try {await navigator.clipboard.writeText(exportRecord(selected,format));setMessage('棋譜をコピーしました');}
    catch {setMessage('コピーできませんでした。DLをご利用ください');}
  };
  const download=()=>{
    let url:string|undefined;
    try {
      url=URL.createObjectURL(new Blob([exportRecord(selected,format)],{type:'text/plain;charset=utf-8'}));
      const link=document.createElement('a');link.href=url;link.download=recordFilename(selected,format,isVariation||selected===variation);
      document.body.append(link);link.click();link.remove();setMessage('棋譜のダウンロードを開始しました');
    } catch {setMessage('棋譜をダウンロードできませんでした');}
    finally {if(url) {const release=url;setTimeout(()=>URL.revokeObjectURL(release),30_000);}}
  };
  const controls=<div className={'record-export'+(headerTarget?' is-header':'')}>
    <div className="record-export-selects">{variation&&<select aria-label="出力する棋譜" value={target} onChange={e=>{setTarget(e.target.value);setMessage('');}}><option value="source">本譜</option><option value="variation">現在の変化</option></select>}
      <select aria-label="棋譜の出力形式" value={format} onChange={e=>{setFormat(e.target.value as RecordFormat);setMessage('');}}><option value="kif">KIF</option><option value="csa">CSA</option></select></div>
    <div className="record-export-buttons"><button onClick={download}>DL</button><button onClick={()=>void copy()}>コピー</button>{onShare&&<button onClick={()=>void onShare().then(setMessage)}>共有</button>}</div>
    <output aria-live="polite">{message}</output>
  </div>;
  return headerTarget?createPortal(controls,headerTarget):controls;
}
