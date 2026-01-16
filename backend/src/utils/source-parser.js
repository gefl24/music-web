// backend/src/utils/source-parser.js
const { VM } = require('vm2');
const axios = require('axios');
const crypto = require('crypto');

class SourceParser {
  constructor(script) {
    this.script = script;
    this.timeout = 30000;
    this.vm = null;
    this.handlers = {}; // 存储 lx.on 注册的事件句柄
  }

  // 创建兼容桌面版的沙箱环境
  createSandbox() {
    const self = this;
    
    // 构造 lx 上下文
    const lxContext = {
      version: '2.0.0',
      env: 'mobile',
      currentScriptInfo: {
        name: 'Custom Source',
        description: '',
        version: '1.0.0'
      },

      // 1. 事件常量
      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      // 2. 事件监听 (关键：捕获脚本注册的处理函数)
      on: (eventName, handler) => {
        // 将 handler 保存到外部或者沙箱内部的存储中
        // 这里我们选择保存在沙箱内的隐藏对象中，以便 invoke 时调用
        if (!self.vm._handlers) self.vm._handlers = {};
        self.vm._handlers[eventName] = handler;
      },

      // 3. 消息发送 (占位)
      send: (eventName, data) => {
        // console.log('[Source Send]', eventName);
        return Promise.resolve();
      },

      // 4. 网络请求 (同时支持 Callback 和 Promise)
      request: (url, options, callback) => {
        // 参数归一化
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

        // 执行请求
        const promise = self.safeFetch(url, options)
          .then(response => {
            // Callback 风格: cb(err, response, body)
            if (cb) cb(null, response, response.body);
            return response;
          })
          .catch(err => {
            if (cb) cb(err, null, null);
            throw err;
          });

        return promise;
      },

      // 5. 基础 Fetch (兼容原版)
      fetch: async (url, options = {}) => {
        return self.safeFetch(url, options);
      },

      // 6. 加密工具 (桌面版常用)
      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        sha1: (text) => crypto.createHash('sha1').update(text).digest('hex'),
        sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
        base64Encode: (text) => Buffer.from(text).toString('base64'),
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
        aesEncrypt: (text, key, iv, mode) => '', // 简易占位，复杂脚本可能需要完整实现
      },

      // 7. 工具函数
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
      responseType: options.binary ? 'arraybuffer' : 'json', // 简易判断
      validateStatus: () => true,
    };

    if (options.body) config.data = options.body;
    if (options.form) config.data = options.form;

    // 伪装 UA
    if (!config.headers['User-Agent']) {
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
    }

    try {
      const response = await axios(config);
      // 构造兼容桌面版的 Response 对象
      return {
        statusCode: response.status, // 桌面版字段
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.data, // 关键：脚本通常读取 body
        data: response.data,
        ok: response.status >= 200 && response.status < 300
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // 验证脚本
  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    // 初始化内部 handler 存储
    this.vm.run('lx._handlers = {}'); 
    try {
        return this.vm.run(this.script);
    } catch (e) {
        throw new Error(`Script Init Failed: ${e.message}`);
    }
  }

  // 执行方法 (支持函数调用和事件驱动)
  async execute(method, params = {}) {
    if (!this.vm) await this.validate();

    // 映射方法名到桌面版 Action
    const actionMap = {
      'search': 'musicSearch',
      'getMusicUrl': 'musicUrl',
      'getTopList': 'getTopList', // 部分脚本可能不同
      // ... 其他映射
    };
    
    const action = actionMap[method] || method;

    const code = `
      (async () => {
        // 1. 优先尝试调用 lx.on 注册的 'request' 事件处理器 (事件驱动型源)
        if (lx._handlers && typeof lx._handlers['request'] === 'function') {
           // 构造 action wrapper
           const source = { id: 'custom', name: 'Custom' };
           // 调用 handler(action, source, info)
           return await lx._handlers['request']('${action}', source, ${JSON.stringify(params)});
        }
        
        // 2. 回退到全局函数调用 (传统型源)
        if (typeof ${method} === 'function') {
          return await ${method}(${JSON.stringify(params)});
        }
        
        // 3. 特殊处理：如果脚本没有任何处理方式
        return null;
      })();
    `;

    return this.vm.run(code);
  }
}

module.exports = SourceParser;
