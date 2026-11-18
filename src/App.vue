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
                            <span
                                v-if="activeRoom"
                                class="platformIcon"
                                :class="detectPlatform(activeRoom.url)"
                            >
                                {{ platformGlyph(activeRoom.url) }}
                            </span>
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
                                <span
                                    class="platformIcon"
                                    :class="detectPlatform(room.url)"
                                    :title="platformName(detectPlatform(room.url))"
                                >
                                    {{ platformGlyph(room.url) }}
                                </span>
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
                <button class="btn" @click="clearLivex()">停止</button>
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
            <!-- scroll 事件不冒泡，用捕获阶段监听消息列表的滚动 -->
            <aside
                class="chat"
                @scroll.capture="onMsgScroll"
                @wheel.passive="markMsgUserAction"
                @touchmove.passive="markMsgUserAction"
                @keydown="markMsgUserAction"
                @pointerdown="onMsgPointerDown"
            >
                <!-- 翻看历史消息时，有新消息就提示，点击回到最新 -->
                <button
                    v-if="!msgStickBottom"
                    class="toLatest"
                    @click="scrollToBottom(true)"
                >
                    {{
                        unreadMsgCount
                            ? `${unreadMsgCount > 99 ? '99+' : unreadMsgCount} 条新消息`
                            : '回到最新'
                    }}
                    <el-icon :size="12"><ArrowDown /></el-icon>
                </button>
                <div class="panelHead">
                    <span class="panelTitle">消息</span>
                    <span class="panelMeta">{{ visibleMessages.length }}</span>
                </div>
                <!-- 消息筛选：可多选，不选任何类型即显示全部 -->
                <div class="msgFilter">
                    <button
                        class="chip"
                        :class="{ active: !msgFilter.length }"
                        @click="toggleMsgFilter(null)"
                    >
                        全部
                    </button>
                    <button
                        v-for="f in MSG_FILTERS"
                        :key="f.key"
                        class="chip"
                        :class="[f.key, { active: msgFilter.includes(f.key) }]"
                        @click="toggleMsgFilter(f.key)"
                    >
                        {{ f.label }}
                    </button>
                </div>
                <!-- 长列表优化 -->
                <DynamicScroller
                    :items="visibleMessages"
                    :min-item-size="28"
                    class="chatList"
                    id="liveMsg"
                    ref="liveMsg"
                    v-if="visibleMessages.length"
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
                <div v-else class="chatEmpty">
                    {{ msgFilter.length ? '暂无符合筛选的消息' : '暂无消息' }}
                </div>
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
            <!-- 两套礼物：抖音 / TikTok -->
            <div class="platformTabs">
                <span
                    v-for="p in PLATFORMS"
                    :key="p"
                    class="platformTab"
                    :class="{ active: resendPlatform === p }"
                    @click="switchResendPlatform(p)"
                >
                    <span class="platformIcon" :class="p">
                        {{ p === 'tiktok' ? 'T' : '抖' }}
                    </span>
                    {{ platformName(p) }}礼物
                    <span class="platformCount">
                        {{ giftCatalogs[p].length }}
                    </span>
                </span>
            </div>
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
                        giftCatalogs[resendPlatform].length
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
                <label>TikTok 代理</label>
                <el-input
                    v-model="tiktokProxy"
                    placeholder="例如 http://127.0.0.1:7890，不需要可不填"
                    clearable
                />
            </div>
            <div class="formRow">
                <label>Python</label>
                <el-input
                    v-model="pythonPath"
                    placeholder="自动查找，找不到时填写 python.exe 的路径"
                    clearable
                />
            </div>
            <p class="formHint">
                TikTok 采集不需要登录，依赖 Python 3.10+ 和 TikTokLive 组件，缺少时会提示自动安装
            </p>
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
    h,
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
import { getCurrent } from '@tauri-apps/api/window'
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
const messageList = ref<any[]>([
    {
        id: '1',
        type: 'chat',
        name: 'Kelvin',
        msg: '欢迎使用弹幕工具',
    },
])
// websocket client
let socketClient: SocketCli | null = null
// 采集连接状态：抖音由 websocket 更新，TikTok 由采集进程更新
type CollectStatus = SocketStatus | 'connecting'
const socketStatus = ref<CollectStatus>('closed')
const socketStatusText = computed(() => {
    switch (socketStatus.value) {
        case 'connected':
            return '已连接'
        case 'connecting':
            return '连接中'
        case 'reconnecting':
            return '重连中'
        default:
            return '未连接'
    }
})

