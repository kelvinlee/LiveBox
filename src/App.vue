<template>
    <div class="app">
        <!-- 顶栏：地址输入、采集控制、连接状态和工具按钮 -->
        <header class="topbar">
            <div class="brand">
                <svg class="brandMark" viewBox="180 180 664 664">
                    <path
                        d="M756 512A244 244 0 1 1 662.2 319.7"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="96"
                    />
                    <rect
                        x="540"
                        y="464"
                        width="259"
                        height="96"
                        fill="currentColor"
                    />
                    <circle cx="721" cy="386" r="42" fill="currentColor" />
                </svg>
                <span class="brandName">GiccooBox</span>
            </div>
            <div class="urlBar">
                <!-- 已保存的直播间 -->
                <el-popover
                    v-model:visible="roomPopVisible"
                    trigger="click"
                    placement="bottom-start"
                    :width="340"
                    popper-class="roomPopper"
                >
                    <template #reference>
                        <button class="btn roomBtn" title="已保存的直播间">
                            <span class="roomBtnText">
                                {{ activeRoom ? activeRoom.name : '直播间' }}
                            </span>
                            <el-icon :size="12"><ArrowDown /></el-icon>
                        </button>
                    </template>
                    <div class="roomPop">
                        <div class="roomPopHead">
                            <span class="roomPopTitle">直播间</span>
                            <span class="roomAct" @click="openRoomForm()">
                                + 新建
                            </span>
                        </div>
                        <div v-if="roomForm" class="roomForm">
                            <el-input
                                v-model="roomForm.name"
                                placeholder="名称，例如主播昵称"
                            />
                            <el-input
                                v-model="roomForm.url"
                                placeholder="直播间地址"
                            />
                            <div class="roomFormBtns">
                                <el-button size="small" @click="roomForm = null">
                                    取消
                                </el-button>
                                <el-button
                                    size="small"
                                    type="primary"
                                    @click="saveRoomForm"
                                >
                                    保存
                                </el-button>
                            </div>
                        </div>
                        <div class="roomList">
                            <div
                                v-for="room in savedRooms"
                                :key="room.id"
                                class="roomItem"
                                :class="{ active: room.url === inputUrl.trim() }"
                                @click="selectRoom(room)"
                            >
                                <div class="roomInfo">
                                    <div class="roomName">
                                        <span class="roomNameText">
                                            {{ room.name }}
                                        </span>
                                        <!-- 是否正在直播 -->
                                        <span
                                            v-if="roomChecking === room.url"
                                            class="roomLive"
                                        >
                                            检查中
                                        </span>
                                        <span
                                            v-else-if="roomLive[room.url]"
                                            class="roomLive"
                                            :class="{ on: roomLive[room.url].live }"
                                        >
                                            {{
                                                roomLive[room.url].live
                                                    ? '直播中'
                                                    : '未开播'
                                            }}
                                        </span>
                                    </div>
                                    <div class="roomUrl">{{ room.url }}</div>
                                </div>
                                <span
                                    class="roomAct"
                                    @click.stop="openRoomForm(room)"
                                >
                                    编辑
                                </span>
                                <span
                                    class="roomAct"
                                    @click.stop="removeRoom(room)"
                                >
                                    删除
                                </span>
                            </div>
                            <div v-if="!savedRooms.length" class="roomEmpty">
                                还没有保存的直播间，点「新建」添加
                            </div>
                        </div>
                    </div>
                </el-popover>
                <el-autocomplete
                    class="urlInput"
                    v-model="inputUrl"
                    :fetch-suggestions="queryUrlHistory"
                    placeholder="请输入直播间地址"
                    :trigger-on-focus="true"
                    clearable
                    @select="onUrlSelect"
                />
                <button
                    class="btn start"
                    :class="socketStatus"
                    @click="startListen"
                >
                    {{ startButtonText }}
                </button>
                <button class="btn" @click="clearLivex">停止</button>
            </div>
            <div class="tools">
                <span class="status" :class="socketStatus">
                    <i class="dot"></i>{{ socketStatusText }}
                </span>
                <!-- 抖音登录状态：点击打开设置 -->
                <span
                    class="status login"
                    :class="loginState.level"
                    :title="loginState.detail"
                    @click="dialogVisible = true"
                >
                    <i class="dot"></i>{{ loginState.text }}
                </span>
                <button
                    class="iconBtn"
                    :title="isDark ? '切换到浅色' : '切换到深色'"
                    @click="toggleTheme"
                >
                    <el-icon :size="16">
                        <Sunny v-if="isDark" />
                        <Moon v-else />
                    </el-icon>
                </button>
                <button
                    class="iconBtn"
                    title="设置"
                    @click="dialogVisible = true"
                >
                    <el-icon :size="16"><Setting /></el-icon>
                </button>
            </div>
        </header>

        <main class="main">
            <!-- 左侧：主播信息 + 直播画面 -->
            <section class="stage">
                <div class="anchorBar">
                    <img :src="liveInfo.avatar" alt="头像" class="avatar" />
                    <div class="anchorText">
                        <div class="anchorName">{{ liveInfo.name }}</div>
                        <div class="anchorTitle">{{ liveInfo.title }}</div>
                    </div>
                    <div class="stats">
                        <div class="stat">
                            <span class="statValue">
                                {{ liveInfo.customer }}
                            </span>
                            <span class="statLabel">在线观众</span>
                        </div>
                        <div class="stat">
                            <span class="statValue">
                                {{ liveInfo.totalLike }}
                            </span>
                            <span class="statLabel">本场点赞</span>
                        </div>
                        <div class="stat" @click="handlePay">
                            <span class="statValue">{{ liveInfo.fans }}</span>
                            <span class="statLabel">主播粉丝</span>
                        </div>
                        <div class="stat">
                            <span class="statValue">{{ diamond }}</span>
                            <span class="statLabel">主播收益</span>
                        </div>
                    </div>
                </div>
                <div class="player">
                    <!-- 视频播放器 -->
                    <div id="dplayer" class="dplayer"></div>
                    <div v-if="liveInfo.status === 0" class="playerTip">
                        输入直播间地址，点击「开始采集」
                    </div>
                    <!-- 直播结束 -->
                    <div v-if="liveInfo.status === 4" class="playerTip">
                        直播已结束
                    </div>
                </div>
            </section>

            <!-- 右侧：消息列表 -->
            <aside class="chat">
                <div class="panelHead">
                    <span class="panelTitle">消息</span>
                    <span class="panelMeta">{{ messageList.length }}</span>
                </div>
                <!-- 长列表优化 -->
                <DynamicScroller
                    :items="messageList"
                    :min-item-size="28"
                    class="chatList"
                    id="liveMsg"
                    ref="liveMsg"
                    v-if="messageList.length"
                >
                    <template v-slot="{ item, active }">
                        <DynamicScrollerItem
                            :item="item"
                            :active="active"
                            :size-dependencies="[item.name, item.msg]"
                            :data-index="item.id"
                        >
                            <div class="msg" :class="item.type">
                                <span
                                    class="msgName"
                                    :class="{ clickable: item.user }"
                                    :title="item.user ? '点击补发礼物' : ''"
                                    @click="item.user && openResend(item)"
                                >
                                    {{ item.name }}
                                </span>
                                <span class="msgText" v-html="item.msg"></span>
                            </div>
                        </DynamicScrollerItem>
                    </template>
                </DynamicScroller>
            </aside>
        </main>

        <!-- 后台日志 -->
        <!-- 没有勾选「使用后台」时不显示 -->
        <section
            v-if="useBackend"
            class="logs"
            :class="{ collapsed: logCollapsed }"
        >
            <div class="panelHead">
                <span class="panelTitle">后台日志</span>
                <span class="panelMeta">{{ backendLogs.length }} 行</span>
                <div class="panelActions">
                    <span class="textBtn" @click="clearBackendLogs">清空</span>
                    <span class="textBtn" @click="stopBackend">停止后台</span>
                    <span
                        class="textBtn"
                        :class="{ disabled: backendRestarting }"
                        @click="restartBackend"
                    >
                        {{ backendRestarting ? '重启中...' : '重启后台' }}
                    </span>
                    <span class="textBtn" @click="logCollapsed = !logCollapsed">
                        {{ logCollapsed ? '展开' : '收起' }}
                    </span>
                </div>
            </div>
            <div
                v-show="!logCollapsed"
                class="logBody"
                ref="logBody"
                @scroll="onLogScroll"
            >
                <div
                    v-for="log in backendLogs"
                    :key="log.seq"
                    class="logLine"
                    :class="log.stream"
                >
                    {{ log.line }}
                </div>
                <div v-if="!backendLogs.length" class="logEmpty">
                    暂无日志，勾选「使用后台」并开始采集后，后台的输出会显示在这里
                </div>
            </div>
        </section>

        <!-- 底部：版本号 -->
        <footer class="footer">
            <span class="footerVersion">v{{ appVersion }}</span>
        </footer>
    </div>

    <!-- 补发礼物 -->
    <el-dialog v-model="resendVisible" title="补发礼物" width="520">
        <div class="resend">
            <div class="resendUser">
                <img
                    v-if="resendTarget.avatar"
                    :src="resendTarget.avatar"
                    alt="头像"
                    class="resendAvatar"
                />
                <span class="resendLabel">补发给</span>
                <span class="resendName">{{ resendTarget.name }}</span>
            </div>
            <el-input
                v-model="giftKeyword"
                placeholder="搜索礼物"
                clearable
            />
            <!-- 收到过的礼物种类 -->
            <div class="giftGrid">
                <div
                    v-for="gift in filteredGifts"
                    :key="gift.id"
                    class="giftTile"
                    :class="{ active: gift.id === resendGiftId }"
                    @click="resendGiftId = gift.id"
                >
                    <img
                        v-if="gift.icon"
                        :src="gift.icon"
                        alt=""
                        class="giftIcon"
                    />
                    <div v-else class="giftIcon"></div>
                    <div class="giftName">{{ gift.name }}</div>
                    <div class="giftPrice">{{ gift.diamondCount }} 钻</div>
                </div>
                <div v-if="!filteredGifts.length" class="giftEmpty">
                    {{
                        giftCatalog.length
                            ? '没有匹配的礼物'
                            : '还没有收到过礼物，采集到的礼物种类会自动记录在这里'
                    }}
                </div>
            </div>
            <div class="resendCount">
                <span class="resendLabel">数量</span>
                <el-input-number
                    v-model="resendCount"
                    :min="1"
                    :max="9999"
                    :precision="0"
                />
                <span v-if="selectedGift" class="resendTotal">
                    {{ selectedGift.name }} x{{ resendCount }}，合计
                    {{ selectedGift.diamondCount * resendCount }} 钻
                </span>
            </div>
        </div>
        <template #footer>
            <el-button @click="resendVisible = false">取消</el-button>
            <el-button
                type="primary"
                :loading="resendSending"
                :disabled="!selectedGift"
                @click="sendResend"
            >
                补发
            </el-button>
        </template>
    </el-dialog>

    <!-- 设置 -->
    <el-dialog v-model="dialogVisible" title="设置" width="560">
        <div class="form">
            <div class="formRow">
                <label>房间号</label>
                <el-input v-model="roomId" placeholder="请输入房间号" />
            </div>
            <div class="formRow">
                <label>推送地址</label>
                <el-input v-model="pushUrl" placeholder="请输入推送地址" />
            </div>
            <p class="formHint">
                消息会以 POST 请求发送到该地址，请确保它能接收 POST 请求
            </p>
            <div class="formRow">
                <label>后台目录</label>
                <el-input
                    v-model="projectPath"
                    placeholder="请选择 Node.js 项目目录"
                    readonly
                />
                <el-button @click="selectProjectPath">选择</el-button>
            </div>
            <div class="formRow">
                <label>exe 文件</label>
                <el-input
                    v-model="exePath"
                    placeholder="请选择 exe 文件"
                    readonly
                />
                <el-button @click="selectExePath">选择</el-button>
            </div>
            <div class="formRow">
                <label>启动项</label>
                <el-checkbox v-model="useBackend">使用后台</el-checkbox>
                <el-checkbox v-model="useExe">使用 exe</el-checkbox>
            </div>
            <div class="formRow">
                <label>抖音登录</label>
                <el-button @click="openDouyinLogin">打开登录页</el-button>
                <el-button type="primary" @click="syncDouyinCookies">
                    同步 Cookie
                </el-button>
                <span v-if="douyinCookie" class="cookieOk">已保存 Cookie</span>
            </div>
            <p class="formHint">礼物等消息需要登录态</p>
            <div class="formRow">
                <label>消息类型</label>
                <el-checkbox-group v-model="checkList">
                    <el-checkbox label="聊天" value="chat" />
                    <el-checkbox label="礼物" value="gift" />
                    <el-checkbox label="点赞" value="like" />
                    <el-checkbox label="关注" value="follow" />
                    <el-checkbox label="进来" value="comein" />
                </el-checkbox-group>
            </div>
        </div>
        <template #footer>
            <el-button type="primary" @click="dialogVisible = false">
                完成
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ArrowDown, Moon, Setting, Sunny } from '@element-plus/icons-vue'
import { invoke } from '@tauri-apps/api/tauri'
import {
    computed,
    markRaw,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
} from 'vue'
import { default as axios } from 'axios'
import { DPlayerImp, LiveInfoImp } from '@/types'
import Logo from '@/assets/logo.png'
import { ConnectionConfig } from 'tauri-plugin-websocket-api'
import { douyin } from '@/proto/dy.js'
import { ElMessage, ElMessageBox } from 'element-plus'
import DPlayer from 'dplayer'
import Hls from 'hls.js'
import Flv from 'flv.js'
import pako from 'pako'
import SocketCli, { SocketStatus } from '@/utils/RustSocket'
import { emit, listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/api/dialog'

// 直播间地址
const inputUrl = ref(localStorage.getItem('url') || '')
// URL 历史记录（localStorage 持久化，最多保留 20 条，最新的在前）
const URL_HISTORY_KEY = 'url_history'
const getUrlHistory = (): string[] => {
    try {
        const raw = localStorage.getItem(URL_HISTORY_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}
const saveUrlHistory = (list: string[]) => {
    const trimmed = list.filter(u => u.trim()).slice(0, 20)
    localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(trimmed))
}
const addUrlToHistory = (url: string) => {
    const u = url.trim()
    if (!u) return
    const list = getUrlHistory().filter(item => item !== u)
    list.unshift(u)
    saveUrlHistory(list)
}
const queryUrlHistory = (queryString: string, cb: (results: { value: string }[]) => void) => {
    const list = getUrlHistory()
    if (!queryString) {
        cb(list.map(value => ({ value })))
    } else {
        const q = queryString.toLowerCase()
        cb(list.filter(u => u.toLowerCase().includes(q)).map(value => ({ value })))
    }
}
const onUrlSelect = (item: { value: string }) => {
    inputUrl.value = item.value
}
const dialogVisible = ref(false)
const getLocalBoolean = (key: string, defaultValue: boolean = true) => {
    const value = localStorage.getItem(key)
    if (value === null) return defaultValue
    return value === 'true'
}
const messageList = ref([
    {
        id: '1',
        type: 'chat',
        name: 'Kelvin',
        msg: '欢迎使用弹幕工具',
    },
])
// websocket client
let socketClient: SocketCli | null = null
// websocket 连接状态
const socketStatus = ref<SocketStatus>('closed')
const socketStatusText = computed(() => {
    switch (socketStatus.value) {
        case 'connected':
            return '已连接'
        case 'reconnecting':
            return '重连中'
        default:
            return '未连接'
    }
})
// 主题：黑白两色切换，未设置过时跟随系统
const isDark = ref(
    (localStorage.getItem('theme') ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light')) === 'dark',
)
const applyTheme = () => {
    document.documentElement.classList.toggle('dark', isDark.value)
}
applyTheme()
const toggleTheme = () => {
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
// 采集按钮上的文字：跟随连接状态
const startButtonText = computed(() => {
    switch (socketStatus.value) {
        case 'connected':
            return '采集中'
        case 'reconnecting':
            return '重连中'
        default:
            return '开始采集'
    }
})
// 是否正在启动采集：防止重复点击
let starting = false

// 主播信息
const liveInfo = ref({
    uid: '888888',
    status: 0, // 直播间状态4是已结束
    title: '直播标题',
    name: 'GiccooBox',
    roomId: '888888',
    avatar: Logo,
    fans: 0,
    customer: 0,
    totalLike: 0,
    signature: '',
})

// 主播收益
const diamond = ref(0)

// 推送流地址
const pushUrl = ref(localStorage.getItem('pushUrl') || '')
// 启动 exe 使用的房间号
const roomId = ref(localStorage.getItem('roomId') || '')
// Node.js 项目目录
const projectPath = ref(localStorage.getItem('projectPath') || '')
// exe 文件路径
const exePath = ref(localStorage.getItem('exePath') || '')
// 是否使用后台
const useBackend = ref(getLocalBoolean('useBackend', true))
// 是否使用 exe
const useExe = ref(getLocalBoolean('useExe', true))
// 从登录 WebView 同步的整段 Cookie，用于拉房间页与 WebSocket（localStorage 持久化）
const douyinCookie = ref(localStorage.getItem('douyinCookie') || '')
// 选中消息类型
const checkList = ref<string[]>(['chat', 'gift', 'like'])
// 录制视频
const recordVideo = ref<string[]>([])

// 聊天消息盒子
const liveMsg = ref()

// 直播播放器
let dplayer: DPlayerImp | null = null
let liveNum = 100

// ---------- 抖音登录状态 ----------
// 上次同步 Cookie 的时间(毫秒)，0 表示没有记录
const douyinCookieTime = ref(
    Number(localStorage.getItem('douyinCookieTime')) || 0,
)
// 登录超过这个时间就提示重新登录
const LOGIN_EXPIRE_MS = 3 * 24 * 60 * 60 * 1000
// 当前时间：每分钟刷新一次，程序一直开着时状态也会按时变成过期
const nowTick = ref(Date.now())
const nowTimer = setInterval(() => (nowTick.value = Date.now()), 60 * 1000)
onBeforeUnmount(() => clearInterval(nowTimer))

// Cookie 里是否带有登录会话：没有 sessionid 说明只是游客 Cookie
const hasLoginSession = (cookie: string) =>
    cookie.split(';').some((part) => {
        const index = part.indexOf('=')
        if (index < 0) return false
        const name = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        return (name === 'sessionid' || name === 'sessionid_ss') && value !== ''
    })

// 打开程序时向抖音确认一次登录是否还有效：只请求这一次，之后不再重复
// unknown 表示没有校验过，或者校验时网络失败、无法判断
const loginCheck = ref<'unknown' | 'valid' | 'invalid'>('unknown')
onMounted(async () => {
    const cookie = douyinCookie.value.trim()
    if (!cookie || !hasLoginSession(cookie)) return
    try {
        const state = await invoke<string>('check_douyin_login', { cookie })
        // 校验期间用户重新同步了 Cookie，则这次结果作废
        if (douyinCookie.value.trim() !== cookie) return
        if (state === 'valid' || state === 'invalid') loginCheck.value = state
    } catch (e) {
        console.error('check_douyin_login error:', e)
    }
})

const formatAge = (ms: number) => {
    const hours = Math.floor(ms / (60 * 60 * 1000))
    if (hours < 1) return '不到 1 小时'
    if (hours < 24) return `${hours} 小时`
    return `${Math.floor(hours / 24)} 天`
}

// 登录状态：level 为 ok 时是正常提示，warn 时需要用户处理
const loginState = computed(() => {
    const cookie = douyinCookie.value.trim()
    if (!cookie) {
        return {
            level: 'warn',
            text: '未登录',
            detail: '还没有登录抖音，礼物等消息可能收不到。点击打开设置进行登录',
        }
    }
    if (!hasLoginSession(cookie)) {
        return {
            level: 'warn',
            text: '登录无效',
            detail: '保存的 Cookie 里没有登录信息，请重新登录并同步 Cookie',
        }
    }
    if (loginCheck.value === 'invalid') {
        return {
            level: 'warn',
            text: '登录已失效',
            detail: '抖音返回当前登录已失效，请重新登录并同步 Cookie',
        }
    }
    if (!douyinCookieTime.value) {
        return {
            level: 'warn',
            text: '登录需更新',
            detail: '没有记录上次登录的时间，无法判断是否过期，建议重新同步 Cookie',
        }
    }
    const age = Math.max(0, nowTick.value - douyinCookieTime.value)
    if (age > LOGIN_EXPIRE_MS) {
        return {
            level: 'warn',
            text: '登录已过期',
            detail: `距离上次登录已经 ${formatAge(age)}，超过 3 天，请重新登录并同步 Cookie`,
        }
    }
    return {
        level: 'ok',
        text: '已登录',
        detail: `${formatAge(age)}前登录，3 天后会提示重新登录`,
    }
})

const openDouyinLogin = async () => {
    try {
        await invoke('open_douyin_login_window')
        ElMessage.success('已打开登录窗口，请在窗口内完成登录后点「同步 Cookie」')
    } catch (e) {
        ElMessage.error(String(e))
    }
}

const syncDouyinCookies = async () => {
    try {
        const cookie = await invoke<string>('sync_douyin_cookies_from_webview')
        douyinCookie.value = cookie
        localStorage.setItem('douyinCookie', cookie)
        // 记录本次登录(同步)的时间，用于判断是否过期
        douyinCookieTime.value = Date.now()
        // 新同步的 Cookie 不沿用之前的校验结果
        loginCheck.value = 'unknown'
        localStorage.setItem('douyinCookieTime', String(douyinCookieTime.value))
        if (hasLoginSession(cookie)) {
            ElMessage.success('Cookie 已保存')
        } else {
            ElMessage.warning(
                'Cookie 已保存，但里面没有登录信息，请先在登录页完成登录再同步',
            )
        }
    } catch (e) {
        ElMessage.error(String(e))
    }
}

// 新窗口
const openWindow = () => {
    invoke('open_window', {
        appUrl: inputUrl.value,
        appName: '直播盒子' + liveNum++,
        platform: 'web',
        userAgent: navigator.userAgent,
        resize: false,
        width: 1000,
        height: 800,
        jsContent: '',
    })
}

// 当前版本号：构建时从 tauri.conf.json 的 package.version 注入
const appVersion = __APP_VERSION__

// 快捷键 Ctrl+N(macOS 为 Cmd+N)：打开新窗口
const onGlobalKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        // 按住不放时不连续开窗口
        if (!e.repeat) openLiveboxWindow()
    }
}
window.addEventListener('keydown', onGlobalKeydown)
onBeforeUnmount(() => {
    window.removeEventListener('keydown', onGlobalKeydown)
})

// 打开新的 Livebox 窗口
const openLiveboxWindow = async () => {
    try {
        await invoke('open_livebox_window')
        ElMessage.success('已打开新窗口')
    } catch (e) {
        ElMessage.error(String(e))
    }
}

// call pay
const handlePay = () => {
    console.log('emit handlepay')
    emit('handlepay')
}

// listen('handlepay', () => {
//     console.log('Received handlepay:')
// })

// ---------- 礼物种类记录 & 补发礼物 ----------
// 收到过的礼物种类：gift 是礼物的完整数据，补发时原样发给后台
interface GiftKind {
    id: string
    name: string
    diamondCount: number
    icon: string
    gift: any
}
// 礼物种类长期保存在应用数据目录的 gift_catalog.json 里(由 Rust 端读写)，
// 不放在 localStorage：清理浏览数据不会丢，多个窗口共用同一份
const giftCatalog = ref<GiftKind[]>([])
const knownGiftIds = new Set<string>()

// 把礼物种类加入当前窗口的列表(不写文件)
const addGiftKindsLocal = (kinds: GiftKind[]) => {
    kinds.forEach((kind) => {
        if (!kind || !kind.id || knownGiftIds.has(kind.id)) return
        knownGiftIds.add(kind.id)
        // 礼物数据不需要响应式
        giftCatalog.value.push({ ...kind, gift: markRaw(kind.gift || {}) })
    })
}

// 写入长期存储，失败时提示一次
let giftSaveErrorShown = false
const saveGiftKinds = async (kinds: GiftKind[]) => {
    try {
        await invoke('add_gift_kinds', { kinds })
    } catch (e) {
        console.error('保存礼物种类失败:', e)
        if (!giftSaveErrorShown) {
            giftSaveErrorShown = true
            ElMessage.error('礼物种类保存失败: ' + String(e))
        }
    }
}

let unlistenGiftKinds: (() => void) | null = null
onMounted(async () => {
    try {
        // 其他窗口记录了新的礼物种类时同步过来
        unlistenGiftKinds = await listen<GiftKind[]>(
            'gift-kinds-added',
            (event) => addGiftKindsLocal(event.payload),
        )
        // 加载已保存的礼物种类。加载完成前本窗口已经收到的礼物也要补存进去
        const receivedBeforeLoad = giftCatalog.value.slice()
        const saved = await invoke<GiftKind[]>('get_gift_catalog')
        const savedIds = new Set(saved.map((g) => g.id))
        addGiftKindsLocal(saved)
        const missing = receivedBeforeLoad.filter((g) => !savedIds.has(g.id))
        if (missing.length) await saveGiftKinds(missing)
    } catch (e) {
        console.error('加载礼物种类失败:', e)
    }
})
onBeforeUnmount(() => {
    unlistenGiftKinds?.()
})

// 收到礼物时记录它的种类：只有第一次见到的礼物才会写入
const recordGiftKind = (giftId: string, gift: any) => {
    if (!gift || !giftId || giftId === '0' || knownGiftIds.has(giftId)) return
    // 转成普通对象，和正常推送给后台的格式一致
    const giftJson = typeof gift.toJSON === 'function' ? gift.toJSON() : gift
    const kind: GiftKind = {
        id: giftId,
        name: gift.name || '未知礼物',
        diamondCount: gift.diamondCount || 0,
        icon: gift.icon?.urlListList?.[0] || '',
        gift: giftJson,
    }
    addGiftKindsLocal([kind])
    saveGiftKinds([kind])
}

// 消息里保留观众信息用于补发，不需要响应式
const rawUser = (user: any) => (user ? markRaw(user) : null)

const resendVisible = ref(false)
const resendSending = ref(false)
const resendTarget = ref<{ name: string; avatar: string; user: any }>({
    name: '',
    avatar: '',
    user: null,
})
const resendGiftId = ref('')
const resendCount = ref(1)
const giftKeyword = ref('')
// 价格高的排在前面
const filteredGifts = computed(() => {
    const keyword = giftKeyword.value.trim().toLowerCase()
    return giftCatalog.value
        .filter((g) => !keyword || g.name.toLowerCase().includes(keyword))
        .sort((a, b) => b.diamondCount - a.diamondCount)
})
const selectedGift = computed(() =>
    giftCatalog.value.find((g) => g.id === resendGiftId.value),
)

// 点击消息列表里的观众，打开补发礼物
const openResend = (item: any) => {
    if (!item.user) return
    resendTarget.value = {
        name: item.name,
        avatar: item.user.AvatarThumb?.urlListList?.[0] || '',
        user: markRaw(item.user),
    }
    resendCount.value = 1
    giftKeyword.value = ''
    resendVisible.value = true
}

// 补发：按正常礼物消息的格式发给后台，多一个 resend 标记
const sendResend = async () => {
    const kind = selectedGift.value
    const target = resendTarget.value
    if (!kind || !target.user || resendSending.value) return
    if (pushUrl.value.trim() === '') {
        ElMessage.error('请先在设置里填写推送地址')
        return
    }
    const count = Math.max(1, Math.floor(resendCount.value || 1))
    const id =
        'resend_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const item = {
        id,
        type: 'gift',
        user: target.user,
        gift: kind.gift,
        repeatCount: count,
        totalCount: count,
        repeatEnd: 1,
        // 标记这是手动补发的礼物
        resend: true,
    }
    resendSending.value = true
    try {
        await axios.post(
            pushUrl.value.trim() + '/' + roomId.value,
            { type: 'gift_batch', items: [item] },
            { timeout: PUSH_TIMEOUT },
        )
        ElMessage.success(`已补发 ${kind.name} x${count} 给 ${target.name}`)
        pushMsg({
            id,
            type: 'gift',
            name: target.name,
            user: target.user,
            msg: `补发 <image src="${kind.icon}" style="width: 20px; margin-top:-0.2em"/> ${kind.name} x${count}个 (${kind.diamondCount}钻)`,
        })
        resendVisible.value = false
    } catch (e) {
        // 补发不自动重试，避免后台实际已经收到时重复发放
        ElMessage.error('补发失败，后台没有确认收到: ' + String(e))
    } finally {
        resendSending.value = false
    }
}

// ---------- 已保存的直播间 ----------
interface SavedRoom {
    id: string
    name: string
    url: string
}
const SAVED_ROOMS_KEY = 'saved_rooms'
const loadSavedRooms = (): SavedRoom[] => {
    try {
        const list = JSON.parse(localStorage.getItem(SAVED_ROOMS_KEY) || '[]')
        return Array.isArray(list) ? list : []
    } catch {
        return []
    }
}
const savedRooms = ref<SavedRoom[]>(loadSavedRooms())
const persistSavedRooms = () => {
    localStorage.setItem(SAVED_ROOMS_KEY, JSON.stringify(savedRooms.value))
}
const roomPopVisible = ref(false)
// 正在新建/编辑的直播间：id 为空表示新建
const roomForm = ref<SavedRoom | null>(null)
// 当前地址对应的已保存直播间
const activeRoom = computed(() =>
    savedRooms.value.find((room) => room.url === inputUrl.value.trim()),
)

// ---------- 直播间是否在直播 ----------
// 检查结果 10 分钟内不重复请求
const ROOM_LIVE_TTL = 10 * 60 * 1000
// key 为直播间地址；at 是检查的时间
const roomLive = ref<Record<string, { live: boolean; at: number }>>({})
// 正在检查的直播间地址
const roomChecking = ref('')
let roomCheckRunning = false

const setRoomLive = (url: string, live: boolean) => {
    if (!url) return
    roomLive.value[url] = { live, at: Date.now() }
}

// 拉取直播间页面判断是否在直播；获取失败按未开播处理
const fetchRoomLive = async (url: string) => {
    try {
        const roomJson = await invoke<LiveInfoImp>('get_live_html', {
            url,
            cookie: douyinCookie.value.trim() || null,
        })
        const info = JSON.parse(roomJson.room_info)
        return !!(info.id_str && info.status && info.status !== 4)
    } catch {
        return false
    }
}

// 依次检查列表里的直播间：一个检查完再检查下一个，列表关闭后停止
const checkRoomsLive = async () => {
    if (roomCheckRunning) return
    roomCheckRunning = true
    try {
        for (const room of savedRooms.value.slice()) {
            if (!roomPopVisible.value) break
            const cached = roomLive.value[room.url]
            if (cached && Date.now() - cached.at < ROOM_LIVE_TTL) continue
            roomChecking.value = room.url
            const live = await fetchRoomLive(room.url)
            setRoomLive(room.url, live)
        }
    } finally {
        roomChecking.value = ''
        roomCheckRunning = false
    }
}

// 打开直播间列表时检查
watch(roomPopVisible, (visible) => {
    if (visible) checkRoomsLive()
})

const openRoomForm = (room?: SavedRoom) => {
    if (room) {
        roomForm.value = { ...room }
        return
    }
    // 新建时带上当前输入的地址；如果正在采集这个地址，名称默认用主播昵称
    const url = inputUrl.value.trim()
    const collecting =
        liveInfo.value.status !== 0 && url === localStorage.getItem('url')
    roomForm.value = {
        id: '',
        name: collecting ? liveInfo.value.name : '',
        url,
    }
}

const saveRoomForm = () => {
    const form = roomForm.value
    if (!form) return
    const url = form.url.trim()
    if (!url) {
        ElMessage.error('请输入直播间地址')
        return
    }
    if (savedRooms.value.some((r) => r.url === url && r.id !== form.id)) {
        ElMessage.error('这个地址已经保存过了')
        return
    }
    const name = form.name.trim() || url
    const exist = savedRooms.value.find((r) => r.id === form.id)
    if (exist) {
        // 正在使用被编辑的直播间时，地址跟着更新
        if (inputUrl.value.trim() === exist.url) inputUrl.value = url
        exist.name = name
        exist.url = url
    } else {
        savedRooms.value.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name,
            url,
        })
    }
    persistSavedRooms()
    roomForm.value = null
}

