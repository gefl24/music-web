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
      currentScriptInfo: {
        name: 'Custom Source',
        description: '',
        version: '1.0.0'
      },

      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      on: (eventName, handler) => {
        lxContext._handlers[eventName] = handler;
      },

      send: (eventName, data) => Promise.resolve(),

      request: (url, options, callback) => {
        let cb = callback;
        if (typeof options === 'function') {
          cb = options;
          options = {};
        }
        if (typeof url === 'object') {
          options = url;
          url = options.url;
        }
        options = options || {};

        const promise = self.safeFetch(url, options)
          .then(response => {
            if (cb) cb(null, response, response.body);
            return response;
          })
          .catch(err => {
            if (cb) cb(err, null, null);
            throw err;
          });

        return promise;
      },

      fetch: async (url, options = {}) => self.safeFetch(url, options),

      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        sha1: (text) => crypto.createHash('sha1').update(text).digest('hex'),
        sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
        base64Encode: (text) => Buffer.from(text).toString('base64'),
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
        aesEncrypt: (text, key, iv, mode) => '', 
      },

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
      
      data: { set: () => {}, get: () => null }
    };

    return {
      console: {
        log: (...args) => console.log('[Script]', ...args),
        error: (...args) => console.error('[Script Error]', ...args),
      },
      globalThis: { lx: lxContext },
      lx: lxContext,
      JSON, Math, Date, String, Number, Boolean, Array, Object, RegExp, Buffer, Promise,
      setTimeout, setInterval, clearTimeout, clearInterval // 允许脚本使用定时器以便异步操作
    };
  }

  async safeFetch(url, options = {}) {
    const config = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 15000,
      responseType: options.binary ? 'arraybuffer' : 'json', 
      validateStatus: () => true,
    };

    if (options.body) config.data = options.body;
    if (options.form) config.data = options.form;

    // 很多聚合源检查 User-Agent
    config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

    try {
      const response = await axios(config);
      return {
        statusCode: response.status,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.data, 
        data: response.data,
        ok: response.status >= 200 && response.status < 300
      };
    } catch (error) {
      return { ok: false, status: 500, body: null, error: error.message };
    }
  }

  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    try {
        return this.vm.run(this.script);
    } catch (e) {
        throw new Error(`Script Init Failed: ${e.message}`);
    }
  }

  // 新增：等待脚本注册事件（解决异步初始化问题）
  async waitForHandler(action, maxWait = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      // 检查沙箱内是否有 handler
      const hasHandler = this.vm.run(`!!(lx._handlers && lx._handlers['request'])`);
      if (hasHandler) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  async execute(method, params = {}) {
    if (!this.vm) await this.validate();

    // 等待脚本初始化完成 (最多等待3秒)
    await this.waitForHandler('request');

    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopList': 'getTopList',
      'getLyric': 'lyric',
      'getPic': 'pic'
    };
    
    const action = actionMap[method] || method;

    // 补全参数，防止脚本报错
    const fullParams = {
        page: 1,
        limit: 30, // 很多脚本没有 limit 会崩溃
        type: 'music',
        ...params
    };

    const code = `
      (async () => {
        try {
          if (lx._handlers && typeof lx._handlers['request'] === 'function') {
             const source = { id: 'custom', name: 'CustomSource' };
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
          return { error: err.message };
        }
        return null;
      })();
    `;

    return this.vm.run(code);
  }
}

module.exports = SourceParser;
