// 数据上报格式
// saas埋点接口 : /platform/web/v1/api/eventTracking
// webapi埋点接口：/platform/webapi/v1/api/eventTracking
// POST JSON
// {
//     "appId":"应用id：Cargogo—Saas、Cargogo-WebApi、Cargogo-WebSite",
//     "accreditId":"3sfsdf3sfsfsfsef（租户授权码）",
//     "userId":"用户id",
//     "eventType":"pageView / click（页面or点击事件）",
//     "pageUrl":"/BusinessAccount/businessAccount（路由）",
//     "clickCode":"buttonId（点击事件id）",
//     "referer":"",
//     "userAgent":"",
//     "param":{} // 扩展参数
// }

let instance = null;
// 原生方法缓存
let originalPushState = null;
let originalReplaceState = null;

export default class Tracker {
  constructor(options = {}) {
    // 单例模式
    if (instance) return instance;
    instance = this;

    // 配置项验证
    if (!options.appId || !options.userId || !options.accreditId || !options.url) {
      throw new Error('Missing required parameters: appId, userId, accreditId, url');
    }

    this.appId = options.appId;
    this.userId = options.userId;
    this.accreditId = options.accreditId;
    this.url = options.url;
    this.deviceInfo = getDeviceInfo();
    this.queue = [];
    this._isDestroyed = false;
    this.debug = options.debug || false;  // 是否开启调试模式

    // 防抖相关配置
    this._debounceTimer = null;
    this._debounceDelay = 300; // 批量上报防抖延迟

    // 自动埋点初始化
    this._initCore();
  }

  _initCore() {
    // 保证只初始化一次
    if (this._hasInitialized) return;
    this._hasInitialized = true;

    // 保存原生方法
    originalPushState = originalPushState || window.history.pushState;
    originalReplaceState = originalReplaceState || window.history.replaceState;

    // 事件监听
    this._bindRouterEvents();
    this._bindClickEvent();

    // 定时上报
    this._flushTimer = setInterval(() => this._flushQueue(), 10000);
  }

  _bindRouterEvents() {
    // 防重复绑定检查
    if (this._routerEventsBound) return;
    this._routerEventsBound = true;

    // 重写history方法
    this._patchHistoryMethods();
    
    // 事件处理器（带增强防抖）
    const handleRouteChange = this._createDebouncedRouteHandler();
    
    // 监听事件
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('pushstate', handleRouteChange);
    window.addEventListener('replacestate', handleRouteChange);
  }

  _patchHistoryMethods() {
    // 代理pushState
    window.history.pushState = (state, title, url) => {
      const result = originalPushState.call(history, state, title, url);
      window.dispatchEvent(new CustomEvent('pushstate', { detail: { url, state }}));
      return result;
    };

    // 代理replaceState
    window.history.replaceState = (state, title, url) => {
      const result = originalReplaceState.call(history, state, title, url);
      window.dispatchEvent(new CustomEvent('replacestate', { detail: { url, state }}));
      return result;
    };
  }

  _createDebouncedRouteHandler() {
    let lastUrl = '';
    let lastTimestamp = 0;
    const MIN_INTERVAL = 300; // 最小上报间隔（毫秒）
    
    return (e) => {
      const currentUrl = window.location.href;
      const now = Date.now();
      
      // 防抖+重复路径检查+最小时间间隔检查
      if (currentUrl === lastUrl || (now - lastTimestamp < MIN_INTERVAL)) {
        return;
      }
      
      lastUrl = currentUrl;
      lastTimestamp = now;

      const { path, params } = getUrlParam(currentUrl);

      this.track('pageview', {
        pageUrl: path,
        param: {
          params
        }
      });
    };
  }

  _bindClickEvent() {
    // 使用防抖包装点击处理函数
    const debouncedHandler = this._debounce(this._handleClick.bind(this), 300);
    document.addEventListener('click', debouncedHandler, true);
  }

  _handleClick(e) {
    const target = e.target.closest('[data-track-uuid]');
    const data = e.target.closest('[data-track-param]');
    if (target) {
      const { path, params } = getUrlParam(window.location.href);
      this.track('click', {
        clickCode: target.dataset.trackUuid,
        pageUrl: path,
        param: {
          data: JSON.parse(data.dataset.trackParam),
          params: {
            ...params
          }
        }
      });
    }
  }

  use (plugin) {
    if (typeof plugin.install === 'function') {
      plugin.install(this);
      console.log('插件已安装')
    }
    // 支持链式调用
    return this
  }

  track(event, data = {}) {
    if (this._isDestroyed) return;
    
    const payload = {
      appId: this.appId,
      userId: this.userId,
      accreditId: this.accreditId,
      eventType: event,
      referer: document.referrer,
      userAgent: this.deviceInfo.userAgent,
      ...data
    };

    this.queue.push(payload);

    this._flushQueue();
  }

  _debounceFlush() {
    // 清除之前的定时器
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    
    // 设置新的定时器
    this._debounceTimer = setTimeout(() => {
      this._flushQueue();
    }, this._debounceDelay);
  }