const selectRoom = (room: SavedRoom) => {
    inputUrl.value = room.url
    roomPopVisible.value = false
}

const removeRoom = async (room: SavedRoom) => {
    try {
        await ElMessageBox.confirm(`删除直播间「${room.name}」？`, '删除直播间', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        })
    } catch {
        return
    }
    savedRooms.value = savedRooms.value.filter((r) => r.id !== room.id)
    persistSavedRooms()
}

// 其他窗口修改了直播间列表时同步
window.addEventListener('storage', (e) => {
    if (e.key === SAVED_ROOMS_KEY) savedRooms.value = loadSavedRooms()
})

// ---------- 后台日志 ----------
interface BackendLog {
    seq: number
    stream: string
    line: string
}
// 界面上最多保留的日志行数
const MAX_LOG_LINES = 1000
const backendLogs = ref<BackendLog[]>([])
const logCollapsed = ref(getLocalBoolean('logCollapsed', false))
const logBody = ref<HTMLElement | null>(null)
// 是否自动滚动到底部：用户向上翻看时暂停，回到底部后恢复
let logStickBottom = true
let unlistenBackendLog: (() => void) | null = null

const onLogScroll = () => {
    const el = logBody.value
    if (!el) return
    logStickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30
}

const appendBackendLogs = (logs: BackendLog[]) => {
    if (!logs.length) return
    backendLogs.value.push(...logs)
    if (backendLogs.value.length > MAX_LOG_LINES) {
        backendLogs.value.splice(0, backendLogs.value.length - MAX_LOG_LINES)
    }
    if (logStickBottom) {
        nextTick(() => {
            const el = logBody.value
            if (el) el.scrollTop = el.scrollHeight
        })
    }
}

