import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';
import source from '../../public/analysis-isolation-sw.js?raw';

it.each([204,205,304])('preserves a bodyless %i response even when WebKit exposes a body stream',async status=>{
  let listener!:(event:unknown)=>void;
  const fetch=vi.fn(async()=>({type:'basic',status,statusText:'',headers:new Headers({'Cache-Control':'no-cache'}),body:new ReadableStream()}));
  runInNewContext(source,{self:{registration:{scope:'https://example.test/app/'},addEventListener:(name:string,callback:typeof listener)=>{if(name==='fetch')listener=callback;}},fetch,URL,Headers,Response});
  let response!:Promise<Response>;
  listener({request:{url:'https://example.test/app/engine/analysis-worker.js',method:'GET'},respondWith:(value:Promise<Response>)=>{response=value;}});
  const result=await response;
  expect(result.status).toBe(status);expect(result.body).toBeNull();
  expect(result.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  expect(result.headers.get('Cache-Control')).toBe('no-cache');
});
it('preserves normal bodies and leaves external responses untouched',async()=>{
  let listener!:(event:unknown)=>void;
  const fetch=vi.fn(async()=>new Response('engine source'));
  runInNewContext(source,{self:{registration:{scope:'https://example.test/app/'},addEventListener:(name:string,callback:typeof listener)=>{if(name==='fetch')listener=callback;}},fetch,URL,Headers,Response});
  const respondWith=vi.fn();
  listener({request:{url:'https://external.test/engine.js',method:'GET'},respondWith});
  expect(respondWith).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  let response!:Promise<Response>;
  listener({request:{url:'https://example.test/app/engine/analysis-worker.js',method:'GET'},respondWith:(value:Promise<Response>)=>{response=value;}});
  expect(await(await response).text()).toBe('engine source');
});