  async _flushQueue() {
    if (this.queue.length === 0 || this._isDestroyed) return;
    
    const sendData = [...this.queue];
    this.queue = [];

    try {
      // 真实上报逻辑
      if (this.debug) {
        console.log('debug:', sendData[0]);
      } else {
        console.log('上报成功', sendData[0])
        // await fetch(this.url, {
        //   method: 'POST',
        //   body: JSON.stringify(sendData[0]),
        //   headers: { 'Content-Type': 'application/json' }
        // });
      }
    } catch (err) {
      console.error('上报失败:', err);
      this.queue.unshift(...sendData); // 失败回滚
    }
  }

  // 通用防抖工具函数
  _debounce(func, delay) {
    let timer = null;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  // 销毁方法
  destroy() {
    this._isDestroyed = true;
    clearInterval(this._flushTimer);
    clearTimeout(this._debounceTimer);
    
    // 恢复原生方法
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    
    // 移除事件监听
    // 注意：这里需要使用相同的引用才能正确移除事件监听
    const handleRouteChange = this._createDebouncedRouteHandler();
    window.removeEventListener('popstate', handleRouteChange);
    window.removeEventListener('pushstate', handleRouteChange);
    window.removeEventListener('replacestate', handleRouteChange);
    
    const debouncedHandler = this._debounce(this._handleClick.bind(this), 300);
    document.removeEventListener('click', debouncedHandler, true);
    
    instance = null;
  }
}

const getUrlParam = (url) => {
  if (!url) return {};
  let path = ''
  let params = {}
  let list = ''
  if (url.includes('#')) {
    list = url.split('#')
  } else {
    list = url.split('com')
  }
  if (list[1]) {
    const arr = list[1].split('?')
    path = arr[0]
    if (arr[1]) {
      const paramList = arr[1].split('&')
      paramList.forEach(item => {
        const [key, value] = item.split('=')
        params[key] = value
      })
    }
  }
  return { path, params }
}

const getDeviceInfo = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  let browser = 'unknown';
  let version = 'unknown';

  // 现代浏览器检测（按流行度排序）
  if (userAgent.includes('chrome') && !userAgent.includes('edge')) {
    // Chrome 或 Chromium 内核浏览器
    if (userAgent.includes('edg')) {
      // 新 Edge (Chromium 内核)
      browser = 'Edge';
      version = userAgent.match(/edg\/([\d.]+)/)?.[1] || 'unknown';
    } else if (userAgent.includes('chromium')) {
      browser = 'Chromium';
      version = userAgent.match(/chromium\/([\d.]+)/)?.[1] || 'unknown';
    } else if (userAgent.includes('crios')) {
      browser = 'Chrome for iOS';
      version = userAgent.match(/crios\/([\d.]+)/)?.[1] || 'unknown';
    } else {
      browser = 'Chrome';
      version = userAgent.match(/chrome\/([\d.]+)/)?.[1] || 'unknown';
    }
  } else if (userAgent.includes('firefox') || userAgent.includes('fxios')) {
    // Firefox 或 Firefox for iOS
    browser = userAgent.includes('fxios') ? 'Firefox for iOS' : 'Firefox';
    version = userAgent.match(/firefox\/([\d.]+)/)?.[1] || 
              userAgent.match(/fxios\/([\d.]+)/)?.[1] || 'unknown';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    // Safari 或 Safari for iOS
    if (userAgent.includes('version')) {
      browser = userAgent.includes('iphone') || userAgent.includes('ipad') 
                ? 'Safari for iOS' : 'Safari';
      version = userAgent.match(/version\/([\d.]+)/)?.[1] || 'unknown';
    } else {
      browser = 'Safari';
      version = 'unknown'; // 通常不会出现这种情况
    }
  } else if (userAgent.includes('edge') || userAgent.includes('edg')) {
    // 旧 Edge (EdgeHTML 内核) 或新 Edge (Chromium 内核)
    browser = 'Edge';
    version = userAgent.match(/edge\/([\d.]+)/)?.[1] || 
              userAgent.match(/edg\/([\d.]+)/)?.[1] || 'unknown';
  } else if (userAgent.includes('trident') || userAgent.includes('msie')) {
    // Internet Explorer
    browser = 'Internet Explorer';
    version = userAgent.match(/rv:([\d.]+)/)?.[1] || 
              userAgent.match(/msie ([\d.]+)/)?.[1] || 'unknown';
  } else if (userAgent.includes('opr') || userAgent.includes('opera')) {
    // Opera (新 Chromium 内核)
    browser = 'Opera';
    version = userAgent.match(/opr\/([\d.]+)/)?.[1] || 'unknown';
  } else if (userAgent.includes('brave')) {
    // Brave 浏览器
    browser = 'Brave';
    version = userAgent.match(/brave\/([\d.]+)/)?.[1] || 'unknown';
  } else if (userAgent.includes('yabrowser')) {
    // Yandex 浏览器
    browser = 'Yandex';
    version = userAgent.match(/yabrowser\/([\d.]+)/)?.[1] || 'unknown';
  }

  return {
    browser,
    version,
    userAgent, // 原始 UA 字符串
    platform: navigator.platform, // 设备平台
    isMobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent) // 是否移动设备
  };
}