const clearBackendLogs = () => {
    backendLogs.value = []
    logStickBottom = true
}

const stopBackend = async () => {
    try {
        const stopped = await invoke<boolean>('stop_npm_dev')
        if (stopped) {
            ElMessage.success('后台已停止')
        } else {
            ElMessage.info('没有由本程序启动的后台在运行')
        }
    } catch (e) {
        ElMessage.error(String(e))
    }
}

// 重启后台：后台报错或卡死时使用
const backendRestarting = ref(false)
const restartBackend = async () => {
    if (backendRestarting.value) return
    const projectPathStr = projectPath.value.trim()
    if (!projectPathStr) {
        ElMessage.error('请先在设置里选择后台目录')
        return
    }
    backendRestarting.value = true
    try {
        await invoke('restart_npm_dev', { projectPath: projectPathStr })
        ElMessage.success('后台已重新启动')
    } catch (e) {
        ElMessage.error('重启后台失败: ' + String(e))
    } finally {
        backendRestarting.value = false
    }
}

onMounted(async () => {
    // 先监听实时日志，再拉取已有日志，两者按序号去重合并
    let historyLoaded = false
    let historyMaxSeq = 0
    const pending: BackendLog[] = []
    // 后台按固定间隔把日志合并成一批推送过来
    unlistenBackendLog = await listen<BackendLog[]>('backend-log', (event) => {
        if (!historyLoaded) {
            pending.push(...event.payload)
            return
        }
        appendBackendLogs(
            event.payload.filter((log) => log.seq > historyMaxSeq),
        )
    })
    try {
        const history = await invoke<BackendLog[]>('get_backend_logs')
        if (history.length) historyMaxSeq = history[history.length - 1].seq
        appendBackendLogs([
            ...history,
            ...pending.filter((log) => log.seq > historyMaxSeq),
        ])
    } catch (e) {
        console.error('get_backend_logs error:', e)
        appendBackendLogs(pending)
    }
    historyLoaded = true
})

