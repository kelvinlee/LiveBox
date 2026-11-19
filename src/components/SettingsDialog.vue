<template>
    <el-dialog v-model="settingsVisible" title="设置" width="560">
        <!-- 设置 -->
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
            <el-button type="primary" @click="settingsVisible = false">
                完成
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import {
    checkList,
    douyinCookie,
    exePath,
    projectPath,
    pushUrl,
    pythonPath,
    roomId,
    selectExePath,
    selectProjectPath,
    settingsVisible,
    tiktokProxy,
    useBackend,
    useExe,
} from '@/live/settings'
import { openDouyinLogin, syncDouyinCookies } from '@/live/login'
</script>

<style scoped lang="scss">
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
