// 主题：黑白两色切换，未设置过时跟随系统
import { ref } from 'vue'

export const isDark = ref(
    (localStorage.getItem('theme') ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) ===
        'dark',
)

const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark.value)
}
applyTheme()

export const toggleTheme = () => {
    isDark.value = !isDark.value
    localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
    applyTheme()
}

// 其他窗口切换主题时同步
window.addEventListener('storage', (e) => {
    if (e.key !== 'theme' || !e.newValue) return
    isDark.value = e.newValue === 'dark'
    applyTheme()
})