onBeforeUnmount(() => {
    unlistenBackendLog?.()
})

// 开始监听
const startListen = async () => {
    const url = inputUrl.value.trim()
    const pushUrlStr = pushUrl.value.trim()
    const roomIdStr = roomId.value.trim()
    const projectPathStr = projectPath.value.trim()
    const exePathStr = exePath.value.trim()
    const shouldUseBackend = useBackend.value
    const shouldUseExe = useExe.value
    // console.log('直播间地址:', proto)
    localStorage.setItem('url', url)
    addUrlToHistory(url)
    localStorage.setItem('pushUrl', pushUrlStr)
    localStorage.setItem('roomId', roomIdStr)
    localStorage.setItem('projectPath', projectPathStr)
    localStorage.setItem('exePath', exePathStr)
    localStorage.setItem('useBackend', String(shouldUseBackend))
    localStorage.setItem('useExe', String(shouldUseExe))
    localStorage.setItem('logCollapsed', String(logCollapsed.value))
    if (shouldUseExe && !roomIdStr) {
        ElMessage.error('请先输入房间号')
        return
    }
    if (shouldUseBackend && !projectPathStr) {
        ElMessage.error('请先选择项目后台目录')
        return
    }
    if (shouldUseExe && !exePathStr) {
        ElMessage.error('请先选择 exe 文件')
        return
    }
    if (starting) return
    starting = true
    if (loginState.value.level === 'warn') {
        ElMessage.warning(loginState.value.detail)
    }
    try {
        await doStartListen(
            url,
            pushUrlStr,
            roomIdStr,
            projectPathStr,
            exePathStr,
            shouldUseBackend,
            shouldUseExe,
        )
    } finally {
        starting = false
    }
}

