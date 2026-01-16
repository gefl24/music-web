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

  // 创建兼容桌面版的沙箱环境
  createSandbox() {
    const self = this;
    
    // 构造 lx 上下文
    // 关键修正1: _handlers 必须定义在 context 内部，让 on 方法能写入，且沙箱能读取
    const lxContext = {
      _handlers: {}, 
      
      version: '2.0.0',
      env: 'mobile',
      currentScriptInfo: {
        name: 'Custom Source',
        description: '',
        version: '1.0.0'
      },

      // 事件常量
      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      // 关键修正2: on 方法直接将 handler 存入 lxContext._handlers
      on: (eventName, handler) => {
        lxContext._handlers[eventName] = handler;
      },

      // 消息发送 (占位)
      send: (eventName, data) => {
        return Promise.resolve();
      },

      // 网络请求 (同时支持 Callback 和 Promise)
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

      // 基础 Fetch
      fetch: async (url, options = {}) => {
        return self.safeFetch(url, options);
      },

      // 加密工具
      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        sha1: (text) => crypto.createHash('sha1').update(text).digest('hex'),
        sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
        base64Encode: (text) => Buffer.from(text).toString('base64'),
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
        aesEncrypt: (text, key, iv, mode) => '', 
      },

      // 工具函数
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
      setTimeout: undefined, setInterval: undefined
    };
  }

  // 安全请求封装
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

    if (!config.headers['User-Agent']) {
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
    }

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
      // 即使失败也返回结构，防止脚本解构报错
      return {
          ok: false,
          status: 500,
          body: null,
          data: null,
          error: error.message
      }
    }
  }

  // 验证脚本
  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    try {
        return this.vm.run(this.script);
    } catch (e) {
        throw new Error(`Script Init Failed: ${e.message}`);
    }
  }

  // 执行方法
  async execute(method, params = {}) {
    if (!this.vm) await this.validate();

    // 映射方法名
    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopList': 'getTopList',
      'getLyric': 'lyric',
      'getPic': 'pic'
    };
    
    const action = actionMap[method] || method;

    // 关键修正3: 调用 handler 时传递 单个对象参数 { action, source, info }
    // 这是 LX Music 桌面版源的标准协议
    const code = `
      (async () => {
        if (lx._handlers && typeof lx._handlers['request'] === 'function') {
           const source = { id: 'custom', name: 'CustomSource' };
           // 修正此处：将参数包装为对象
           return await lx._handlers['request']({ 
               action: '${action}', 
               source: source, 
               info: ${JSON.stringify(params)} 
           });
        }
        
        if (typeof ${method} === 'function') {
          return await ${method}(${JSON.stringify(params)});
        }
        
        return null;
      })();
    `;

    return this.vm.run(code);
  }
}

module.exports = SourceParser;
