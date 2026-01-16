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

  // 1. 创建沙箱环境 (模拟 LX Desktop 环境)
  createSandbox() {
    const self = this;
    
    const lxContext = {
      _handlers: {}, 
      
      version: '2.0.0',
      env: 'mobile',
      currentScriptInfo: {
        name: 'Custom Source',
        description: 'Fixed by Docker',
        version: '1.0.0'
      },

      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      // 注册事件句柄
      on: (eventName, handler) => {
        lxContext._handlers[eventName] = handler;
      },

      send: (eventName, data) => Promise.resolve(),

      // 网络请求 (支持 Promise 和 Callback)
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

      // 加密工具集
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
      setTimeout, setInterval, clearTimeout, clearInterval
    };
  }

  // 2. 安全请求封装
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
        this.vm.run('if(!lx._handlers) lx._handlers={}');
        return this.vm.run(this.script);
    } catch (e) {
        throw new Error(`Script Init Failed: ${e.message}`);
    }
  }

  // 等待脚本初始化 (解决异步注册问题)
  async waitForHandler(action, maxWait = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const hasHandler = this.vm.run(`!!(lx._handlers && lx._handlers['request'])`);
      if (hasHandler) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  // 3. 通用执行器
  async execute(method, params = {}) {
    if (!this.vm) await this.validate();

    // 确保脚本已加载完成
    await this.waitForHandler('request');

    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopList': 'getTopList',
      'getTopListDetail': 'getTopListDetail',
      'getLyric': 'lyric',
      'getPic': 'pic'
    };
    
    const action = actionMap[method] || method;
    const fullParams = { page: 1, limit: 30, type: 'music', ...params };

    const code = `
      (async () => {
        try {
          // 优先使用事件驱动模式 (lx.on)
          if (lx._handlers && typeof lx._handlers['request'] === 'function') {
             const source = { id: 'custom', name: 'CustomSource' };
             // 调用脚本中的 request 事件
             return await lx._handlers['request']({ 
                 action: '${action}', 
                 source: source, 
                 info: ${JSON.stringify(fullParams)} 
             });
          }
          
          // 兼容旧版函数模式
          if (typeof ${method} === 'function') {
            return await ${method}(${JSON.stringify(fullParams)});
          }
        } catch (err) {
          // 捕获脚本内部错误，不要让整个后端崩溃
          return { error: err.message, _scriptError: true };
        }
        return null; // 方法不存在
      })();
    `;

    return this.vm.run(code);
  }

  // ==========================================
  // 4. 关键修复：补回路由所需的包装方法
  // ==========================================

  async search(keyword, page = 1, limit = 30) {
    const res = await this.execute('search', { keyword, page, limit });
    if (res && res._scriptError) throw new Error(res.error);
    return res;
  }

  async getTopList() {
    const res = await this.execute('getTopList');
    // 如果源不支持排行榜，返回空数组，而不是报错
    if (!res || res._scriptError) return []; 
    return res;
  }

  async getTopListDetail(topListId, page = 1, limit = 100) {
    const res = await this.execute('getTopListDetail', { topListId, page, limit });
    if (!res || res._scriptError) return { list: [] };
    return res;
  }

  async getMusicUrl(musicInfo, quality = '128k') {
    const res = await this.execute('getMusicUrl', { musicInfo, quality });
    if (res && res._scriptError) throw new Error(res.error);
    return res;
  }

  async getLyric(musicInfo) {
    return this.execute('getLyric', { musicInfo });
  }

  async getPic(musicInfo) {
    return this.execute('getPic', { musicInfo });
  }
}

module.exports = SourceParser;
