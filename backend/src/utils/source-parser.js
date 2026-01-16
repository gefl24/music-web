// backend/src/utils/source-parser.js
const { VM } = require('vm2');
const axios = require('axios');
const crypto = require('crypto');

class SourceParser {
  constructor(script) {
    this.script = script;
    this.timeout = 30000; // 脚本执行超时时间
    this.vm = null;
  }

  /**
   * 核心：创建沙箱环境
   * 目标：模拟 lx-music-desktop 的全局环境，欺骗脚本以为自己在桌面端运行
   */
  createSandbox() {
    const self = this;
    
    // 构造兼容桌面版的 lx 对象
    const lxContext = {
      version: '2.0.0', // 伪装版本号
      env: 'mobile',    // 伪装环境，避免部分脚本触发浏览器特有的限制
      
      // 1. 事件常量 (桌面版特有)
      EVENT_NAMES: {
        request: 'request',
        inited: 'inited',
        updateAlert: 'updateAlert'
      },

      // 2. 网络请求适配 (将 lx.request 映射到 axios)
      request: async (url, options = {}) => {
         // 兼容处理：部分脚本第一个参数传的是对象
         if (typeof url === 'object') {
             options = url;
             url = options.url;
         }
         return self.safeFetch(url, options);
      },

      // 3. 事件发送 (占位，防止报错)
      send: (eventName, data) => {
        // console.log('[Source Event]', eventName); 
        return Promise.resolve();
      },

      // 4. 加密工具集 (桌面版脚本常用)
      crypto: {
        md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
        sha1: (text) => crypto.createHash('sha1').update(text).digest('hex'),
        sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
        base64Encode: (text) => Buffer.from(text).toString('base64'),
        base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8'),
        aesEncrypt: (text, key, iv, mode) => {
            // 简单的 AES 占位，如果脚本强依赖此功能需完整实现
            return ''; 
        }
      },
      
      // 5. 通用工具
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

      // 6. 数据存储 (Web版无本地存储，给个空实现)
      data: {
          set: () => {},
          get: () => null
      }
    };

    // 返回沙箱上下文
    return {
      console: {
        log: (...args) => console.log('[Script]', ...args),
        error: (...args) => console.error('[Script Error]', ...args),
      },
      
      // 注入 lx 对象到全局
      globalThis: { lx: lxContext },
      lx: lxContext, // 兼容直接调用 lx 的情况
      
      // 注入 Node.js 基础模块
      JSON, Math, Date, String, Number, Boolean, Array, Object, RegExp, Buffer, Promise,
      
      // 禁用定时器防止脚本挂起
      setTimeout: undefined,
      setInterval: undefined
    };
  }

  // 安全的网络请求封装
  async safeFetch(url, options = {}) {
    const config = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 15000,
      validateStatus: () => true 
    };

    if (options.body) config.data = options.body;
    if (options.form) config.data = options.form;
    
    // 伪装 User-Agent
    if (!config.headers['User-Agent']) {
      config.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...';
    }

    try {
      const response = await axios(config);
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        headers: response.headers,
        body: response.data, // 关键：很多脚本使用 .body 而不是 .data
        data: response.data,
      };
    } catch (error) {
      return { ok: false, status: 500, error: error.message };
    }
  }

  // 验证脚本
  async validate() {
    this.vm = new VM({ timeout: this.timeout, sandbox: this.createSandbox() });
    return this.vm.run(this.script);
  }

  // 执行脚本方法
  async execute(method, params = {}) {
    if (!this.vm) await this.validate();
    
    const code = `
      ${this.script}
      (async () => {
        // 尝试调用对应的方法
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
