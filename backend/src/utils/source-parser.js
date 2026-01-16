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

  // 创建安全的沙箱环境
  createSandbox() {
    const self = this;
    
    // 定义 lx 对象，补充缺失的属性以兼容复杂脚本
    const lxContext = {
      version: '2.0.0', // 提高版本号，某些脚本检测版本
      env: 'mobile',    // 伪装成 mobile 或 desktop 环境，因为 web 环境权限通常被脚本限制
      
      // 模拟 EVENT_NAMES
      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      // 映射 request 方法到 fetch
      request: async (url, options = {}) => {
         // 有些脚本传入的第一个参数是对象 {url, method...}
         if (typeof url === 'object') {
             options = url;
             url = options.url;
         }
         return self.safeFetch(url, options);
      },

      // 模拟 send 方法 (通常用于发送日志或事件，这里可以留空)
      send: (eventName, data) => {
        console.log('[Source Send]', eventName, data);
        return Promise.resolve();
      },

      // 这里的 fetch 保持原样
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
        // 添加 aes 支持，很多脚本需要
        aesEncrypt: (text, key, iv, mode = 'aes-128-cbc') => {
             // 简化的 AES 实现示例，具体取决于脚本需求
             // 这里仅做占位，防止直接报错
             return ''; 
        }
      },
      
      // 工具函数
      utils: {
        parseJSON: (text) => JSON.parse(text),
        stringifyJSON: (obj) => JSON.stringify(obj),
        encodeURIComponent: (str) => encodeURIComponent(str),
        decodeURIComponent: (str) => decodeURIComponent(str),
        buffer: {
            from: (str, encoding) => Buffer.from(str, encoding),
            // 某些脚本需要 Byte 转换
            bufToString: (buf, encoding) => Buffer.from(buf).toString(encoding)
        }
      },

      // 模拟 data 对象 (存储/读取配置)
      data: {
          set: () => {},
          get: () => null
      }
    };

    return {
      console: {
        log: (...args) => console.log('[Source Script]', ...args),
        error: (...args) => console.error('[Source Script]', ...args),
        warn: (...args) => console.warn('[Source Script]', ...args)
      },
      
      // 全局对象
      globalThis: {
        lx: lxContext
      },
      // 兼容直接访问 lx 的情况
      lx: lxContext,
      
      // 标准对象
      JSON,
      Math,
      Date,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      Buffer, // 很多脚本需要 Buffer
      
      // Promise 支持
      Promise,
      
      // 定时器(限制使用)
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined
    };
  }

  // ... 后面的 safeFetch, validate, execute 方法保持不变 ...
  // 注意：需要确保 safeFetch 处理返回格式符合脚本预期（body, status等）
  async safeFetch(url, options = {}) {
     // ... (保持你原有的 safeFetch 代码) ...
     // 但建议在 safeFetch 的返回值里增加 body 属性，因为很多脚本使用 r.body 而不是 r.data
     // 在 safeFetch 的 return 对象中添加:
     /* body: response.data,
     */
     
    const config = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 15000,
      maxRedirects: 5,
      validateStatus: () => true 
    };

    if (options.body) config.data = options.body;
    if (options.form) config.data = options.form; // 兼容 form 参数
    if (options.params) config.params = options.params;

    if (!config.headers['User-Agent']) {
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    }

    try {
      const response = await axios(config);
      
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data,
        body: response.data, // 关键：添加 body 别名
        
        json: async () => response.data,
        text: async () => typeof response.data === 'string' 
          ? response.data 
          : JSON.stringify(response.data)
      };
    } catch (error) {
      // 即使失败也尽量返回结构，防止脚本崩溃
      return {
          ok: false,
          status: 500,
          statusText: error.message,
          headers: {},
          data: null,
          body: null,
          error: error.message
      }
    }
  }

  // ... 其他方法保持不变 ...
  async validate() {
      // ...
      // 保持原样
      this.vm = new VM({
        timeout: this.timeout,
        sandbox: this.createSandbox()
      });
      this.vm.run(this.script);
      return true;
  }
  
  async execute(method, params = {}) {
      if (!this.vm) {
          await this.validate();
      }
      try {
           // 保持原样
           const code = `
            ${this.script}
            (async () => {
              if (typeof ${method} !== 'function') {
                // 有些脚本可能没有直接定义函数，而是通过 lx.on 等方式注册
                // 这里可能需要根据具体脚本逻辑调整，或者忽略错误
                 return null;
              }
              return await ${method}(${JSON.stringify(params)});
            })();
          `;
          return await this.vm.run(code);
      } catch(error) {
          throw new Error(`Script execution error: ${error.message}`);
      }
  }
}

module.exports = SourceParser;
