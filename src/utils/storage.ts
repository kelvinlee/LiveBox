// localStorage 读写工具

export const getLocalBoolean = (key: string, defaultValue = true) => {
    const value = localStorage.getItem(key)
    if (value === null) return defaultValue
    return value === 'true'
}

// 读取 JSON，格式不对或不存在时返回默认值
export const getLocalJson = <T>(key: string, defaultValue: T): T => {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as T) : defaultValue
    } catch {
        return defaultValue
    }
}