const doStartListen = async (
    url: string,
    pushUrlStr: string,
    roomIdStr: string,
    projectPathStr: string,
    exePathStr: string,
    shouldUseBackend: boolean,
    shouldUseExe: boolean,
) => {
    // 先清空历史直播和外部进程
    await clearLivex()
    try {
        // 后台是否是本次新启动的：已经在运行则直接复用，不会重启
        let backendStarted = false
        if (shouldUseBackend) {
            backendStarted = await invoke<boolean>('run_npm_dev', {
                projectPath: projectPathStr,
                pushUrl: pushUrlStr || null,
            })
        }
        // 仅在后台是新启动且启用 exe 时等待后端启动，避免 exe 连接失败
        if (backendStarted && shouldUseExe) {
            await new Promise((resolve) => setTimeout(resolve, 5000))
        }
        if (shouldUseExe) {
            await invoke('run_external_exe', {
                exePath: exePathStr,
                roomId: roomIdStr,
            })
        }
    } catch (error) {
        ElMessage.error('启动失败，请检查目录、exe 或环境')
        console.error(error)
        return
    }
    // 再开始新的直播
    if (url.trim()) {
        // 根据直播间地址获取roomid等字段
        let roomJson: LiveInfoImp
        let roomInfo: any
        try {
            roomJson = await invoke('get_live_html', {
                url,
                cookie: douyinCookie.value.trim() || null,
            })
            roomInfo = JSON.parse(roomJson.room_info)
        } catch (e) {
            // 获取失败：列表里标记为未开播
            console.error('get_live_html error:', e)
            setRoomLive(url, false)
            ElMessage.error('获取直播间信息失败，请检查地址或网络')
            return
        }
        console.log('roomInfo----', roomInfo)
        // 获取主播的头像昵称粉丝数等信息
        if (roomInfo.id_str) {
            // 如果状态是4就是停播，只有直播的信息
            if (roomInfo.status) {
                setRoomLive(url, true)
                ElMessage.success('open live success!')
                liveInfo.value = {
                    uid: roomInfo.owner.id_str,
                    status: roomInfo.status,
                    title: roomInfo.title,
                    name: roomInfo.owner.nickname,
                    roomId: roomInfo.id_str,
                    avatar: roomInfo.owner.avatar_thumb.url_list[0],
                    fans: 0,
                    customer: roomInfo.user_count_str,
                    totalLike: roomInfo.stats.total_user_str,
                    signature: 'roomInfo.signature',
                }
                // 加载直播视频:可能没有HD1
                let videoUrl = roomInfo.stream_url.flv_pull_url[
                    roomInfo.stream_url.default_resolution
                ].replace('http://', 'https://')
                loadLive(videoUrl)
                // 加载websocket
                creatSokcet(
                    url,
                    roomInfo.id_str,
                    roomJson.unique_id,
                    roomJson.ttwid,
                )
            } else {
                setRoomLive(url, false)
                ElMessage.success('live is over!')
                liveInfo.value = {
                    uid: roomInfo.id_str,
                    status: 4,
                    title: '已停播',
                    name: roomInfo.nickname,
                    roomId: roomInfo.id_str,
                    avatar: roomInfo.avatar_thumb.url_list[0],
                    fans: 0,
                    customer: 0,
                    totalLike: 0,
                    signature: 'roomInfo.signature',
                }
                // 清空播放器
                destroyPlayer()
            }
        } else {
            console.log('没有获取到')
            setRoomLive(url, false)
            ElMessage.error('open live error')
        }
    }
}

// 选择 Node.js 项目目录
const selectProjectPath = async () => {
    const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Node.js 项目目录',
    })
    if (typeof selected === 'string') {
        projectPath.value = selected
        localStorage.setItem('projectPath', selected)
    }
}

// 选择 exe 文件
const selectExePath = async () => {
    const selected = await open({
        multiple: false,
        title: '选择 exe 文件',
        filters: [{ name: 'Executable', extensions: ['exe'] }],
    })
    if (typeof selected === 'string') {
        exePath.value = selected
        localStorage.setItem('exePath', selected)
    }
}

// 清空直播和聊天内容
const clearLivex = async () => {
    try {
        await invoke('stop_external_processes')
    } catch (error) {
        console.error('stop_external_processes error:', error)
    }
    // console.log('清空')
    dplayer?.destroy()
    messageList.value = [
        {
            id: '1',
            type: 'chat',
            name: 'Kelvin',
            msg: '欢迎使用弹幕工具',
        },
    ]
    socketClient?.disconnect()
    socketClient = null
    // 重置去重状态
    seenMsgIds = new Set()
    seenMsgIdsOld = new Set()
    giftComboMap.clear()
}

// 创建websokcet：带断线检测和自动重连
const creatSokcet = (
    liveUrl: string,
    roomId: string,
    uniqueId: string,
    ttwid: string,
) => {
    // 当前连接参数：重连时可能会被刷新
    const conn = { roomId, uniqueId, ttwid }
    // 每次(重)连接都重新生成签名
    const getConn = () => {
        const sign = window.creatSignature(conn.roomId, conn.uniqueId)
        const fullCookie = douyinCookie.value.trim()
        // 组装参数
        const socketUrl = `wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/?room_id=${conn.roomId}&compress=gzip&version_code=180800&webcast_sdk_version=1.0.14-beta.0&live_id=1&did_rule=3&user_unique_id=${conn.uniqueId}&identity=audience&signature=${sign}&aid=6383&device_platform=web&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla&browser_version=5.0+%28Windows+NT+10.0%3B+Win64%3B+x64%29+AppleWebKit%2F537.36+%28KHTML%2C+like+Gecko%29+Chrome%2F126.0.0.0+Safari%2F537.36+Edg%2F126.0.0.0`
        // header
        const options: ConnectionConfig = {
            writeBufferSize: 20000,
            // maxWriteBufferSize会导致不出消息
            // maxWriteBufferSize: 20000,
            // maxMessageSize: 20000,
            // 下面会导致很多错误
            // maxFrameSize: 20000,
            // acceptUnmaskedFrames: true,
            headers: {
                cookie: fullCookie !== '' ? fullCookie : 'ttwid=' + conn.ttwid,
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
            },
        }
        return { url: socketUrl, opts: options }
    }
    // 连续重连失败时，重新拉取房间信息：直播结束则停止重连，否则刷新连接参数
    const beforeReconnect = async (attempt: number) => {
        if (attempt < 2) return true
        try {
            const roomJson: LiveInfoImp = await invoke('get_live_html', {
                url: liveUrl,
                cookie: douyinCookie.value.trim() || null,
            })
            const roomInfo = JSON.parse(roomJson.room_info)
            if (roomInfo.id_str && !roomInfo.status) {
                setRoomLive(liveUrl, false)
                ElMessage.warning('直播已结束，停止采集')
                liveInfo.value = { ...liveInfo.value, status: 4 }
                return false
            }
            if (roomInfo.id_str) {
                conn.roomId = roomInfo.id_str
                conn.uniqueId = roomJson.unique_id
                conn.ttwid = roomJson.ttwid
            }
        } catch (e) {
            // 获取失败(例如网络断开)继续用旧参数重连
            console.error('刷新房间信息失败:', e)
        }
        return true
    }
    // ping消息
    const pingMsg = douyin.PushFrame.encode({ payloadType: 'hb' }).finish()
    // webscoket
    const client: SocketCli = new SocketCli(getConn, onMessage, pingMsg, {
        onStatus: (status) => {
            // 已经被新的连接取代，不再更新状态
            if (socketClient !== client) return
            socketStatus.value = status
        },
        beforeReconnect,
    })
    socketClient = client
}
// 加载直播视频
const loadLive = (videoUrl: string, live: boolean = true) => {
    // 根据不同的视频加载不同的播放器
    if (videoUrl.includes('m3u8')) {
        dplayer = new DPlayer({
            container: document.getElementById(`dplayer`),
            screenshot: false,
            autoplay: true,
            live: live,
            volume: 0,
            lang: 'zh-cn', // zh-cn // en
            video: {
                url: '',
                type: 'customHls',
                customType: {
                    customHls: function (video: any, _: any) {
                        const hls = new Hls() //实例化Hls  用于解析m3u8
                        hls.loadSource(videoUrl)
                        hls.attachMedia(video)
                    },
                },
            },
        })
    } else if (videoUrl.includes('mp4')) {
        dplayer = new DPlayer({
            container: document.getElementById(`dplayer`),
            live: live,
            volume: 0,
            autoplay: true,
            screenshot: false,
            fullScreen: false,
            lang: 'zh-cn', // zh-cn // en
            video: {
                url: videoUrl,
                type: 'mp4',
            },
        })
    } else if (videoUrl.includes('flv')) {
        dplayer = new DPlayer({
            container: document.getElementById(`dplayer`),
            screenshot: false,
            live: live,
            volume: 0,
            autoplay: true,
            lang: 'zh-cn', // zh-cn // en
            video: {
                url: videoUrl,
                type: 'customFlv',
                customType: {
                    customFlv: function (video: any, _: any) {
                        const flvPlayer = Flv.createPlayer({
                            type: 'flv',
                            url: videoUrl,
                        })
                        flvPlayer.attachMediaElement(video)
                        flvPlayer.load()
                    },
                },
            },
        })
    }
    // 立即播放视频
    // dplayer?.play()
}

