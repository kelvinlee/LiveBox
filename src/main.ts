import { createApp } from 'vue'
import App from './App.vue'
import '@/assets/static/vFun.js'
import ElementPlus from 'element-plus'
import './assets/static/global.css'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import VirtualScroller from 'vue-virtual-scroller'
// 主题和公共样式：放在组件库样式之后
import './styles/app.scss'

const app = createApp(App)

app.use(ElementPlus)
app.use(VirtualScroller)
app.mount('#app')
