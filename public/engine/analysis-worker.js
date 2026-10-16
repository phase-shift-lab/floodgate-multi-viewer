let engine;
self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'init') {
      const base = new URL('./', self.location.href).href;
      const buffers = await Promise.all(['yaneuraou.wasm', 'nn.bin', 'progress.bin'].map(async (file) => {
        const response = await fetch(base + file);
        if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      }));
      importScripts(base + 'yaneuraou.js');
      engine = await self.YaneuraOu({ wasmBinary: buffers[0], locateFile: (file) => base + file, mainScriptUrlOrBlob: base + 'yaneuraou.js' });
      engine.FS.mkdir('/eval');
      engine.FS.writeFile('/eval/nn.bin', buffers[1]);
      engine.FS.writeFile('/eval/progress.bin', buffers[2]);
      let initialized = false;
      engine.addMessageListener((line) => {
        if (!initialized && /failed|mismatch|Error|not found/i.test(line)) {
          self.postMessage({ type: 'error', message: line });
        } else if (!initialized && line === 'readyok') {
          initialized = true;
          self.postMessage({ type: 'ready' });
        } else self.postMessage({ type: 'line', line });
      });
      engine.postMessage('setoption name EvalDir value /eval');
      engine.postMessage('setoption name FV_SCALE value 24');
      engine.postMessage('setoption name USI_Hash value 16');
      engine.postMessage('setoption name MultiPV value 3');
      engine.postMessage('setoption name BookFile value no_book');
      engine.postMessage('isready');
    } else if (data.type === 'command' && engine) engine.postMessage(data.command);
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) });
  }
});
