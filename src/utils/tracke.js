// import { getDeviceInfo } from './util'

// 单例控制
let instance = null
// 原生方法缓存
let originalPushState = null
let originalReplaceState = null

export default class Tracker {
  constructor(options = {}) {
    // 单例模式
    if (instance) return instance
    instance = this

    // 配置项验证
    if (!options.appId || !options.userId || !options.url) {
      throw new Error('Missing required parameters: appId, userId, url')
    }

    this.appId = options.appId
    this.userId = options.userId
    this.url = options.url
    this.deviceInfo = getDeviceInfo()
    this.queue = []
    this.maxBatchSize = 10
    this._isDestroyed = false

    // 自动埋点初始化
    this._initCore()
  }

  _initCore() {
    // 保证只初始化一次
    if (this._hasInitialized) return
    this._hasInitialized = true

    // 保存原生方法
    originalPushState = originalPushState || window.history.pushState
    originalReplaceState = originalReplaceState || window.history.replaceState

    // 事件监听
    this._bindRouterEvents()
    this._bindClickEvent()

    // 定时上报
    this._flushTimer = setInterval(() => this._flushQueue(), 10000)
  }

  _bindRouterEvents() {
    // 防重复绑定检查
    if (this._routerEventsBound) return
    this._routerEventsBound = true

    // 重写history方法
    this._patchHistoryMethods()
    
    // 事件处理器（带防抖）
    const handleRouteChange = this._createRouteHandler()
    
    // 监听事件
    window.addEventListener('popstate', handleRouteChange)
    window.addEventListener('pushstate', handleRouteChange)
    window.addEventListener('replacestate', handleRouteChange)
  }

  _patchHistoryMethods() {
    // 代理pushState
    window.history.pushState = (state, title, url) => {
      const result = originalPushState.call(history, state, title, url)
      window.dispatchEvent(new CustomEvent('pushstate', { detail: { url, state }}))
      return result
    }

    // 代理replaceState
    window.history.replaceState = (state, title, url) => {
      const result = originalReplaceState.call(history, state, title, url)
      window.dispatchEvent(new CustomEvent('replacestate', { detail: { url, state }}))
      return result
    }
  }

  _createRouteHandler() {
    let lastUrl = ''
    const debounceTime = 300
    
    return (e) => {
      const currentUrl = window.location.href
      console.log(e.type, currentUrl)
      // 防抖+重复路径检查
      if (currentUrl === lastUrl) return
      lastUrl = currentUrl
      

      this.track('pageview', {
        uuid: currentUrl.split('#')[1],
        url: currentUrl.split('#')[1],
      })
    }
  }

  _bindClickEvent() {
    // 使用一次性监听避免重复绑定
    document.addEventListener('click', this._handleClick.bind(this), true)
  }

  _handleClick(e) {
    const target = e.target.closest('[data-track]')
    if (target) {
      this.track('click', {
        uuid: target.dataset.track,
        url: window.location.href.split('#')[1],
      })
    }
  }

  track(event, data = {}) {
    if (this._isDestroyed) return
    const payload = {
      event,
      timestamp: Date.now(),
      appId: this.appId,
      userId: this.userId,
      deviceInfo: this.deviceInfo,
      ...data
    }

    this.queue.push(payload)
    // if (this.queue.length >= this.maxBatchSize) {
      this._flushQueue()
    // }
  }

  async _flushQueue() {
    if (this.queue.length === 0 || this._isDestroyed) return
    
    const sendData = [...this.queue]
    this.queue = []

    try {
      // 真实上报逻辑
      // await fetch(this.url, {
      //   method: 'POST',
      //   body: JSON.stringify(sendData),
      //   headers: { 'Content-Type': 'application/json' }
      // })
      console.log('上报数据:', sendData)
      const localstorageData = JSON.parse(localStorage.getItem('trackData') || '[]')
      localStorage.setItem('trackData', JSON.stringify([...localstorageData, ...sendData]))
    } catch (err) {
      console.error('上报失败:', err)
      this.queue.unshift(...sendData) // 失败回滚
    }
  }

  // 销毁方法
  destroy() {
    this._isDestroyed = true
    clearInterval(this._flushTimer)
    
    // 恢复原生方法
    window.history.pushState = originalPushStateb
    window.history.replaceState = originalReplaceState
    
    // 移除事件监听
    window.removeEventListener('popstate', this._handleRouteChange)
    window.removeEventListener('pushstate', this._handleRouteChange)
    window.removeEventListener('replacestate', this._handleRouteChange)
    document.removeEventListener('click', this._handleClick, true)
    
    instance = null
  }
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