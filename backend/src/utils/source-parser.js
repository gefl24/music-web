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

  // 1. 创建增强版沙箱 (支持 lx.on 和 lx.request)
  createSandbox() {
    const self = this;
    
    const lxContext = {
      _handlers: {}, // 内部存储事件处理器
      
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

      // 关键：捕获脚本注册的事件
      on: (eventName, handler) => {
        lxContext._handlers[eventName] = handler;
      },

      send: (eventName, data) => Promise.resolve(),

      // 关键：request 方法支持 Callback 和 Promise 两种风格
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
      setTimeout, setInterval, clearTimeout, clearInterval
    };
  }

  // 2. 安全的网络请求
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

    // 伪装 UA
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

  // 3. 初始化验证
  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    try {
        // 初始化 handlers 容器
        this.vm.run('if(!lx._handlers) lx._handlers={}');
        return this.vm.run(this.script);
    } catch (e) {
        throw new Error(`Script Init Failed: ${e.message}`);
    }
  }

  // 4. 等待脚本异步初始化 (解决 Test Failed)
  async waitForHandler(action, maxWait = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const hasHandler = this.vm.run(`!!(lx._handlers && lx._handlers['request'])`);
      if (hasHandler) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return false;
  }

  // 5. 核心执行逻辑
  async execute(method, params = {}) {
    if (!this.vm) await this.validate();

    // 等待脚本准备就绪
    await this.waitForHandler('request');

    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopList': 'getTopList',
      'getLyric': 'lyric',
      'getPic': 'pic',
      'getTopListDetail': 'getTopListDetail'
    };
    
    const action = actionMap[method] || method;

    // 补全默认参数
    const fullParams = {
        page: 1,
        limit: 30,
        type: 'music',
        ...params
    };

    const code = `
      (async () => {
        try {
          // 优先使用事件驱动模式 (lx.on)
          if (lx._handlers && typeof lx._handlers['request'] === 'function') {
             const source = { id: 'custom', name: 'CustomSource' };
             return await lx._handlers['request']({ 
                 action: '${action}', 
                 source: source, 
                 info: ${JSON.stringify(fullParams)} 
             });
          }
          
          // 降级使用全局函数模式
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

  // ==========================================
  // 6. 接口包装方法 (修复 logs 报错的关键)
  // ==========================================

  async search(keyword, page = 1, limit = 30) {
    return this.execute('search', { keyword, page, limit });
  }

  async getTopList() {
    return this.execute('getTopList');
  }

  async getTopListDetail(topListId, page = 1, limit = 100) {
    return this.execute('getTopListDetail', { topListId, page, limit });
  }

  async getMusicUrl(musicInfo, quality = '128k') {
    return this.execute('getMusicUrl', { musicInfo, quality });
  }

  async getLyric(musicInfo) {
    return this.execute('getLyric', { musicInfo });
  }

  async getPic(musicInfo) {
    return this.execute('getPic', { musicInfo });
  }
}

module.exports = SourceParser;
