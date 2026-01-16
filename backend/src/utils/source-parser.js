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
      version: '2.0.0', // 伪装版本号
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
          bufToString: (buf, encoding) => {
            return Buffer.isBuffer(buf) ? buf.toString(encoding) : Buffer.from(buf).toString(encoding);
          }
        },
        // 部分脚本需要 zlib，做简单兼容
        zlib: {
           inflate: (buf, cb) => { if(cb) cb(null, buf); }
        }
      },
      // 【核心修复区域】完整的加密支持
      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        randomBytes: (size) => crypto.randomBytes(size), // 修复: 缺少随机数生成
        // 修复: 实现 AES 加密
        aesEncrypt: (buffer, mode, key, iv) => {
          try {
             const cipher = crypto.createCipheriv(mode, key, iv);
             const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
             return Buffer.concat([cipher.update(input), cipher.final()]);
          } catch (e) {
             console.error('AES Encrypt Error:', e.message);
             return Buffer.alloc(0);
          }
        },
        // 修复: 实现 RSA 加密 (网易云源必需)
        rsaEncrypt: (buffer, key, label) => {
          try {
            const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            const pubKey = key.includes('-----BEGIN') ? key : `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
            return crypto.publicEncrypt({
              key: pubKey,
              padding: crypto.constants.RSA_PKCS1_PADDING
            }, input);
          } catch (e) {
            console.error('RSA Encrypt Error:', e.message);
            return Buffer.alloc(0);
          }
        },
        base64Encode: (text) => {
          return Buffer.isBuffer(text) ? text.toString('base64') : Buffer.from(text).toString('base64');
        },
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
      },
      data: { set: () => {}, get: () => null }
    };

    return {
      console: { log: () => {}, error: console.error, warn: console.warn },
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
        // 强制接收二进制数据，交给脚本处理编码，防止乱码
        responseType: options.binary ? 'arraybuffer' : (options.responseType || 'json'),
        validateStatus: () => true,
      };
      
      if (options.body) config.data = options.body;
      if (options.form) config.data = options.form;
      
      // 模拟 Chrome UA，防止被拦截
      config.headers['User-Agent'] = config.headers['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
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
      // console.error('Fetch Error:', url, error.message);
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

  async execute(method, params = {}, targetSource = 'kw') {
    if (!this.vm) await this.validate();
    await this.waitForHandler();

    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopListDetail': 'board', 
      'getLyric': 'lyric',
      'getPic': 'pic'
    };
    
    const action = actionMap[method] || method;
    const fullParams = { page: 1, limit: 30, type: 'music', ...params };
    
    // 兼容处理：确保排行榜ID传给 info.id
    if (method === 'getTopListDetail' && params.id) {
        fullParams.id = params.id;
    }

    const code = `
      (async () => {
        try {
          if (lx._handlers && typeof lx._handlers['request'] === 'function') {
             // 构造 source 对象
             const source = { id: '${targetSource}', name: '${targetSource}', _is_built_in: false };
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

  // 包装方法
  search(keyword, page, limit) { return this.execute('search', { keyword, page, limit }, 'all'); }
  getMusicUrl(musicInfo) { return this.execute('getMusicUrl', { musicInfo, type: '128k' }, musicInfo.source); }
  getLyric(musicInfo) { return this.execute('getLyric', { musicInfo }, musicInfo.source); }
  getPic(musicInfo) { return this.execute('getPic', { musicInfo }, musicInfo.source); }
  
  getTopListDetail(sourceId, topListId, page, limit) {
    return this.execute('getTopListDetail', { id: topListId, page, limit }, sourceId);
  }
}

module.exports = SourceParser;
