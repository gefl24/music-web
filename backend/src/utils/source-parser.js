// backend/src/utils/source-parser.js
const { VM } = require('vm2');
const axios = require('axios');
const crypto = require('crypto');

class SourceParser {
  constructor(script) {
    this.script = script;
    this.timeout = 30000;
    this.vm = null;
  }

  createSandbox() {
    const self = this;
    const lxContext = {
      _handlers: {},
      version: '2.0.0',
      env: 'mobile',
      currentScriptInfo: { name: 'Custom Source', version: '1.0.0' },
      EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
      on: (eventName, handler) => { lxContext._handlers[eventName] = handler; },
      send: () => Promise.resolve(),
      request: (url, options, callback) => {
        let cb = callback;
        if (typeof options === 'function') { cb = options; options = {}; }
        if (typeof url === 'object') { options = url; url = options.url; }
        options = options || {};
        return self.safeFetch(url, options)
          .then(res => { if(cb) cb(null, res, res.body); return res; })
          .catch(err => { if(cb) cb(err, null, null); throw err; });
      },
      fetch: (url, options) => self.safeFetch(url, options),
      utils: {
        parseJSON: (text) => JSON.parse(text),
        stringifyJSON: (obj) => JSON.stringify(obj),
        encodeURIComponent: (str) => encodeURIComponent(str),
        decodeURIComponent: (str) => decodeURIComponent(str),
        buffer: {
          from: (str, encoding) => Buffer.from(str, encoding),
          bufToString: (buf, encoding) => Buffer.from(buf).toString(encoding)
        }
      },
      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        base64Encode: (text) => Buffer.from(text).toString('base64'),
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
        aesEncrypt: () => '',
      },
      data: { set: () => {}, get: () => null }
    };

    return {
      console: { log: () => {}, error: console.error },
      globalThis: { lx: lxContext },
      lx: lxContext,
      JSON, Math, Date, String, Number, Boolean, Array, Object, RegExp, Buffer, Promise,
      setTimeout, setInterval, clearTimeout, clearInterval
    };
  }

  async safeFetch(url, options = {}) {
    try {
      const config = {
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: 15000,
        responseType: options.binary ? 'arraybuffer' : 'json',
        validateStatus: () => true,
      };
      if (options.body) config.data = options.body;
      if (options.form) config.data = options.form;
      // 模拟安卓客户端 UA，增加成功率
      config.headers['User-Agent'] = 'Mozilla/5.0 (Linux; Android 10; Pixel 4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36';
      
      const response = await axios(config);
      return {
        statusCode: response.status,
        status: response.status,
        body: response.data,
        data: response.data,
        headers: response.headers,
        ok: response.status >= 200 && response.status < 300
      };
    } catch (error) {
      return { ok: false, status: 500, body: null, error: error.message };
    }
  }

  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    try {
      this.vm.run('if(!lx._handlers) lx._handlers={}');
      return this.vm.run(this.script);
    } catch (e) {
      throw new Error(`Init Failed: ${e.message}`);
    }
  }

  async waitForHandler() {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      if (this.vm.run(`!!(lx._handlers && lx._handlers['request'])`)) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  }

  // 增加 targetSource 参数，指定目标平台
  async execute(method, params = {}, targetSource = 'kw') {
    if (!this.vm) await this.validate();
    await this.waitForHandler();

    // 关键映射修正：getTopListDetail -> board
    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopListDetail': 'board', // <--- 必须是 board
      'getLyric': 'lyric',
      'getPic': 'pic'
    };
    
    const action = actionMap[method] || method;
    const fullParams = { page: 1, limit: 30, type: 'music', ...params };

    const code = `
      (async () => {
        try {
          if (lx._handlers && typeof lx._handlers['request'] === 'function') {
             // 构造 source 对象，告诉脚本目标平台 (如 wy, tx)
             const source = { id: '${targetSource}', name: '${targetSource}', _is_built_in: true };
             return await lx._handlers['request']({ 
                 action: '${action}', 
                 source: source, 
                 info: ${JSON.stringify(fullParams)} 
             });
          }
          if (typeof ${method} === 'function') {
            return await ${method}(${JSON.stringify(fullParams)});
          }
        } catch (err) {
          return { error: err.message, _scriptError: true };
        }
        return null;
      })();
    `;

    const res = await this.vm.run(code);
    if (res && res._scriptError) throw new Error(res.error);
    return res;
  }

  // API 包装
  search(keyword, page, limit) { return this.execute('search', { keyword, page, limit }, 'all'); }
  getMusicUrl(musicInfo) { return this.execute('getMusicUrl', { musicInfo }, musicInfo.source); }
  getLyric(musicInfo) { return this.execute('getLyric', { musicInfo }, musicInfo.source); }
  getPic(musicInfo) { return this.execute('getPic', { musicInfo }, musicInfo.source); }
  
  // 这里的 sourceId 就是 wy, tx 等
  getTopListDetail(sourceId, topListId, page, limit) {
    return this.execute('getTopListDetail', { id: topListId, page, limit }, sourceId);
  }
}

module.exports = SourceParser;
