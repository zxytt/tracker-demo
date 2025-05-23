import { createApp } from 'vue';
import { createPinia } from 'pinia';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router';
import { usePermissStore } from './store/permiss';
import 'element-plus/dist/index.css';
import './assets/css/icon.css';
import Tracker from './utils/tracke.js';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// 注册elementplus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
}
// 自定义权限指令
const permiss = usePermissStore();
app.directive('permiss', {
    mounted(el, binding) {
        if (binding.value && !permiss.key.includes(String(binding.value))) {
            el['hidden'] = true;
        }
    },
});

app.mount('#app');

const CustomPlugin = {
  install(sdk) {
    // 监听自定义事件
    window.addEventListener('keyup', (e) => {
      console.log('keyup', e)
      sdk.track('custom_event', { detail: '123' });
    });
  }
};

const tracker = new Tracker({
  appId: 'CargoGo',
  userId: 'hu123456',
  url: 'https://www.cargogo.com.cn/api/track',
  accreditId: 'xcxcxccxc',
}).use(CustomPlugin)

if (tracker) {
  (window as any).tracker = tracker
}