// 销毁播放器
const destroyPlayer = () => {
    if (dplayer) {
        dplayer.destroy()
        dplayer = null
    }
}

// 消息列表最大长度：超过后裁剪掉旧消息，避免长时间采集后列表无限增长导致界面卡死
const MAX_MESSAGE_COUNT = 600
const KEEP_MESSAGE_COUNT = 300
// 消息列表添加消息：长列表优化
const pushMsg = (msg: any) => {
    messageList.value.push(msg)
    if (messageList.value.length > MAX_MESSAGE_COUNT) {
        messageList.value.splice(
            0,
            messageList.value.length - KEEP_MESSAGE_COUNT,
        )
    }
    scrollToBottom()
}

// 滚动盒子到底部：一帧内只滚动一次
let scrollPending = false
const scrollToBottom = () => {
    if (scrollPending) return
    scrollPending = true
    requestAnimationFrame(() => {
        scrollPending = false
        const msgDom: HTMLElement | null = document.getElementById('liveMsg')
        if (msgDom) {
            msgDom.scrollTop = msgDom.scrollHeight
        }
    })
}

// 消息去重：断线重连、连接切换时服务端可能重复下发同一条消息
let seenMsgIds = new Set<string>()
let seenMsgIdsOld = new Set<string>()
const isDuplicate = (id: string) => {
    if (!id || id === '0') return false
    if (seenMsgIds.has(id) || seenMsgIdsOld.has(id)) return true
    seenMsgIds.add(id)
    // 分两代保存，控制内存占用
    if (seenMsgIds.size >= 5000) {
        seenMsgIdsOld = seenMsgIds
        seenMsgIds = new Set()
    }
    return false
}

const textEncoder = new TextEncoder()

// 收到websocket消息回调
const onMessage = (msg: any) => {
    // 解析消息
    const decodeMsg = douyin.PushFrame.decode(new Uint8Array(msg.data))
    // 心跳等没有内容的帧直接忽略
    if (!decodeMsg.payload || decodeMsg.payload.length === 0) return
    // 解压缩
    const gzipData = pako.inflate(decodeMsg.payload)
    // Response解码
    const response = douyin.Response.decode(gzipData)
    // 判断是否需要回复，自动回复：ack 需要带上 internalExt，否则服务端认为没有确认
    if (response.needAck) {
        const ack = douyin.PushFrame.encode({
            payloadType: 'ack',
            logId: decodeMsg.logId,
            payload: textEncoder.encode(response.internalExt || ''),
        }).finish()
        socketClient?.send(ack)
    }
    // 解析直播消息
    handleMessage(response.messagesList)
}

// 遍历消息数组，拿到具体的消息
const handleMessage = (messageList: douyin.Message) => {
    messageList.forEach((msg) => {
        // 单条消息解析失败不能影响同一帧里的其他消息
        try {
            dispatchMessage(msg)
        } catch (e) {
            console.error('消息解析失败:', msg.method, e)
        }
    })
}

// 根据消息类型分发
const dispatchMessage = (msg: any) => {
    {
        // 判断消息类型
        switch (msg.method) {
            // 反对分数
            case 'WebcastMatchAgainstScoreMessage':
                // console.log('反对分数')
                break
            // 点赞数
            case 'WebcastLikeMessage':
                // console.log('点赞数')
                likeLive(msg.payload)
                break
            // 成员进入直播间消息
            case 'WebcastMemberMessage':
                // console.log('成员进入直播间消息')
                enterLive(msg.payload)
                break
            // 礼物消息
            case 'WebcastGiftMessage':
                decodeGift(msg.payload)
                break
            // 聊天弹幕消息
            case 'WebcastChatMessage':
                // console.log('聊天弹幕消息')
                decodeChat(msg.payload)
                break
            // 关注消息
            case 'WebcastSocialMessage':
                // console.log('联谊会消息')
                followLive(msg.payload)
                break
            // 更新粉丝票
            case 'WebcastUpdateFanTicketMessage':
                // console.log('更新粉丝票')
                break
            // 公共文本消息
            case 'WebcastCommonTextMessage':
                // console.log('公共文本消息')
                break
            // 商品改变消息
            case 'WebcastProductChangeMessage':
                // console.log('商品改变消息')
                break
            // 直播间统计消息
            case 'WebcastRoomUserSeqMessage':
                // console.log('直播间统计消息')
                countLive(msg.payload)
                break
            // 待解析方法
            default:
                break
        }
    }
}
// 推送队列：POST 进行中时先入队，本次请求结束后再发下一批
// - 请求失败(后台没启动、超时等)会把这一批放回队列重试，不再直接丢弃
// - 每批限制条数，请求体过大(413)时自动减小批量
// - 请求带超时，避免某个请求一直挂起导致后面的消息全部卡住
const PUSH_TIMEOUT = 10000
const createPusher = (batchType: string, maxBuffer: number) => {
    let buffer: any[] = []
    let sending = false
    let retryTimer: any = null
    let failCount = 0
    let batchSize = 50

    const flush = () => {
        if (sending || retryTimer || buffer.length === 0) return
        if (pushUrl.value == '') {
            buffer = []
            return
        }
        sending = true
        const batch = buffer.splice(0, batchSize)
        const url = pushUrl.value + '/' + roomId.value
        const body = { type: batchType, items: batch }
        let retryDelay = 0
        axios
            .post(url, body, { timeout: PUSH_TIMEOUT })
            .then(() => {
                failCount = 0
            })
            .catch((err) => {
                const status = err?.response?.status
                if (status === 413 && batch.length > 1) {
                    // 请求体过大：减小批量后重发
                    batchSize = Math.max(1, Math.floor(batch.length / 2))
                    buffer.unshift(...batch)
                } else if (status >= 400 && status < 500) {
                    // 后台明确拒绝，重试也不会成功
                    console.error(`${batchType} 推送被拒绝(${status})，丢弃 ${batch.length} 条`)
                } else {
                    // 网络错误、超时、5xx：放回队列稍后重试
                    failCount++
                    buffer.unshift(...batch)
                    retryDelay = Math.min(1000 * failCount, 5000)
                }
            })
            .finally(() => {
                sending = false
                if (retryDelay > 0) {
                    retryTimer = setTimeout(() => {
                        retryTimer = null
                        flush()
                    }, retryDelay)
                } else {
                    flush()
                }
            })
    }

    return (item: any) => {
        buffer.push(item)
        // 后台长时间不可用时限制积压数量，丢弃最旧的
        if (buffer.length > maxBuffer) {
            buffer.splice(0, buffer.length - maxBuffer)
        }
        flush()
    }
}

const pushChat = createPusher('chat_batch', 5000)
const pushGift = createPusher('gift_batch', 20000)
const pushLike = createPusher('like_batch', 5000)

// 解析弹幕消息
const decodeChat = (data) => {
    // 校验消息
    const chatMsg = douyin.ChatMessage.decode(data)
    // console.log('chatMsg-----', chatMsg)
    const { common, user, content } = chatMsg
    if (isDuplicate(common.msgId.toString())) return
    const message = {
        id: common.msgId.toString(),
        type: 'chat',
        name: user.nickName,
        user: rawUser(user),
        msg: content,
    }
    const postData = {
        id: common.msgId.toString(),
        type: 'chat',
        user: user,
        content: content,
    }
    checkList.value.includes('chat') && pushMsg(message)
    if (pushUrl.value == "") return;
    pushChat(postData)
}
// 礼物连击记录：key 为 用户_礼物_连击组，value 为已经统计过的数量
// 抖音连击礼物每次下发的 repeatCount 是累计值，连击结束时还会再发一条 repeatEnd=1 的消息(数量和上一条相同)，
// 直接按条推送会重复，所以这里只推送相对上一条的增量
const giftComboMap = new Map<string, { count: number; at: number }>()
const GIFT_COMBO_TTL = 10 * 60 * 1000
const pruneGiftCombo = () => {
    if (giftComboMap.size < 2000) return
    const now = Date.now()
    giftComboMap.forEach((v, k) => {
        if (now - v.at > GIFT_COMBO_TTL) giftComboMap.delete(k)
    })
}

