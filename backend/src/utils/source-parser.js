// backend/src/utils/source-parser.js
const { VM } = require('vm2');
const axios = require('axios');
const crypto = require('crypto');

class SourceParser {
  constructor(script) {
    this.script = script;
    this.timeout = 30000; // 30 秒超时
    this.vm = null;
  }

  // 创建安全的沙箱环境
  createSandbox() {
    const self = this;
    
    return {
      console: {
        log: (...args) => console.log('[Source Script]', ...args),
        error: (...args) => console.error('[Source Script]', ...args),
        warn: (...args) => console.warn('[Source Script]', ...args)
      },
      
      // 全局对象
      globalThis: {
        lx: {
          version: '1.0.0',
          env: 'web',
          
          // HTTP 请求
          fetch: async (url, options = {}) => {
            return self.safeFetch(url, options);
          },
          
          // 加密工具
          crypto: {
            md5: (text) => crypto.createHash('md5').update(text).digest('hex'),
            sha1: (text) => crypto.createHash('sha1').update(text).digest('hex'),
            sha256: (text) => crypto.createHash('sha256').update(text).digest('hex'),
            base64Encode: (text) => Buffer.from(text).toString('base64'),
            base64Decode: (text) => Buffer.from(text, 'base64').toString('utf-8')
          },
          
          // 工具函数
          utils: {
            parseJSON: (text) => JSON.parse(text),
            stringifyJSON: (obj) => JSON.stringify(obj),
            encodeURIComponent: (str) => encodeURIComponent(str),
            decodeURIComponent: (str) => decodeURIComponent(str)
          }
        }
      },
      
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
      
      // Promise 支持
      Promise,
      
      // 定时器(限制使用)
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined
    };
  }

  // 安全的 HTTP 请求
  async safeFetch(url, options = {}) {
    const config = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 10000,
      maxRedirects: 5,
      validateStatus: () => true // 接受所有状态码
    };

    if (options.body) {
      config.data = options.body;
    }

    if (options.params) {
      config.params = options.params;
    }

    // 设置默认 User-Agent
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
        
        // 兼容方法
        json: async () => response.data,
        text: async () => typeof response.data === 'string' 
          ? response.data 
          : JSON.stringify(response.data)
      };
    } catch (error) {
      throw new Error(`Fetch error: ${error.message}`);
    }
  }

  // 验证脚本
  async validate() {
    try {
      this.vm = new VM({
        timeout: this.timeout,
        sandbox: this.createSandbox()
      });

      // 执行脚本,检查语法错误
      this.vm.run(this.script);
      
      return true;
    } catch (error) {
      throw new Error(`Script validation failed: ${error.message}`);
    }
  }

  // 执行脚本方法
  async execute(method, params = {}) {
    if (!this.vm) {
      await this.validate();
    }

    try {
      // 构造执行代码
      const code = `
        ${this.script}
        
        (async () => {
          if (typeof ${method} !== 'function') {
            throw new Error('Method ${method} not found');
          }
          return await ${method}(${JSON.stringify(params)});
        })();
      `;

      const result = await this.vm.run(code);
      return result;
    } catch (error) {
      throw new Error(`Script execution error: ${error.message}`);
    }
  }

  // 搜索音乐
  async search(keyword, page = 1, limit = 30) {
    return this.execute('search', { keyword, page, limit });
  }

  // 获取排行榜列表
  async getTopList() {
    return this.execute('getTopList');
  }

  // 获取排行榜详情
  async getTopListDetail(topListId, page = 1, limit = 100) {
    return this.execute('getTopListDetail', { topListId, page, limit });
  }

  // 获取音乐 URL
  async getMusicUrl(musicInfo, quality = '128k') {
    return this.execute('getMusicUrl', { musicInfo, quality });
  }

  // 获取歌词
  async getLyric(musicInfo) {
    return this.execute('getLyric', { musicInfo });
  }

  // 获取歌曲图片
  async getPic(musicInfo) {
    return this.execute('getPic', { musicInfo });
  }
}

module.exports = SourceParser;

// 示例自定义源脚本格式
/*
// 搜索音乐
async function search({ keyword, page, limit }) {
  const response = await globalThis.lx.fetch(
    `https://api.example.com/search?q=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`
  );
  const data = await response.json();
  
  return {
    list: data.songs.map(song => ({
      id: song.id,
      name: song.name,
      singer: song.artist,
      album: song.album,
      interval: song.duration,
      source: 'custom'
    })),
    total: data.total,
    page,
    limit
  };
}

// 获取排行榜
async function getTopList() {
  const response = await globalThis.lx.fetch('https://api.example.com/toplist');
  const data = await response.json();
  
  return data.list.map(item => ({
    id: item.id,
    name: item.name,
    source: 'custom'
  }));
}

// 获取排行榜详情
async function getTopListDetail({ topListId, page, limit }) {
  const response = await globalThis.lx.fetch(
    `https://api.example.com/toplist/${topListId}?page=${page}&limit=${limit}`
  );
  const data = await response.json();
  
  return {
    list: data.songs.map(song => ({
      id: song.id,
      name: song.name,
      singer: song.artist,
      album: song.album,
      interval: song.duration,
      source: 'custom'
    })),
    total: data.total
  };
}

// 获取音乐播放地址
async function getMusicUrl({ musicInfo, quality }) {
  const response = await globalThis.lx.fetch(
    `https://api.example.com/song/url?id=${musicInfo.id}&quality=${quality}`
  );
  const data = await response.json();
  
  return {
    url: data.url,
    quality: quality,
    type: 'music'
  };
}
*/
