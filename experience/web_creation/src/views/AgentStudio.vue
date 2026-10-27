<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
import MediaCover from '../components/MediaCover.vue'
import MediaParameters from '../components/MediaParameters.vue'
import StoryGuide from '../components/StoryGuide.vue'
const p = useCreation(),
  s = p.state,
  d = p.studio
const upload = ref(null),
  list = ref(null),
  sound = ref(false),
  selectionStart = ref(null),
  drawArea = ref(null)
const parameterDraft = ref({})
watch(
  () => d.parameterOpen,
  open => {
    if (open) parameterDraft.value = JSON.parse(JSON.stringify(d.params))
  }
)
function saveParameters() {
  d.params = parameterDraft.value
  d.parameterOpen = false
}
function replaceRef(i) {
  pick('reference')
  d.replaceIndex = i
}
const categories = ['全部', '产品展示', '生活记录', '萌宠', '封面海报', '活动宣传']
const visibleCases = computed(() =>
  d.cases.filter(c => d.category === '全部' || c.category === d.category).slice(0, d.more ? 20 : 4)
)
const refs = computed(() => [
  ...s.assets.filter(a => a.type === '图片'),
  ...d.messages
    .filter(m => m.result && ['图片', '视频'].includes(m.result.type))
    .map(m => m.result),
  ...s.references
])
const modeHelp = {
  灵活模式: '直接描述需求，搭配参考素材生成图片、视频、音频、剧情或分镜。',
  灵感模式: '逐步确认方向、方案、剧情、分镜，再生成素材。'
}
function preview(c) {
  sound.value = false
  d.preview = c
}
function play(e) {
  const v = e.currentTarget.querySelector('video')
  v?.play().catch(() => {})
}
function stop(e) {
  e.currentTarget.querySelector('video')?.pause()
}
function chooseUpload() {
  upload.value?.click()
}
function pick(role) {
  d.replaceIndex = null
  d.picker = role || 'reference'
}
function pasted(e) {
  const files = [...e.clipboardData.items].filter(x => x.kind === 'file').map(x => x.getAsFile())
  if (files.length) {
    e.preventDefault()
    p.studioUpload(files)
  }
}
function send() {
  p.studioSend(undefined, d.target)
}
function frame() {
  const v = document.querySelector('.studio-preview video')
  if (!v) return
  try {
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    p.studioFrame(d.preview, c.toDataURL('image/png'))
    d.preview = null
  } catch {
    d.error = '视频帧暂不可读，请重试或上传图片'
  }
}
function down(e) {
  if (e.target.closest('button,input')) return
  const b = e.currentTarget.getBoundingClientRect()
  selectionStart.value = { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }
  e.currentTarget.setPointerCapture(e.pointerId)
}
function move(e) {
  if (!selectionStart.value) return
  const b = e.currentTarget.getBoundingClientRect(),
    x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
    y = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    a = selectionStart.value
  d.edit.rect = {
    x: Math.min(a.x, x),
    y: Math.min(a.y, y),
    w: Math.abs(x - a.x),
    h: Math.abs(y - a.y)
  }
}
function close() {
  d.preview = null
  d.picker = null
  d.parameterOpen = false
  d.inspect = null
  d.edit = null
  d.settings = false
  d.conflict = null
}
function theme() {
  p.syncStudioTheme()
}
const appearanceMedia = matchMedia('(prefers-color-scheme: light)')
onMounted(() => appearanceMedia.addEventListener('change', theme))
onUnmounted(() => appearanceMedia.removeEventListener('change', theme))
watch(
  () => d.messages.length,
  () => nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }))
)
</script>
<template>
  <div class="studio-page" @keydown.esc="close">
    <header class="studio-top">
      <span>创作空间 <span>/</span> {{ s.page === 'agent' ? '我的创作' : '灵感创作' }}</span>
      <div>
        <span class="studio-local"><i></i> 本地模拟 Demo</span
        ><button @click="p.newStudio()"><Icon name="plus" :size="15" />新会话</button
        ><button @click="p.go('workspace')"><Icon name="layers" :size="15" />打开画布</button>
      </div>
    </header>
    <main class="studio-content" :class="{ 'has-conversation': s.page === 'agent' }">
      <section v-if="s.page !== 'agent'" class="studio-welcome">
        <div class="studio-eyebrow">
          <Icon name="spark" :size="15" /> YOUR NEXT IDEA STARTS HERE
        </div>
        <h1>把灵感，<span>说出来。</span></h1>
        <p>一个想法，一张照片。让创作从这里发生。</p>
      </section>
      <section v-else ref="list" class="studio-conversation" aria-label="创作对话">
        <template v-if="d.mode === '灵感模式' && d.guideStarted"
          ><article v-for="(m, i) in s.messages" :key="i" class="studio-message" :class="m.role">
            <span class="studio-avatar">{{ m.role === 'user' ? '你' : '✦' }}</span>
            <div>
              <p>{{ m.text }}</p>
              <StoryGuide v-if="m.guide" :message-index="i" />
            </div></article
        ></template>
        <template v-else
          ><article v-for="m in d.messages" :key="m.id" class="studio-message" :class="m.role">
            <span class="studio-avatar">{{ m.role === 'user' ? '你' : '✦' }}</span>
            <div class="studio-message-body">
              <p v-if="m.role === 'user'">{{ m.text }}</p>
              <div v-if="m.role === 'user' && m.refs?.length" class="studio-tiny-refs">
                <span v-for="a in m.refs" :key="a.id + a.role"
                  >{{ a.role || '参考' }} · {{ a.name }}</span
                >
              </div>
              <div v-if="m.status === 'running'" class="studio-plan">
                <b
                  >{{ d.paused ? '已暂停' : '正在将想法变成作品' }}<span class="studio-pulse"></span
                ></b>
                <ol>
                  <li
                    v-for="(t, i) in [
                      '理解需求与素材',
                      '设计内容与镜头',
                      '生成画面与声音',
                      '整理并合成结果'
                    ]"
                    :key="t"
                    :class="{ done: d.progress > i, current: d.progress === i }"
                  >
                    <span>{{ d.progress > i ? '✓' : i + 1 }}</span
                    >{{ t }}
                  </li>
                </ol>
                <button class="secondary-button" @click="p.studioPause()">
                  {{ d.paused ? '继续生成' : '暂停调整' }}</button
                ><button class="ghost-button" @click="p.studioStop()">停止</button>
              </div>
              <div v-if="m.status === 'failed'" class="studio-error">
                {{ m.error }}<button @click="p.studioRetry(m)">重试失败项</button>
              </div>
              <p v-if="m.status === 'cancelled'" class="studio-muted">已停止，已有结果保留。</p>
              <section v-if="m.result" class="studio-result">
                <header>
                  <b>{{ m.result.name }}</b
                  ><span>版本 {{ m.result.version }} · {{ m.result.type }}</span
                  ><button @click="p.studioRestore(m.result)">采用此版本</button>
                </header>
                <div v-if="m.result.type === '视频'" class="studio-result-media">
                  <video
                    :src="m.result.mediaUrl"
                    controls
                    playsinline
                    :volume="(m.result.volume || 65) / 100"
                    :style="{
                      filter:
                        m.result.color === '暖色'
                          ? 'sepia(.35)'
                          : m.result.color === '冷色'
                            ? 'hue-rotate(20deg)'
                            : 'none'
                    }"
                  ></video
                  ><span class="studio-media-note">本地示例片段 · 模拟合成</span>
                </div>
                <div v-else-if="m.result.type === '图片'" class="studio-result-media">
                  <img :src="m.result.mediaUrl" :alt="m.result.name" />
                </div>
                <div v-else-if="m.result.type === '音频'" class="studio-audio">
                  <Icon name="audio" :size="32" />
                  <div>
                    <b>{{ m.result.name }}</b>
                    <p>{{ m.result.caption }}</p>
                    <audio :src="m.result.mediaUrl" controls></audio>
                  </div>
                </div>
                <button v-else class="studio-text-preview" @click="d.inspect = m.result">
                  <Icon :name="m.result.type === '脚本' ? 'script' : 'text'" />
                  <div>
                    <b>{{ m.result.type === '脚本' ? '分镜脚本 · 3 个镜头' : '剧情脚本' }}</b>
                    <p>{{ m.result.text?.slice(0, 130) || m.result.rows?.[0]?.visual }}</p>
                  </div>
                  <span>展开编辑 ↗</span>
                </button>
                <p v-if="m.result.annotation" class="studio-muted">
                  修改要求：{{ m.result.annotation.note }} ·
                  {{ m.result.annotation.scope }}（局部修改为交互模拟）
                </p>
                <footer>
                  <button @click="p.studioCanvas(m.result)">
                    <Icon name="plus" :size="14" />添加到画布</button
                  ><button
                    v-if="['图片', '视频', '音频'].includes(m.result.type)"
                    @click="p.studioSave(m.result)"
                  >
                    保存到个人资产</button
                  ><button @click="p.studioDownload(m.result)">下载</button>
                  <div class="studio-result-tools">
                    <button
                      v-if="['图片', '视频'].includes(m.result.type)"
                      title="放大预览或选帧"
                      @click="preview(m.result)"
                    >
                      ↗
                    </button>
                    <button
                      v-if="m.result.type === '视频'"
                      title="调整剪辑与声音"
                      @click="d.inspect = m.result"
                    >
                      <Icon name="settings" :size="16" /></button
                    ><button
                      v-if="['图片', '视频'].includes(m.result.type)"
                      title="引用此结果"
                      @click="
                        $event => {
                          p.studioReference(m.result)
                          d.target = m.result
                        }
                      "
                    >
                      <Icon name="attach" :size="16" /></button
                    ><button
                      v-if="['图片', '视频'].includes(m.result.type)"
                      title="圈选局部修改"
                      @click="p.studioEdit(m.result)"
                    >
                      <Icon name="edit" :size="16" />
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          </article>
          <div v-if="d.messages.some(m => m.result)" class="studio-next">
            <button @click="s.prompt = '把第二个镜头改为暖色，其他保持不变'">调整某个镜头</button
            ><button @click="s.prompt = '降低背景音乐音量，其他保持不变'">调整声音</button
            ><button
              @click="
                $event => {
                  s.prompt = '根据已有内容生成分镜脚本'
                  p.studioType('脚本')
                }
              "
            >
              继续制作分镜
            </button>
          </div></template
        >
      </section>
      <section class="studio-composer inspiration-box" @paste="pasted">
        <div v-if="d.selected" class="studio-selected">
          <button @click="preview(d.selected)">创意：{{ d.selected.name }} ↗</button
          ><button title="移除创意，保留输入内容" @click="d.selected = null">×</button
          ><small
            >{{ d.selected.type }} · {{ d.selected.ratio }} ·
            {{ d.selected.type === '视频' ? '15秒' : '静态图片' }} · 示例素材可直接使用</small
          >
        </div>
        <div v-if="d.target" class="studio-target">
          修改对象：{{ d.target.name }} · 版本{{ d.target.version
          }}<button @click="d.target = null">×</button>
        </div>
        <div class="studio-input-row">
          <div v-if="d.frameMode" class="studio-frames">
            <template v-for="(label, key) in { first: '首帧', last: '尾帧' }" :key="key"
              ><button
                v-if="key === 'last'"
                class="studio-swap"
                title="交换首尾帧"
                @click="[d.frames.first, d.frames.last] = [d.frames.last, d.frames.first]"
              >
                ⇄
              </button>
              <div class="studio-frame">
                <button @click="pick(key)">
                  <img v-if="d.frames[key]" :src="d.frames[key].mediaUrl" :alt="label" /><Icon
                    v-else
                    name="plus"
                    :size="22"
                  /><span>{{ label }}</span></button
                ><button
                  v-if="d.frames[key]"
                  class="studio-remove"
                  :title="'移除' + label"
                  @click="d.frames[key] = null"
                >
                  ×
                </button>
              </div></template
            >
          </div>
          <div v-if="s.references.length" class="studio-ref-list">
            <div v-for="(a, i) in s.references" :key="a.id" class="studio-ref">
              <button :title="'替换' + a.name" @click="replaceRef(i)">
                <MediaCover :asset="a" /><span>{{ a.role || a.type }} · {{ a.name }}</span></button
              ><button :title="'移除' + a.name" @click="s.references.splice(i, 1)">×</button>
            </div>
          </div>
          <textarea
            v-model="s.prompt"
            aria-label="创作需求"
            :placeholder="
              d.mode === '灵感模式'
                ? '告诉我你的想法，我们一起完善方向、剧情和分镜…'
                : '描述你想创作的内容，或输入 @ 引用素材…'
            "
            @keydown.ctrl.enter.prevent="send"
            @input="s.prompt.endsWith('@') && (d.picker = 'reference')"
          ></textarea>
        </div>
        <div class="studio-composer-bottom">
          <div class="studio-input-tools">
            <button
              title="上传素材"
              @click="
                $event => {
                  d.picker = 'reference'
                  chooseUpload()
                }
              "
            >
              <Icon name="attach" :size="18" /></button
            ><button title="从资产或历史引用" @click="pick('reference')">@</button
            ><select
              :value="d.type"
              aria-label="产出类型"
              @change="p.studioType($event.target.value)"
            >
              <option>视频</option>
              <option>图片</option>
              <option>音频</option>
              <option value="文字">剧情</option>
              <option value="脚本">分镜</option></select
            ><select v-if="d.type === '音频'" v-model="d.audioKind" aria-label="音频用途">
              <option>旁白</option>
              <option>背景音乐</option>
              <option>环境音效</option></select
            ><button
              v-if="['图片', '视频'].includes(d.type)"
              title="生成参数"
              @click="d.parameterOpen = true"
            >
              {{ d.params.ratio }} · {{ d.params.resolution
              }}<Icon name="down" :size="12" /></button
            ><button
              v-if="d.type === '视频'"
              :class="{ active: d.frameMode }"
              @click="d.frameMode = !d.frameMode"
            >
              首尾帧
            </button>
          </div>
          <div class="studio-mode">
            <template v-for="mode in ['灵感模式', '灵活模式']" :key="mode"
              ><button :class="{ active: d.mode === mode }" @click="d.mode = mode">
                <Icon :name="mode === '灵感模式' ? 'spark' : 'arrow'" :size="13" />{{
                  mode
                }}</button
              ><button class="studio-help" :aria-label="mode + '说明'" :data-tip="modeHelp[mode]">
                ?
              </button></template
            ><button
              class="studio-send"
              :disabled="!s.prompt.trim() || d.busy"
              aria-label="发送创作需求"
              @click="send"
            >
              <Icon name="arrow" :size="19" />
            </button>
          </div>
        </div>
        <p v-if="d.error" class="field-error" role="alert">{{ d.error }}</p>
      </section>
      <p class="studio-disclaimer">
        AI 激发灵感，创作由你决定 · 当前为本地交互 Demo，生成和编辑结果均为示意素材
      </p>
      <section v-if="s.page !== 'agent'" class="studio-ideas">
        <div class="studio-section-title">
          <h2>找点灵感，开始创作</h2>
          <button @click="d.more = !d.more">{{ d.more ? '收起' : '查看更多' }} ↗</button>
        </div>
        <nav class="studio-categories">
          <button
            v-for="c in categories"
            :key="c"
            :class="{ active: d.category === c }"
            @click="d.category = c"
          >
            {{ c }}
          </button>
        </nav>
        <div v-if="d.caseState === 'loading'" class="studio-muted" role="status">
          正在加载创意案例…<button @click="d.caseState = 'ready'">查看演示案例</button>
        </div>
        <div v-else-if="d.caseState === 'error'" class="studio-error">
          创意案例暂时未能加载，仍可直接输入需求。<button @click="d.caseState = 'ready'">
            重新加载
          </button>
        </div>
        <div v-else-if="d.caseState === 'empty'" class="studio-muted">
          暂时没有创意案例，直接描述你的想法即可开始。
        </div>
        <div v-else class="studio-case-grid">
          <article v-for="c in visibleCases" :key="c.id" class="studio-case">
            <button
              class="studio-case-preview"
              :aria-label="'预览' + c.name"
              @mouseenter="play"
              @mouseleave="stop"
              @click="preview(c)"
            >
              <video
                v-if="c.type === '视频'"
                :poster="c.refs?.find(a => a.role === '角色')?.mediaUrl"
                :src="p.previewMedia({ type: '视频', status: 'success' })"
                muted
                loop
                playsinline
                preload="metadata"
              ></video
              ><ProductScene v-else :variant="c.scene" /><span>{{
                c.type === '视频' ? '▷' : '▧'
              }}</span>
            </button>
            <div class="studio-case-copy">
              <div>
                <h3>{{ c.name }}</h3>
                <p>{{ c.description }}</p>
              </div>
              <button class="studio-use" :aria-label="'使用' + c.name" @click="p.studioApply(c)">
                使用
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
    <input
      ref="upload"
      type="file"
      hidden
      multiple
      accept="image/*,video/*,audio/*"
      @change="
        $event => {
          p.studioUpload($event.target.files)
          $event.target.value = ''
        }
      "
    />
    <section v-if="d.preview" class="studio-pop studio-preview" role="dialog" aria-label="放大预览">
      <header>
        <div>
          <h2>{{ d.preview.name }}</h2>
          <p>{{ d.preview.description || '可选择视频当前帧作为后续创作参考' }}</p>
        </div>
        <button aria-label="关闭预览" @click="d.preview = null">×</button>
      </header>
      <video
        v-if="d.preview.type === '视频'"
        :src="d.preview.mediaUrl || p.previewMedia({ type: '视频', status: 'success' })"
        controls
        autoplay
        playsinline
        :muted="!sound"
        @error="d.error = '预览加载失败，请重试'"
      ></video
      ><img
        v-else-if="d.preview.mediaUrl"
        :src="d.preview.mediaUrl"
        :alt="d.preview.name"
      /><ProductScene v-else :variant="d.preview.scene" />
      <p class="studio-muted">
        本地示意素材 · {{ d.preview.ratio || '16:9' }} ·
        {{ d.preview.type === '视频' ? '15秒' : '图片' }} ·
        {{ d.preview.refs?.length ? '案例已提供关键素材，可替换' : '无需必需素材' }}
      </p>
      <footer>
        <button class="secondary-button" @click="sound = !sound">
          {{ sound ? '关闭声音' : '开启声音' }}</button
        ><button
          v-if="d.preview.mediaUrl && d.preview.type === '视频'"
          class="secondary-button"
          @click="frame"
        >
          引用当前帧</button
        ><button
          v-if="d.cases.some(c => c.id === d.preview.id)"
          class="primary-button"
          @click="
            $event => {
              p.studioApply(d.preview)
              d.preview = null
            }
          "
        >
          使用
        </button>
      </footer>
    </section>
    <section v-if="d.conflict" class="studio-pop" role="dialog" aria-label="草稿冲突">
      <header>
        <h2>保留你的想法，再加入新创意</h2>
        <button @click="d.conflict = null">×</button>
      </header>
      <p>
        输入框中已有内容。案例将带入示例图片，请选择如何处理文字；已有素材会保留，不会静默删除。
      </p>
      <p class="studio-muted">新案例：{{ d.conflict.name }}</p>
      <footer>
        <button class="secondary-button" @click="d.conflict = null">取消</button
        ><button class="secondary-button" @click="p.studioApply(d.conflict, 'keep')">
          保留当前文字</button
        ><button class="primary-button" @click="p.studioApply(d.conflict, 'replace')">
          采用案例文字
        </button>
      </footer>
    </section>
    <section v-if="d.picker" class="studio-pop" role="dialog" aria-label="选择参考素材">
      <header>
        <h2>
          {{ d.picker === 'first' ? '选择首帧' : d.picker === 'last' ? '选择尾帧' : '引用素材' }}
        </h2>
        <button @click="d.picker = null">×</button>
      </header>
      <button class="studio-upload-zone" @click="chooseUpload()">
        <Icon name="plus" :size="24" /><b>上传图片或素材</b><span>也可直接在输入框粘贴图片</span>
      </button>
      <h3>个人资产与当前会话</h3>
      <div class="studio-picker-grid">
        <button
          v-for="(a, i) in refs.filter(a => d.picker === 'reference' || a.type === '图片')"
          :key="a.id + '-' + i"
          @click="p.studioReference(a)"
        >
          <MediaCover :asset="a" /><span>{{ a.name }}</span>
        </button>
      </div>
      <p v-if="!refs.length" class="studio-muted">还没有可引用素材，可以先上传。</p>
    </section>
    <section v-if="d.parameterOpen" class="studio-pop" role="dialog" aria-label="生成参数">
      <header>
        <h2>{{ d.type }}生成参数</h2>
        <button @click="d.parameterOpen = false">×</button>
      </header>
      <p class="studio-muted">自动填入默认参数，与画布节点共用配置。调整不会启动生成。</p>
      <MediaParameters v-model="parameterDraft" :type="d.type" />
      <footer><button class="primary-button" @click="saveParameters">完成</button></footer>
    </section>
    <section v-if="d.edit" class="studio-pop studio-region" role="dialog" aria-label="局部修改">
      <header>
        <div>
          <h2>圈选你想修改的区域</h2>
          <p>
            {{
              d.edit.source.type === '视频'
                ? '定位某一帧的对象，修改作用于整个镜头中的同一对象'
                : '拖动框选区域，并描述修改要求'
            }}
          </p>
        </div>
        <button @click="d.edit = null">×</button>
      </header>
      <div
        ref="drawArea"
        class="studio-draw"
        @pointerdown.prevent="down"
        @pointermove="move"
        @pointerup="selectionStart = null"
      >
        <video
          v-if="d.edit.source.type === '视频'"
          :src="d.edit.source.mediaUrl"
          muted
          :currentTime="d.edit.time"
        ></video
        ><img v-else :src="d.edit.source.mediaUrl" alt="待修改图片" />
        <div
          v-if="d.edit.rect"
          class="studio-rectangle"
          :style="{
            left: d.edit.rect.x * 100 + '%',
            top: d.edit.rect.y * 100 + '%',
            width: d.edit.rect.w * 100 + '%',
            height: d.edit.rect.h * 100 + '%'
          }"
        ></div>
      </div>
      <label v-if="d.edit.source.type === '视频'"
        >定位时间（秒）<input
          v-model.number="d.edit.time"
          type="range"
          min="0"
          max="2"
          step="0.1" /></label
      ><textarea
        v-model="d.edit.note"
        aria-label="区域修改要求"
        placeholder="例如：将这件衣服改为浅绿色，其他内容保持不变"
      ></textarea>
      <p class="studio-muted">局部修改为本地交互模拟，不代表真实视频对象追踪或重绘。</p>
      <footer>
        <button class="secondary-button" @click="d.edit.rect = null">重新圈选</button
        ><button
          class="primary-button"
          :disabled="!d.edit.rect || !d.edit.note.trim()"
          @click="p.studioApplyEdit()"
        >
          生成修改版本
        </button>
      </footer>
    </section>
    <section
      v-if="d.inspect"
      class="studio-pop"
      :class="{ 'studio-table-full': d.inspect.type === '脚本' }"
      role="dialog"
      aria-label="编辑创作结果"
    >
      <header>
        <h2>{{ d.inspect.name }}</h2>
        <button @click="d.inspect = null">×</button>
      </header>
      <textarea
        v-if="d.inspect.type === '文字' || d.inspect.type === '音频'"
        v-model="d.inspect.text"
        aria-label="编辑正文"
      ></textarea>
      <table v-else-if="d.inspect.type === '脚本'">
        <thead>
          <tr>
            <th>镜头</th>
            <th>时长</th>
            <th>画面</th>
            <th>台词／音效</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in d.inspect.rows" :key="r.id">
            <td>{{ r.number }}</td>
            <td><input v-model="r.duration" /></td>
            <td><textarea v-model="r.visual"></textarea></td>
            <td><input v-model="r.sound" /></td>
          </tr>
        </tbody>
      </table>
      <template v-else
        ><p class="studio-muted">选择镜头，调整顺序和时长。示例视频仅模拟重新合成。</p>
        <div v-for="(r, i) in d.inspect.shots" :key="r.number" class="studio-shot">
          <input v-model="r.selected" type="checkbox" :aria-label="'选择镜头' + r.number" /><b>{{
            r.number
          }}</b
          ><span>{{ r.visual }}</span
          ><input v-model="r.duration" :aria-label="'镜头' + r.number + '时长'" /><button
            :disabled="i === 0"
            @click="d.inspect.shots.splice(i - 1, 0, d.inspect.shots.splice(i, 1)[0])"
          >
            ↑
          </button>
        </div>
        <label
          >背景音乐音量 {{ d.inspect.volume }}%<input
            v-model.number="d.inspect.volume"
            type="range"
            min="0"
            max="100" /></label
        ><label
          >镜头色彩<select v-model="d.inspect.color">
            <option>自然</option>
            <option>暖色</option>
            <option>冷色</option>
          </select></label
        ></template
      >
      <footer>
        <button
          class="primary-button"
          @click="
            $event => {
              d.inspect.type === '视频'
                ? p.studioSend('调整所选镜头、顺序、时长、音量和色彩', d.inspect)
                : p.notify('编辑内容已保存')
              d.inspect = null
            }
          "
        >
          {{ d.inspect.type === '视频' ? '生成修改版本' : '保存修改' }}
        </button>
      </footer>
    </section>
  </div>
</template>
<style src="../styles/studio.css"></style>