// 解析礼物消息
const decodeGift = (data) => {
    const giftMsg = douyin.GiftMessage.decode(data)
    const { common, user, gift, repeatCount } = giftMsg
    const msgId = common.msgId.toString()
    if (isDuplicate(msgId)) return
    recordGiftKind((gift?.id ?? giftMsg.giftId).toString(), gift)
    // 本条消息里的累计数量
    const total = parseInt(repeatCount.toString()) || 1
    // 本次实际新增的数量
    let count = total
    const groupId = giftMsg.groupId.toString()
    if (groupId !== '0') {
        const key = `${user?.id}_${giftMsg.giftId}_${groupId}`
        const prev = giftComboMap.get(key)?.count || 0
        if (gift?.combo || giftMsg.repeatEnd === 1) {
            count = total - prev
        }
        giftComboMap.set(key, { count: Math.max(total, prev), at: Date.now() })
        pruneGiftCombo()
        // 连击结束消息或者重复消息，没有新增数量
        if (count <= 0) return
    }
    const diamondCount = gift?.diamondCount || 0
    const icon = gift?.icon?.urlListList?.[0] || ''
    const message = {
        id: msgId,
        type: 'gift',
        name: user?.nickName,
        user: rawUser(user),
        msg: `送出 <image src="${icon}" style="width: 20px; margin-top:-0.2em"/> ${gift?.name} x${count}个 (${diamondCount}钻)`,
    }
    checkList.value.includes('gift') && pushMsg(message)
    // 计算主播收益
    diamond.value = diamond.value + diamondCount * count
    const postData = {
        id: msgId,
        type: 'gift',
        user: user,
        gift: gift,
        // 本次新增数量
        repeatCount: count,
        // 连击累计数量
        totalCount: total,
        repeatEnd: giftMsg.repeatEnd,
    }
    if (pushUrl.value == "") return;
    pushGift(postData)
}

// 进入房间
const enterLive = (data) => {
    const enteryMsg = douyin.MemberMessage.decode(data)
    const { common, user } = enteryMsg
    if (isDuplicate(common.msgId.toString())) return
    const message = {
        id: common.msgId.toString(),
        type: 'join',
        name: user.nickName,
        user: rawUser(user),
        msg: '来了',
    }
    checkList.value.includes('comein') && pushMsg(message)
    // console.log('enterLive---', enteryMsg)
}

// 点赞消息
const likeLive = (data) => {
    const likeMsg = douyin.LikeMessage.decode(data)
    // console.log('likeMsg---', likeMsg)
    const { common, user, total, count } = likeMsg
    if (isDuplicate(common.msgId.toString())) return
    const message = {
        id: common.msgId.toString(),
        type: 'like',
        name: user.nickName,
        user: rawUser(user),
        msg: `为主播点赞了`,
    }
    liveInfo.value = {
        ...liveInfo.value,
        totalLike: total,
    }
    checkList.value.includes('like') && pushMsg(message)
    const postData = {
        id: common.msgId.toString(),
        type: 'like',
        user: user,
        like: parseInt(count.toString()),
    }
    if (pushUrl.value == "") return;
    pushLike(postData)
}

// 关注主播
const followLive = (data) => {
    const followMsg = douyin.SocialMessage.decode(data)
    const { common, user, followCount } = followMsg
    if (isDuplicate(common.msgId.toString())) return
    const message = {
        id: common.msgId.toString(),
        type: 'follow',
        name: user.nickName,
        user: rawUser(user),
        msg: `关注了主播`,
    }
    liveInfo.value = {
        ...liveInfo.value,
        fans: followCount,
    }
    checkList.value.includes('follow') && pushMsg(message)
}

// 直播间统计
const countLive = (data) => {
    const countMsg = douyin.RoomUserSeqMessage.decode(data)
    // console.log('countLive---', countMsg)
    liveInfo.value = {
        ...liveInfo.value,
        customer: countMsg.onlineUserForAnchor,
    }
}

// 弹幕消息列表：优化
var lastScrollTop = 0
const msgScroll = (event) => {
    console.log('列表滚动', event)
    const { scrollTop } = event.target
    if (scrollTop < lastScrollTop) {
        // 向上滚动
        console.log('向上滚动')
    } else if (scrollTop > lastScrollTop) {
        // 向下滚动
        console.log('向下滚动')
    }
    lastScrollTop = scrollTop
}
</script>

<!-- 主题变量：弹窗等组件挂在 body 下，所以变量必须是全局的 -->
<style lang="scss">
html:root {
    // 浅色
    --c-bg: #ffffff;
    --c-soft: #f4f4f4;
    --c-hover: #ebebeb;
    --c-border: #e4e4e4;
    --c-text: #0a0a0a;
    --c-text-2: #5c5c5c;
    --c-text-3: #9a9a9a;
    // 强调色：浅色下是黑，深色下是白
    --c-accent: #0a0a0a;
    --c-accent-hover: #333333;
    --c-accent-text: #ffffff;
    --c-ok: #16a34a;
    --c-warn: #c2710c;
    --c-err: #dc2626;

    color: var(--c-text);
    background-color: var(--c-bg);
    color-scheme: light;
}

html.dark:root {
    --c-bg: #0a0a0a;
    --c-soft: #171717;
    --c-hover: #232323;
    --c-border: #262626;
    --c-text: #f2f2f2;
    --c-text-2: #a3a3a3;
    --c-text-3: #6b6b6b;
    --c-accent: #f2f2f2;
    --c-accent-hover: #cfcfcf;
    --c-accent-text: #0a0a0a;
    --c-ok: #4ade80;
    --c-warn: #fbbf24;
    --c-err: #f87171;

    color-scheme: dark;
}

// Element Plus 跟随主题
html:root,
html.dark:root {
    --el-color-primary: var(--c-accent);
    --el-color-primary-light-3: var(--c-text-2);
    --el-color-primary-light-5: var(--c-text-3);
    --el-color-primary-light-7: var(--c-border);
    --el-color-primary-light-8: var(--c-border);
    --el-color-primary-light-9: var(--c-soft);
    --el-color-primary-dark-2: var(--c-accent-hover);
    --el-bg-color: var(--c-bg);
    --el-bg-color-overlay: var(--c-bg);
    --el-fill-color-blank: var(--c-bg);
    --el-fill-color-light: var(--c-soft);
    --el-text-color-primary: var(--c-text);
    --el-text-color-regular: var(--c-text);
    --el-text-color-secondary: var(--c-text-2);
    --el-text-color-placeholder: var(--c-text-3);
    --el-border-color: var(--c-border);
    --el-border-color-light: var(--c-border);
    --el-border-color-lighter: var(--c-border);
    --el-border-color-hover: var(--c-text-3);
    --el-border-radius-base: 6px;
    --el-box-shadow-light: 0 4px 16px rgba(0, 0, 0, 0.12);
}

// 加 html 前缀提高优先级：Element Plus 的样式在本文件之后加载
html .el-button--primary {
    --el-button-text-color: var(--c-accent-text);
    --el-button-hover-text-color: var(--c-accent-text);
    --el-button-active-text-color: var(--c-accent-text);
    --el-button-hover-bg-color: var(--c-accent-hover);
    --el-button-hover-border-color: var(--c-accent-hover);
    --el-button-active-bg-color: var(--c-accent-hover);
    --el-button-active-border-color: var(--c-accent-hover);
}

html .el-checkbox {
    margin-right: 18px;
    --el-checkbox-checked-icon-color: var(--c-accent-text);
}

// 直播间弹出层：去掉默认内边距和阴影
html .roomPopper.el-popover {
    padding: 0;
    border-color: var(--c-border);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.14);
}

html .el-message-box {
    --el-messagebox-border-radius: 10px;
    border: 1px solid var(--c-border);
    box-shadow: none;
}

html .el-dialog {
    --el-dialog-bg-color: var(--c-bg);
    --el-dialog-border-radius: 10px;
    --el-dialog-box-shadow: none;
    border: 1px solid var(--c-border);
}
</style>

<style scoped lang="scss">
.app {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--c-text);
    background-color: var(--c-bg);
    font-size: 13px;
}

// ---------- 通用 ----------
.btn {
    flex-shrink: 0;
    height: 32px;
    padding: 0 14px;
    border: 1px solid var(--c-border);
    border-radius: 6px;
    background-color: transparent;
    color: var(--c-text);
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;

    &:hover {
        background-color: var(--c-hover);
    }

    // 采集按钮：未采集时蓝色，采集中绿色，重连中橙色
    &.start {
        min-width: 80px;
        border-color: #2563eb;
        background-color: #2563eb;
        color: #ffffff;
        font-weight: 600;

        &:hover {
            border-color: #1d4ed8;
            background-color: #1d4ed8;
        }

        &.connected {
            border-color: #16a34a;
            background-color: #16a34a;

            &:hover {
                border-color: #15803d;
                background-color: #15803d;
            }
        }

        &.reconnecting {
            border-color: #d97706;
            background-color: #d97706;

            &:hover {
                border-color: #b45309;
                background-color: #b45309;
            }
        }
    }

    &.primary {
        border-color: var(--c-accent);
        background-color: var(--c-accent);
        color: var(--c-accent-text);

        &:hover {
            border-color: var(--c-accent-hover);
            background-color: var(--c-accent-hover);
        }
    }
}