// ---------- 平台 ----------
type Platform = 'douyin' | 'tiktok'
const PLATFORMS: Platform[] = ['douyin', 'tiktok']
// 根据地址判断平台：tiktok.com 的地址或 @用户名 为 TikTok，其他为抖音
const detectPlatform = (url: string): Platform =>
    /tiktok\.com/i.test(url) || url.trim().startsWith('@') ? 'tiktok' : 'douyin'
const platformName = (platform: Platform) =>
    platform === 'tiktok' ? 'TikTok' : '抖音'
const platformGlyph = (url: string) =>
    detectPlatform(url) === 'tiktok' ? 'T' : '抖'
// 当前采集的平台
const collectPlatform = ref<Platform>('douyin')

// 文字转义：聊天、昵称等内容来自观众，不能直接当 HTML 渲染
const escapeHtml = (text: unknown) =>
    String(text ?? '').replace(
        /[&<>"']/g,
        (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
    )
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
        case 'connecting':
            return '连接中'
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
// TikTok 代理与 Python 路径
const tiktokProxy = ref(localStorage.getItem('tiktokProxy') || '')
const pythonPath = ref(localStorage.getItem('pythonPath') || '')
watch(tiktokProxy, (v) => localStorage.setItem('tiktokProxy', v.trim()))
watch(pythonPath, (v) => localStorage.setItem('pythonPath', v.trim()))
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
    if (detectPlatform(inputUrl.value) === 'tiktok') {
        return {
            level: 'none',
            text: '免登录',
            detail: 'TikTok 采集不需要登录',
        }
    }
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
// 礼物种类长期保存在应用数据目录里(由 Rust 端读写)，抖音和 TikTok 各一份，
// 不放在 localStorage：清理浏览数据不会丢，多个窗口共用同一份
const giftCatalogs = ref<Record<Platform, GiftKind[]>>({ douyin: [], tiktok: [] })
const knownGiftIds: Record<Platform, Set<string>> = {
    douyin: new Set(),
    tiktok: new Set(),
}

// 把礼物种类加入当前窗口的列表(不写文件)
const addGiftKindsLocal = (platform: Platform, kinds: GiftKind[]) => {
    const known = knownGiftIds[platform]
    if (!known) return
    kinds.forEach((kind) => {
        if (!kind || !kind.id || known.has(kind.id)) return
        known.add(kind.id)
        // 礼物数据不需要响应式
        giftCatalogs.value[platform].push({ ...kind, gift: markRaw(kind.gift || {}) })
    })
}

// 写入长期存储，失败时提示一次
let giftSaveErrorShown = false
const saveGiftKinds = async (platform: Platform, kinds: GiftKind[]) => {
    try {
        await invoke('add_gift_kinds', { platform, kinds })
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
        unlistenGiftKinds = await listen<{ platform: Platform; kinds: GiftKind[] }>(
            'gift-kinds-added',
            (event) => addGiftKindsLocal(event.payload.platform, event.payload.kinds),
        )
        for (const platform of PLATFORMS) {
            // 加载已保存的礼物种类。加载完成前本窗口已经收到的礼物也要补存进去
            const receivedBeforeLoad = giftCatalogs.value[platform].slice()
            const saved = await invoke<GiftKind[]>('get_gift_catalog', { platform })
            const savedIds = new Set(saved.map((g) => g.id))
            addGiftKindsLocal(platform, saved)
            const missing = receivedBeforeLoad.filter((g) => !savedIds.has(g.id))
            if (missing.length) await saveGiftKinds(platform, missing)
        }
    } catch (e) {
        console.error('加载礼物种类失败:', e)
    }
})
onBeforeUnmount(() => {
    unlistenGiftKinds?.()
})

// 收到礼物时记录它的种类：只有第一次见到的礼物才会写入
const recordGiftKind = (platform: Platform, giftId: string, gift: any) => {
    if (!gift || !giftId || giftId === '0' || knownGiftIds[platform].has(giftId)) return
    // 转成普通对象，和正常推送给后台的格式一致
    const giftJson = typeof gift.toJSON === 'function' ? gift.toJSON() : gift
    const kind: GiftKind = {
        id: giftId,
        name: gift.name || '未知礼物',
        diamondCount: gift.diamondCount || 0,
        icon: gift.icon?.urlListList?.[0] || '',
        gift: giftJson,
    }
    addGiftKindsLocal(platform, [kind])
    saveGiftKinds(platform, [kind])
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
// 补发使用哪一套礼物
const resendPlatform = ref<Platform>('douyin')
const switchResendPlatform = (platform: Platform) => {
    if (resendPlatform.value === platform) return
    resendPlatform.value = platform
    resendGiftId.value = ''
}
const resendCount = ref(1)
const giftKeyword = ref('')
// 价格高的排在前面
const filteredGifts = computed(() => {
    const keyword = giftKeyword.value.trim().toLowerCase()
    return giftCatalogs.value[resendPlatform.value]
        .filter((g) => !keyword || g.name.toLowerCase().includes(keyword))
        .sort((a, b) => b.diamondCount - a.diamondCount)
})
const selectedGift = computed(() =>
    giftCatalogs.value[resendPlatform.value].find(
        (g) => g.id === resendGiftId.value,
    ),
)

// 点击消息列表里的观众，打开补发礼物
const openResend = (item: any) => {
    if (!item.user) return
    resendTarget.value = {
        name: item.name,
        avatar: item.user.AvatarThumb?.urlListList?.[0] || '',
        user: markRaw(item.user),
    }
    // 默认使用这条消息所在平台的礼物
    const platform: Platform = item.platform === 'tiktok' ? 'tiktok' : 'douyin'
    if (resendPlatform.value !== platform) resendGiftId.value = ''
    resendPlatform.value = platform
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
        platform: resendPlatform.value,
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
            platform: resendPlatform.value,
            msg: `补发 ${giftIconHtml(kind.icon)} ${escapeHtml(kind.name)} x${count}个 (${kind.diamondCount}钻)`,
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

// 判断直播间是否在直播；获取失败按未开播处理
const fetchRoomLive = async (url: string) => {
    if (detectPlatform(url) === 'tiktok') {
        try {
            const live = await invoke<boolean | null>('check_tiktok_live', {
                uniqueId: url,
                proxy: tiktokProxy.value.trim() || null,
            })
            return live === true
        } catch {
            return false
        }
    }
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
    if (detectPlatform(url) === 'douyin' && loginState.value.level === 'warn') {
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
    // 先清空历史直播。exe 不在这里关闭：已经在运行就复用，只有点「停止」才关闭
    await clearLivex(false)
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
            // 已经在运行就复用；exe 路径或房间号变了才会重启
            await invoke<boolean>('run_external_exe', {
                exePath: exePathStr,
                roomId: roomIdStr,
            })
        } else {
            // 没有勾选「使用 exe」：之前打开的 exe 关掉
            await invoke('stop_external_processes')
        }
    } catch (error) {
        ElMessage.error('启动失败，请检查目录、exe 或环境')
        console.error(error)
        return
    }
    // 再开始新的直播
    if (url.trim() && detectPlatform(url) === 'tiktok') {
        await startTikTok(url)
        return
    }
    collectPlatform.value = 'douyin'
    collecting = true
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

// ---------- TikTok 采集 ----------
// 当前窗口的 label：采集事件按窗口区分
const windowLabel = (() => {
    try {
        return getCurrent().label
    } catch {
        return 'main'
    }
})()
// 当前采集会话号：0 表示没有采集，-1 表示正在启动
let tiktokSession = 0
// 启动期间先收到的事件，拿到会话号后再处理
let tiktokPendingEvents: Array<{ session: number; event: any }> = []
// 当前采集的 TikTok 地址
let tiktokUrl = ''
// 采集是否已经由脚本给出了结束原因(直播结束/没开播/出错)
let tiktokEnded = false
let unlistenTikTok: (() => void) | null = null

onMounted(async () => {
    try {
        unlistenTikTok = await listen<{
            window: string
            session: number
            events: any[]
        }>('tiktok-event', (e) => {
            const { window: label, session, events } = e.payload
            if (label !== windowLabel) return
            if (tiktokSession === -1) {
                events.forEach((event) => tiktokPendingEvents.push({ session, event }))
                return
            }
            if (session !== tiktokSession) return
            events.forEach(handleTikTokEvent)
        })
    } catch (e) {
        console.error('listen tiktok-event error:', e)
    }
})
onBeforeUnmount(() => {
    unlistenTikTok?.()
})

const stopTikTok = async () => {
    if (tiktokSession === 0) return
    tiktokSession = 0
    tiktokPendingEvents = []
    try {
        await invoke('stop_tiktok')
    } catch (e) {
        console.error('stop_tiktok error:', e)
    }
}

// 正在安装 TikTok 运行环境：防止重复安装
let tiktokEnvInstalling = false

// 检查 Python 和 TikTokLive，缺少时询问后自动安装，装好后直接继续，不需要重启程序
const ensureTikTokEnv = async () => {
    if (tiktokEnvInstalling) {
        ElMessage.info('正在安装 TikTok 运行环境，请稍候')
        return false
    }
    const python = pythonPath.value.trim() || null
    const proxy = tiktokProxy.value.trim() || null
    type Env = { python: boolean; pythonError: string | null; installed: boolean }
    let env: Env
    try {
        env = await invoke<Env>('check_tiktok_env', { python })
    } catch (e) {
        ElMessage.error(String(e))
        return false
    }
    if (env.installed) return true
    // 设置里填了 Python 路径但不可用：让用户自己处理，不自动安装
    if (!env.python && python) {
        ElMessageBox.alert(env.pythonError || 'Python 不可用', 'Python 不可用', {
            confirmButtonText: '知道了',
        })
        return false
    }
    const needPython = !env.python
    try {
        await ElMessageBox.confirm(
            needPython
                ? 'TikTok 采集需要 Python 运行环境，电脑上没有找到。是否自动安装 Python 3.12(约 26MB，只为当前用户安装，不需要管理员权限)和 TikTokLive 组件？'
                : 'TikTok 采集需要安装 TikTokLive 组件(大约需要一分钟)。会为本程序单独创建 Python 环境，不影响电脑上已有的 Python。现在安装吗？',
            needPython ? '安装 Python' : '安装 TikTok 组件',
            { confirmButtonText: '安装', cancelButtonText: '取消' },
        )
    } catch {
        return false
    }
    tiktokEnvInstalling = true
    // 安装进度：文字跟随进度事件更新
    const progressText = ref(needPython ? '正在下载 Python...' : '正在安装 TikTokLive 组件...')
    const loading = ElMessage({
        message: () => h('span', progressText.value),
        duration: 0,
        type: 'info',
    })
    let unlistenProgress: (() => void) | null = null
    try {
        if (needPython) {
            unlistenProgress = await getCurrent().listen<{
                stage: string
                percent: number | null
            }>('python-install-progress', (e) => {
                const { stage, percent } = e.payload
                if (stage === 'download') {
                    progressText.value = `正在下载 Python... ${percent ?? 0}%`
                } else if (stage === 'install') {
                    progressText.value = '正在安装 Python，请稍候(约 1 分钟)...'
                }
            })
            await invoke('install_python', { proxy })
        }
        progressText.value = '正在安装 TikTokLive 组件...'
        await invoke('install_tiktok_env', { python, proxy })
        ElMessage.success(
            needPython ? 'Python 和 TikTokLive 组件安装完成' : 'TikTokLive 组件安装完成',
        )
        return true
    } catch (e) {
        ElMessageBox.alert(String(e), '安装失败', { confirmButtonText: '知道了' })
        return false
    } finally {
        unlistenProgress?.()
        loading.close()
        tiktokEnvInstalling = false
    }
}

const startTikTok = async (url: string) => {
    collectPlatform.value = 'tiktok'
    if (!(await ensureTikTokEnv())) return
    collecting = true
    tiktokUrl = url
    tiktokEnded = false
    const uniqueId = url.match(/@([^/?#\s]+)/)?.[1] || url
    liveInfo.value = {
        ...liveInfo.value,
        uid: uniqueId,
        status: 1,
        title: 'TikTok',
        name: '@' + uniqueId.replace(/^@/, ''),
        roomId: '',
        avatar: Logo,
        fans: 0,
        customer: 0,
        totalLike: 0,
    }
    socketStatus.value = 'connecting'
    tiktokSession = -1
    tiktokPendingEvents = []
    try {
        const session = await invoke<number>('start_tiktok', {
            uniqueId: url,
            proxy: tiktokProxy.value.trim() || null,
            python: pythonPath.value.trim() || null,
        })
        // 启动期间被停止了
        if (tiktokSession !== -1) return
        tiktokSession = session
        const pending = tiktokPendingEvents.filter((p) => p.session === session)
        tiktokPendingEvents = []
        pending.forEach((p) => handleTikTokEvent(p.event))
    } catch (e) {
        tiktokSession = 0
        socketStatus.value = 'closed'
        ElMessage.error(String(e))
    }
}

// 处理采集脚本发来的事件：数据结构和抖音一致
const handleTikTokEvent = (ev: any) => {
    switch (ev.event) {
        case 'status':
            socketStatus.value =
                ev.status === 'connected'
                    ? 'connected'
                    : ev.status === 'reconnecting'
                      ? 'reconnecting'
                      : 'connecting'
            break
        case 'room':
            setRoomLive(tiktokUrl, true)
            liveInfo.value = {
                ...liveInfo.value,
                status: 2,
                roomId: ev.roomId || liveInfo.value.roomId,
                title: ev.title || liveInfo.value.title,
                name: ev.nickName || liveInfo.value.name,
                avatar: ev.avatar || liveInfo.value.avatar,
                customer: ev.userCount || liveInfo.value.customer,
                totalLike: ev.likeCount || liveInfo.value.totalLike,
                fans: ev.followerCount || liveInfo.value.fans,
            }
            if (ev.videoUrl && !dplayer) loadLive(ev.videoUrl)
            break
        case 'chat':
            onChat('tiktok', ev.id, ev.user, ev.content)
            break
        case 'gift':
            onGift('tiktok', {
                id: ev.id,
                user: ev.user,
                gift: ev.gift,
                giftId: ev.giftId,
                total: ev.repeatCount,
                repeatEnd: ev.repeatEnd,
                groupId: ev.groupId,
            })
            break
        case 'like':
            onLike('tiktok', ev.id, ev.user, ev.count, ev.total)
            break
        case 'join':
            onJoin('tiktok', ev.id, ev.user)
            break
        case 'follow':
            onFollow('tiktok', ev.id, ev.user, ev.followCount)
            break
        case 'stats':
            liveInfo.value = { ...liveInfo.value, customer: ev.viewers }
            break
        case 'offline':
            tiktokEnded = true
            setRoomLive(tiktokUrl, false)
            liveInfo.value = { ...liveInfo.value, status: 4 }
            ElMessage.warning('主播当前没有在直播')
            break
        case 'live_end':
            tiktokEnded = true
            setRoomLive(tiktokUrl, false)
            liveInfo.value = { ...liveInfo.value, status: 4 }
            ElMessage.warning('直播已结束，停止采集')
            break
        case 'error':
            console.warn('[tiktok]', ev.message)
            if (ev.fatal) {
                tiktokEnded = true
                setRoomLive(tiktokUrl, false)
                ElMessage.error(ev.message)
            } else if (ev.code === 'rate_limit') {
                ElMessage.warning(ev.message)
            }
            break
        case 'exit':
            tiktokSession = 0
            socketStatus.value = 'closed'
            if (!tiktokEnded) ElMessage.error('TikTok 采集进程意外退出')
            break
        case 'log':
            console.log('[tiktok]', ev.message)
            break
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
// 清空直播和消息。stopExe 为 true 时同时关闭 exe(点「停止」时)；开始采集时传 false，exe 保持运行
const clearLivex = async (stopExe = true) => {
    // 先停止推送：之后到达的消息不再发给后台，队列里没发出去的和重试中的全部取消
    collecting = false
    resetPushers()
    if (stopExe) {
        try {
            await invoke('stop_external_processes')
        } catch (error) {
            console.error('stop_external_processes error:', error)
        }
    }
    // console.log('清空')
    destroyPlayer()
    msgStickBottom.value = true
    unreadMsgCount.value = 0
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
    await stopTikTok()
    socketStatus.value = 'closed'
    diamond.value = 0
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
// 用户往上翻看时，为了不让正在看的内容跳动，先不裁剪，超过这个数才强制裁剪
const HARD_MAX_MESSAGE_COUNT = 3000
// 消息列表添加消息：长列表优化
// 裁剪时额外保留的旧礼物条数：礼物比弹幕少得多，筛选「礼物」时不至于被弹幕挤掉
const KEEP_GIFT_COUNT = 300
const pushMsg = (msg: any) => {
    messageList.value.push(msg)
    const length = messageList.value.length
    if (
        (msgStickBottom.value && length > MAX_MESSAGE_COUNT) ||
        length > HARD_MAX_MESSAGE_COUNT
    ) {
        const list = messageList.value
        const cut = length - KEEP_MESSAGE_COUNT
        const oldGifts = list
            .slice(0, cut)
            .filter((m) => m.type === 'gift')
            .slice(-KEEP_GIFT_COUNT)
        messageList.value = oldGifts.concat(list.slice(cut))
    }
    if (msgStickBottom.value) {
        scrollToBottom()
    } else if (msgMatches(msg)) {
        unreadMsgCount.value++
    }
}

// 消息筛选：选中的类型为空表示显示全部，选择会记住
type MsgKind = 'chat' | 'gift' | 'like' | 'join' | 'follow'
const MSG_FILTERS: { key: MsgKind; label: string }[] = [
    { key: 'chat', label: '弹幕' },
    { key: 'gift', label: '礼物' },
    { key: 'like', label: '点赞' },
    { key: 'join', label: '进场' },
    { key: 'follow', label: '关注' },
]
const loadMsgFilter = (): MsgKind[] => {
    try {
        const saved = JSON.parse(localStorage.getItem('msg_filter') || '[]')
        const keys = MSG_FILTERS.map((f) => f.key)
        return Array.isArray(saved)
            ? saved.filter((k: any) => keys.includes(k))
            : []
    } catch {
        return []
    }
}
const msgFilter = ref<MsgKind[]>(loadMsgFilter())
const msgMatches = (msg: any) =>
    !msgFilter.value.length || msgFilter.value.includes(msg.type)
const visibleMessages = computed(() =>
    msgFilter.value.length
        ? messageList.value.filter(msgMatches)
        : messageList.value,
)
// 点「全部」清空筛选；点某个类型则切换选中，全部取消后回到「全部」
const toggleMsgFilter = (key: MsgKind | null) => {
    if (key === null) {
        msgFilter.value = []
    } else if (msgFilter.value.includes(key)) {
        msgFilter.value = msgFilter.value.filter((k) => k !== key)
    } else {
        msgFilter.value = [...msgFilter.value, key]
    }
    localStorage.setItem('msg_filter', JSON.stringify(msgFilter.value))
    // 换了筛选后列表内容整体变化，直接回到最新
    nextTick(() => scrollToBottom(true))
}

// 是否自动滚动到底部：用户往上翻看时暂停，手动滚回底部后恢复
const msgStickBottom = ref(true)
// 翻看期间新来的消息数
const unreadMsgCount = ref(0)
// 最近一次用户操作列表(滚轮、触摸、键盘)的时间，以及是否按住了鼠标(拖动滚动条)。
// 新消息加入、列表测量高度、裁剪旧消息时也会触发滚动事件，这些不能算作用户在翻看
let msgUserActionAt = 0
let msgPointerDown = false
const markMsgUserAction = () => {
    msgUserActionAt = Date.now()
}
const onMsgPointerDown = () => {
    msgPointerDown = true
    markMsgUserAction()
    window.addEventListener(
        'pointerup',
        () => {
            msgPointerDown = false
            markMsgUserAction()
        },
        { once: true },
    )
}
const onMsgScroll = (e: Event) => {
    const el = e.target as HTMLElement
    if (el?.id !== 'liveMsg') return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) {
        // 回到底部：恢复自动跟随
        msgStickBottom.value = true
        unreadMsgCount.value = 0
    } else if (msgPointerDown || Date.now() - msgUserActionAt < 800) {
        // 用户主动往上翻：停止自动跟随
        msgStickBottom.value = false
    }
}

// 滚动到底部；force 为 true 时不管当前是否在翻看。
// 用虚拟列表自带的方法：新消息渲染后才测量出实际高度，它会等测量完成再滚到真正的底部
const scrollToBottom = (force = false) => {
    if (force) {
        msgStickBottom.value = true
        unreadMsgCount.value = 0
    }
    if (!msgStickBottom.value) return
    liveMsg.value?.scrollToBottom?.()
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
// - 停止采集时清空队列、取消重试，停止后不会再有消息发给后台
const PUSH_TIMEOUT = 10000
// 是否正在采集：停止后到达的消息不再推送给后台
let collecting = false
// 所有推送队列的清空方法
const pusherResets: Array<() => void> = []
const resetPushers = () => pusherResets.forEach((reset) => reset())

const createPusher = (batchType: string, maxBuffer: number) => {
    let buffer: any[] = []
    let sending = false
    let retryTimer: any = null
    let failCount = 0
    let batchSize = 50
    // 队列代数：清空后加一，清空前发出的请求结束时不再放回队列、不再继续发送
    let generation = 0

    pusherResets.push(() => {
        generation++
        buffer = []
        clearTimeout(retryTimer)
        retryTimer = null
        failCount = 0
        // 正在进行的请求无法撤回，结束后按代数判断，不会再触发后续发送
        sending = false
    })

    const flush = () => {
        if (sending || retryTimer || buffer.length === 0) return
        if (pushUrl.value == '') {
            buffer = []
            return
        }
        sending = true
        const gen = generation
        const batch = buffer.splice(0, batchSize)
        const url = pushUrl.value + '/' + roomId.value
        const body = { type: batchType, items: batch }
        let retryDelay = 0
        axios
            .post(url, body, { timeout: PUSH_TIMEOUT })
            .then(() => {
                if (gen === generation) failCount = 0
            })
            .catch((err) => {
                // 队列已经被清空(停止采集)：失败的这一批直接丢弃
                if (gen !== generation) return
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
                // 队列已经被清空：不改动新一轮的状态，也不继续发送
                if (gen !== generation) return
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
        if (!collecting) return
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

// 礼物图标
const giftIconHtml = (icon: string) =>
    icon && /^https?:\/\//.test(icon)
        ? `<img src="${escapeHtml(icon)}" style="width: 20px; margin-top:-0.2em"/>`
        : ''

// 聊天：抖音和 TikTok 共用
const onChat = (platform: Platform, id: string, user: any, content: string) => {
    if (isDuplicate(id)) return
    const message = {
        id,
        type: 'chat',
        name: user?.nickName,
        user: rawUser(user),
        platform,
        msg: escapeHtml(content),
    }
    checkList.value.includes('chat') && pushMsg(message)
    if (pushUrl.value == '') return
    pushChat({ id, type: 'chat', platform, user, content })
}

// 解析弹幕消息
const decodeChat = (data) => {
    const { common, user, content } = douyin.ChatMessage.decode(data)
    onChat('douyin', common.msgId.toString(), user, content)
}

// 礼物连击记录：key 为 平台_用户_礼物_连击组，value 为已经统计过的数量
// 连击礼物每次下发的 repeatCount 是累计值，连击结束时还会再发一条 repeatEnd=1 的消息(数量和上一条相同)，
// 直接按条推送会重复，所以这里只推送相对上一条的增量。抖音和 TikTok 规则相同
const giftComboMap = new Map<string, { count: number; at: number }>()
const GIFT_COMBO_TTL = 10 * 60 * 1000
const pruneGiftCombo = () => {
    if (giftComboMap.size < 2000) return
    const now = Date.now()
    giftComboMap.forEach((v, k) => {
        if (now - v.at > GIFT_COMBO_TTL) giftComboMap.delete(k)
    })
}

// 礼物：抖音和 TikTok 共用
const onGift = (
    platform: Platform,
    data: {
        id: string
        user: any
        gift: any
        giftId: string
        // 本条消息里的累计数量
        total: number
        repeatEnd: number
        groupId: string
    },
) => {
    const { id, user, gift, giftId, repeatEnd, groupId } = data
    if (isDuplicate(id)) return
    recordGiftKind(platform, giftId, gift)
    const total = data.total || 1
    // 本次实际新增的数量
    let count = total
    if (groupId && groupId !== '0') {
        const key = `${platform}_${user?.id}_${giftId}_${groupId}`
        const prev = giftComboMap.get(key)?.count || 0
        if (gift?.combo || repeatEnd === 1) {
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
        id,
        type: 'gift',
        name: user?.nickName,
        user: rawUser(user),
        platform,
        msg: `送出 ${giftIconHtml(icon)} ${escapeHtml(gift?.name)} x${count}个 (${diamondCount}钻)`,
    }
    checkList.value.includes('gift') && pushMsg(message)
    // 计算主播收益
    diamond.value = diamond.value + diamondCount * count
    if (pushUrl.value == '') return
    pushGift({
        id,
        type: 'gift',
        platform,
        user,
        gift,
        // 本次新增数量
        repeatCount: count,
        // 连击累计数量
        totalCount: total,
        repeatEnd,
    })
}

// 解析礼物消息
const decodeGift = (data) => {
    const giftMsg = douyin.GiftMessage.decode(data)
    const { common, user, gift, repeatCount } = giftMsg
    onGift('douyin', {
        id: common.msgId.toString(),
        user,
        gift,
        giftId: (gift?.id ?? giftMsg.giftId).toString(),
        total: parseInt(repeatCount.toString()) || 1,
        repeatEnd: giftMsg.repeatEnd,
        groupId: giftMsg.groupId.toString(),
    })
}

// 进入直播间：抖音和 TikTok 共用
const onJoin = (platform: Platform, id: string, user: any) => {
    if (isDuplicate(id)) return
    checkList.value.includes('comein') &&
        pushMsg({
            id,
            type: 'join',
            name: user?.nickName,
            user: rawUser(user),
            platform,
            msg: '来了',
        })
}

// 点赞：抖音和 TikTok 共用
const onLike = (
    platform: Platform,
    id: string,
    user: any,
    count: number,
    total: number,
) => {
    if (isDuplicate(id)) return
    liveInfo.value = { ...liveInfo.value, totalLike: total }
    if (checkList.value.includes('like')) {
        // 同一个人连续点赞只显示一条，数量往上加；中间有别的消息就重新开始一条
        // 只影响列表显示，推送给后台的数据不合并
        const likes = Math.max(1, Number(count) || 1)
        const likeKey = `${platform}_${user?.id?.toString() ?? user?.nickName}`
        const list = messageList.value
        const last = list[list.length - 1]
        if (last && last.type === 'like' && last.likeKey === likeKey) {
            last.likeCount += likes
            last.msg = `为主播点赞了 x ${last.likeCount}`
            scrollToBottom()
        } else {
            pushMsg({
                id,
                type: 'like',
                name: user?.nickName,
                user: rawUser(user),
                platform,
                likeKey,
                likeCount: likes,
                msg: `为主播点赞了 x ${likes}`,
            })
        }
    }
    if (pushUrl.value == '') return
    pushLike({ id, type: 'like', platform, user, like: count })
}

// 关注：抖音和 TikTok 共用
const onFollow = (platform: Platform, id: string, user: any, followCount: number) => {
    if (isDuplicate(id)) return
    if (followCount) liveInfo.value = { ...liveInfo.value, fans: followCount }
    checkList.value.includes('follow') &&
        pushMsg({
            id,
            type: 'follow',
            name: user?.nickName,
            user: rawUser(user),
            platform,
            msg: '关注了主播',
        })
}

// 进入房间
const enterLive = (data) => {
    const { common, user } = douyin.MemberMessage.decode(data)
    onJoin('douyin', common.msgId.toString(), user)
}

// 点赞消息
const likeLive = (data) => {
    const { common, user, total, count } = douyin.LikeMessage.decode(data)
    onLike(
        'douyin',
        common.msgId.toString(),
        user,
        parseInt(count.toString()),
        total as any,
    )
}

// 关注主播
const followLive = (data) => {
    const { common, user, followCount } = douyin.SocialMessage.decode(data)
    onFollow('douyin', common.msgId.toString(), user, followCount as any)
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
    --c-gift: #b45309;
    --c-gift-bg: #fff4e0;
    --c-gift-bar: #f59e0b;

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
    --c-gift: #fbbf24;
    --c-gift-bg: rgba(245, 158, 11, 0.12);
    --c-gift-bar: #f59e0b;

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

        &.reconnecting,
        &.connecting {
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

            &.reconnecting,
            &.connecting {
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
    position: relative;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--c-border);

    // 回到最新消息
    .toLatest {
        position: absolute;
        left: 50%;
        bottom: 12px;
        z-index: 10;
        height: 28px;
        padding: 0 12px;
        display: flex;
        align-items: center;
        gap: 4px;
        transform: translateX(-50%);
        border: none;
        border-radius: 14px;
        background-color: var(--c-accent);
        color: var(--c-accent-text);
        font-size: 12px;
        white-space: nowrap;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

        &:hover {
            background-color: var(--c-accent-hover);
        }
    }

    // 消息筛选
    .msgFilter {
        flex-shrink: 0;
        padding: 6px 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        border-bottom: 1px solid var(--c-border);
        user-select: none;

        .chip {
            height: 22px;
            padding: 0 9px;
            border: 1px solid var(--c-border);
            border-radius: 11px;
            background: transparent;
            color: var(--c-text-2);
            font-size: 12px;
            line-height: 20px;
            cursor: pointer;

            &:hover {
                background-color: var(--c-hover);
                color: var(--c-text);
            }

            &.active {
                border-color: var(--c-accent);
                background-color: var(--c-accent);
                color: var(--c-accent-text);
            }

            // 礼物选中时沿用礼物的琥珀色
            &.gift.active {
                border-color: var(--c-gift-bar);
                background-color: var(--c-gift-bar);
                color: #ffffff;
            }
        }
    }

    .chatEmpty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--c-text-3);
        font-size: 12px;
    }

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

        // 礼物：整行用独立的琥珀色突出
        &.gift {
            margin: 2px 8px;
            padding: 4px 6px 4px 8px;
            border-radius: 6px;
            border-left: 3px solid var(--c-gift-bar);
            background-color: var(--c-gift-bg);

            .msgName {
                color: var(--c-gift);
                opacity: 0.8;
            }

            .msgText {
                color: var(--c-gift);
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

// ---------- 平台图标 ----------
// 抖音：实心；TikTok：描边。黑白主题下也能区分
.platformIcon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--c-text);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    user-select: none;

    &.douyin {
        background-color: var(--c-text);
        color: var(--c-bg);
    }

    &.tiktok {
        background-color: transparent;
        color: var(--c-text);
    }
}

.platformTabs {
    display: flex;
    gap: 6px;

    .platformTab {
        height: 30px;
        padding: 0 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--c-border);
        border-radius: 6px;
        color: var(--c-text-2);
        font-size: 13px;
        cursor: pointer;
        user-select: none;

        &:hover {
            background-color: var(--c-hover);
        }

        &.active {
            border-color: var(--c-accent);
            color: var(--c-text);
            font-weight: 600;
        }

        .platformCount {
            color: var(--c-text-3);
            font-size: 11px;
            font-weight: 400;
        }
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