.iconBtn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background-color: transparent;
    color: var(--c-text-2);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;

    &:hover {
        background-color: var(--c-hover);
        color: var(--c-text);
    }
}

.panelHead {
    flex-shrink: 0;
    height: 36px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--c-border);
    user-select: none;

    .panelTitle {
        font-weight: 600;
    }

    .panelMeta {
        margin-left: 8px;
        color: var(--c-text-3);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
    }

    .panelActions {
        margin-left: auto;
        display: flex;
        gap: 14px;
    }

    .textBtn {
        color: var(--c-text-2);
        font-size: 12px;
        cursor: pointer;

        &:hover {
            color: var(--c-text);
        }

        &.disabled {
            color: var(--c-text-3);
            cursor: default;
        }
    }
}

// ---------- 顶栏 ----------
.topbar {
    flex-shrink: 0;
    height: 56px;
    padding: 0 12px 0 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--c-border);

    .brand {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;

        .brandMark {
            width: 20px;
            height: 20px;
            color: var(--c-text);
        }

        .brandName {
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.2px;
        }
    }

    .urlBar {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;

        .urlInput {
            flex: 1;
            min-width: 0;
        }

        .roomBtn {
            max-width: 150px;
            padding: 0 10px;
            display: flex;
            align-items: center;
            gap: 6px;

            .roomBtnText {
                overflow: hidden;
                text-overflow: ellipsis;
            }
        }

        // 写在外层：el-autocomplete 的根节点上没有 scoped 标记
        & {
            :deep(.el-input__wrapper) {
                height: 32px;
                border-radius: 6px;
                background-color: var(--c-soft);
                box-shadow: none;
                transition: box-shadow 0.15s;

                &.is-focus {
                    box-shadow: 0 0 0 1px var(--c-accent) inset;
                }
            }
        }
    }

    .tools {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 2px;

        .status {
            margin-right: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--c-text-3);
            font-size: 12px;
            white-space: nowrap;
            user-select: none;

            .dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background-color: var(--c-text-3);
            }

            &.connected {
                color: var(--c-text-2);

                .dot {
                    background-color: var(--c-ok);
                }
            }

            &.reconnecting {
                color: var(--c-warn);

                .dot {
                    background-color: var(--c-warn);
                }
            }

            // 登录状态
            &.login {
                margin-right: 8px;
                cursor: pointer;

                &.ok {
                    color: var(--c-text-2);

                    .dot {
                        background-color: var(--c-ok);
                    }
                }

                &.warn {
                    color: var(--c-warn);

                    .dot {
                        background-color: var(--c-warn);
                    }
                }
            }
        }
    }
}

// ---------- 主体 ----------
.main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
}

.stage {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;

    .anchorBar {
        flex-shrink: 0;
        height: 60px;
        padding: 0 16px;
        display: flex;
        align-items: center;
        gap: 10px;

        .avatar {
            flex-shrink: 0;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            object-fit: cover;
            background-color: var(--c-soft);
        }

        .anchorText {
            flex: 1;
            min-width: 0;

            .anchorName {
                font-size: 14px;
                font-weight: 600;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .anchorTitle {
                margin-top: 2px;
                color: var(--c-text-3);
                font-size: 12px;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
        }

        .stats {
            flex-shrink: 0;
            display: flex;
            gap: 22px;
            user-select: none;

            .stat {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
            }

            .statValue {
                font-size: 15px;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
            }

            .statLabel {
                margin-top: 1px;
                color: var(--c-text-3);
                font-size: 11px;
            }
        }
    }

    .player {
        position: relative;
        flex: 1;
        min-height: 0;
        margin: 0 16px 16px;
        border-radius: 8px;
        background-color: #000000;
        overflow: hidden;

        .dplayer {
            width: 100%;
            height: 100%;
        }

        .playerTip {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #8a8a8a;
            font-size: 13px;
            user-select: none;
            pointer-events: none;
        }
    }
}

.chat {
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--c-border);

    .chatList {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .msg {
        padding: 4px 14px;
        line-height: 1.5;
        word-break: break-all;

        .msgName {
            margin-right: 6px;
            color: var(--c-text-3);

            // 可以点击补发礼物
            &.clickable {
                cursor: pointer;

                &:hover {
                    color: var(--c-text);
                    text-decoration: underline;
                }
            }
        }

        .msgText {
            color: var(--c-text);
        }

        // 礼物：整行用强调色块突出
        &.gift {
            margin: 2px 8px;
            padding: 4px 6px;
            border-radius: 6px;
            background-color: var(--c-soft);

            .msgText {
                font-weight: 600;
            }
        }

        &.like,
        &.join,
        &.follow {
            .msgText {
                color: var(--c-text-3);
            }
        }
    }
}

// ---------- 后台日志 ----------
.logs {
    flex-shrink: 0;
    height: 160px;
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--c-border);

    &.collapsed {
        height: auto;

        .panelHead {
            border-bottom: none;
        }
    }

    .logBody {
        flex: 1;
        min-height: 0;
        padding: 6px 14px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
        font-family: Consolas, 'Courier New', monospace;
        font-size: 12px;
        line-height: 1.55;
        color: var(--c-text-2);

        .logLine {
            white-space: pre-wrap;
            word-break: break-all;

            &.stderr {
                color: var(--c-err);
            }

            &.system {
                color: var(--c-warn);
            }
        }

        .logEmpty {
            color: var(--c-text-3);
        }
    }
}

// ---------- 底部 ----------
.footer {
    flex-shrink: 0;
    height: 26px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--c-border);
    color: var(--c-text-3);
    font-size: 11px;
    user-select: none;

    .footerVersion {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
    }
}

// ---------- 直播间列表(弹出层) ----------
.roomPop {
    font-size: 13px;
    color: var(--c-text);

    .roomPopHead {
        height: 38px;
        padding: 0 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--c-border);
        user-select: none;

        .roomPopTitle {
            font-weight: 600;
        }
    }

    .roomAct {
        flex-shrink: 0;
        color: var(--c-text-2);
        font-size: 12px;
        cursor: pointer;

        &:hover {
            color: var(--c-text);
        }
    }

    .roomForm {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-bottom: 1px solid var(--c-border);
        background-color: var(--c-soft);

        .roomFormBtns {
            display: flex;
            justify-content: flex-end;
        }
    }

    .roomList {
        max-height: 300px;
        padding: 6px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .roomItem {
        padding: 7px 8px;
        display: flex;
        align-items: center;
        gap: 10px;
        border-radius: 6px;
        cursor: pointer;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            background-color: var(--c-soft);
        }

        .roomInfo {
            flex: 1;
            min-width: 0;
        }

        .roomName {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;

            .roomNameText {
                min-width: 0;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
        }

        // 直播标记：直播中绿色，未开播/检查中灰色
        .roomLive {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 4px;
            color: var(--c-text-3);
            font-size: 11px;
            font-weight: 400;

            &::before {
                content: '';
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background-color: var(--c-text-3);
            }

            &.on {
                color: var(--c-ok);

                &::before {
                    background-color: var(--c-ok);
                }
            }
        }

        .roomUrl {
            margin-top: 1px;
            color: var(--c-text-3);
            font-size: 12px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }

    .roomEmpty {
        padding: 18px 8px;
        color: var(--c-text-3);
        text-align: center;
    }
}

// ---------- 补发礼物弹窗 ----------
.resend {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 13px;

    .resendLabel {
        flex-shrink: 0;
        color: var(--c-text-2);
    }

    .resendUser {
        display: flex;
        align-items: center;
        gap: 8px;

        .resendAvatar {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            object-fit: cover;
            background-color: var(--c-soft);
        }

        .resendName {
            font-size: 14px;
            font-weight: 600;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }

    .giftGrid {
        height: 232px;
        padding: 6px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
        grid-auto-rows: min-content;
        gap: 6px;
        border: 1px solid var(--c-border);
        border-radius: 8px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: var(--c-border) transparent;
    }

    .giftTile {
        padding: 8px 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        user-select: none;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            border-color: var(--c-accent);
            background-color: var(--c-soft);
        }

        .giftIcon {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }

        .giftName {
            max-width: 100%;
            margin-top: 6px;
            font-size: 12px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }

        .giftPrice {
            margin-top: 1px;
            color: var(--c-text-3);
            font-size: 11px;
        }
    }

    .giftEmpty {
        grid-column: 1 / -1;
        padding: 80px 12px 0;
        color: var(--c-text-3);
        text-align: center;
    }

    .resendCount {
        display: flex;
        align-items: center;
        gap: 10px;

        .resendTotal {
            color: var(--c-text-2);
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
    }
}

// ---------- 设置弹窗 ----------
.form {
    .formRow {
        min-height: 32px;
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 8px;

        &:first-child {
            margin-top: 0;
        }

        label {
            flex-shrink: 0;
            width: 68px;
            color: var(--c-text-2);
            font-size: 13px;
        }

        .el-button + .el-button {
            margin-left: 0;
        }

        .cookieOk {
            color: var(--c-ok);
            font-size: 12px;
        }
    }

    .formHint {
        margin: 4px 0 0 76px;
        color: var(--c-text-3);
        font-size: 12px;
    }
}
</style>
