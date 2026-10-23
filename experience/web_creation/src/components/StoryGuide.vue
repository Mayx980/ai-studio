<script setup>
import { ref, computed } from 'vue'
import { useCreation } from '@/ports/creation'
import { directionFields } from '../state/story-format'
import ProductScene from './ProductScene.vue'
import MediaCover from './MediaCover.vue'
import MediaParameters from './MediaParameters.vue'
import ReferenceChip from './ReferenceChip.vue'
import { fitTextarea as vFitTextarea } from './fit-textarea'
const props = defineProps({ messageIndex: { type: Number, required: true } })
const p = useCreation(),
  s = p.state
const guide = computed(() => s.messages[props.messageIndex].guide)
const fullTable = ref(false),
  fullStory = ref(false)
const columns = [
  ['number', '镜头号'],
  ['duration', '时长'],
  ['scale', '景别'],
  ['camera', '运镜'],
  ['visual', '画面与动作'],
  ['sound', '台词/音效'],
  ['emotion', '角色反应'],
  ['environment', '场景'],
  ['imagePrompt', '分镜图提示词'],
  ['motionPrompt', '视频运动提示词']
]
const visibleColumns = computed(() =>
  guide.value.stage === 'shots'
    ? columns.filter(([key]) => ['number', 'duration', 'visual'].includes(key))
    : columns
)
const smallBubblePosition = computed(() => {
  const anchor = s.panelAnchor || { left: window.innerWidth / 2, top: 120, bottom: 145 }
  const width = Math.min(680, window.innerWidth - 32),
    height = Math.min(550, window.innerHeight - 32)
  return {
    left: Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16)) + 'px',
    top: Math.max(16, Math.min(anchor.bottom + 10, window.innerHeight - height - 16)) + 'px'
  }
})
const active = () => p.currentGuide?.() === guide.value && !s.readonly
function toggleRow(a, id) {
  a.rowIds = a.rowIds.includes(id) ? a.rowIds.filter(x => x !== id) : [...a.rowIds, id]
}
</script>
<template>
  <section class="story-guide" :data-stage="guide.stage">
    <small
      >{{ p.isConnected ? '真实模型' : '模拟创作' }} ·
      {{
        {
          direction: '确认方向',
          plans: '方案选择',
          story: '剧情脚本',
          storyboard: '分镜设计',
          'storyboard-pending': '生成分镜',
          'prompts-pending': '提取素材提示词',
          prompts: '素材提示词',
          'image-config': '生图参数',
          'image-preview': '图片预览',
          video: '视频生成',
          shots: '选择镜头',
          'video-config': '视频参数',
          'video-preview': '视频预览',
          done: '已结束'
        }[guide.stage]
      }}</small
    >
    <p v-if="guide.busy" role="status">{{ guide.activity }}，请稍候…</p>
    <fieldset :disabled="!active() || guide.busy">
      <template v-if="guide.stage === 'direction'">
        <div v-if="directionFields.some(([key]) => guide.known[key])" class="guide-plan">
          <b>已识别的方向</b>
          <p v-for="[key, label] in directionFields.filter(([key]) => guide.known[key])" :key="key">
            {{ label }}：{{ guide.brief[key] }}
          </p>
          <button class="secondary-button" @click="p.guideParseDirection(guide)">
            解析现有信息并覆盖到下列表单中
          </button>
        </div>
        <div
          v-for="[key, label, hint] in directionFields.filter(
            ([key]) => !guide.known[key] || guide.editKnown
          )"
          :key="key"
          class="guide-field"
        >
          <label :for="'direction-' + key"
            >{{ label }} <small v-if="guide.known[key]">已从输入识别</small></label
          >
          <input :id="'direction-' + key" v-model="guide.brief[key]" :placeholder="hint" />
        </div>
        <label
          >其他创作限制（可选）<textarea
            v-model="guide.brief.extra"
            placeholder="例如禁用元素、品牌规范、已有素材限制"
          ></textarea>
        </label>
        <button class="primary-button" @click="p.guidePlans(guide)">确认方向，查看方案</button>
      </template>
      <template v-else-if="guide.stage === 'storyboard-pending'"
        ><p>剧情已保存。分镜由真实模型生成，失败会保留已保存剧情。</p>
        <button class="primary-button" @click="p.guideRetryStoryboard(guide)">
          按当前剧情生成分镜
        </button></template
      >
      <template v-else-if="guide.stage === 'prompts-pending'"
        ><p>分镜已保存。提取实际角色、道具及场景提示词。</p>
        <button class="primary-button" @click="p.guideRetryPrompts(guide)">
          按当前分镜提取提示词
        </button></template
      >
      <template v-else-if="guide.stage === 'plans'">
        <article v-for="(plan, index) in guide.plans" :key="plan.name" class="guide-plan">
          <b>{{ index + 1 }}. {{ plan.name }}</b>
          <p>{{ plan.outline }}</p>
          <p>{{ plan.reason }}</p>
          <button class="primary-button" @click="p.guideChoosePlan(guide, index)">
            选择此方案
          </button>
        </article>
        <button class="secondary-button" @click="guide.otherPlan = true">
          其他方案，修改要求填写到下方表单
        </button>
        <div v-if="guide.otherPlan" class="guide-plan">
          <label
            >方案修改要求<textarea
              v-model="guide.planRequest"
              placeholder="描述新的创意方向或需要调整之处"
            ></textarea></label
          ><button class="primary-button" @click="p.guideOtherPlans(guide)">重新生成方案</button>
        </div>
      </template>
      <template v-else-if="guide.stage === 'story'">
        <div class="guide-story-summary">
          {{ guide.story.slice(0, 500) }}{{ guide.story.length > 500 ? '…' : '' }}
        </div>
        <button class="secondary-button" @click="fullStory = true">展开编辑剧情脚本</button>
        <button class="secondary-button" @click="guide.modify = true">修改剧情脚本</button>
        <button class="primary-button" @click="p.guideConfirmStory(guide)">
          确定剧情脚本，创建并保存文字节点，进入下一步
        </button>
      </template>
      <template v-else-if="guide.stage === 'storyboard'">
        <p>分镜草稿 · {{ guide.rows.length }} 个镜头，点击展开可编辑完整表格。</p>
        <div class="guide-compact-table">
          <table>
            <thead>
              <tr>
                <th>镜头</th>
                <th>时长</th>
                <th>画面</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in guide.rows.slice(0, 3)" :key="r.id">
                <td>{{ r.number }}</td>
                <td>{{ r.duration }}</td>
                <td>{{ r.visual.slice(0, 80) }}</td>
              </tr>
            </tbody>
          </table>
          <small v-if="guide.rows.length > 3"
            >另有{{ guide.rows.length - 3 }}个镜头，展开查看。</small
          >
        </div>
        <button class="secondary-button" @click="fullTable = true">展开分镜表并编辑</button>
        <button class="secondary-button" @click="guide.modify = true">修改分镜脚本</button>
        <button class="primary-button" @click="p.guideConfirmStoryboard(guide)">
          确定分镜脚本，创建并保存脚本节点，进入下一步
        </button>
      </template>
      <template v-else-if="guide.stage === 'prompts'">
        <p>检查素材名称、提示词及其适用镜头。无须生成的类别可取消勾选。</p>
        <article v-for="a in guide.prompts" :key="a.id" class="guide-plan">
          <label><input v-model="a.selected" type="checkbox" /> {{ a.type }}</label>
          <input v-model="a.name" aria-label="图片名称" />
          <textarea
            v-model="a.prompt"
            aria-label="素材提示词"
            @input="guide.syncDecision = true"
          ></textarea>
          <label v-for="r in guide.rows" :key="r.id" class="guide-check"
            ><input
              type="checkbox"
              :checked="a.rowIds.includes(r.id)"
              @change="toggleRow(a, r.id)"
            />镜头{{ r.number }}</label
          >
        </article>
        <div v-if="guide.syncDecision" class="guide-plan">
          <b>是否一键替换提示词？</b>
          <p>替换对应的剧情和分镜提示词；取消时仅作为生图参考。</p>
          <button class="primary-button" @click="p.guideSyncPrompts(guide, true)">确定替换</button
          ><button class="secondary-button" @click="p.guideSyncPrompts(guide, false)">
            取消替换
          </button>
        </div>
        <template v-else
          ><button class="primary-button" @click="p.guideImageConfig(guide, 'all')">
            生成全部图片</button
          ><button class="secondary-button" @click="p.guideImageConfig(guide, 'partial')">
            生成勾选的部分图片</button
          ><button class="secondary-button" @click="p.guideSkipImages(guide)">
            暂不生图
          </button></template
        >
      </template>
      <template v-else-if="guide.stage === 'image-config' || guide.stage === 'video-config'">
        <MediaParameters
          v-model="guide.params"
          :type="guide.stage === 'image-config' ? '图片' : '视频'"
          :connected="p.isConnected"
        />
        <div v-if="guide.stage === 'video-config'" class="guide-generation-images">
          <div v-for="r in guide.rows.filter(r => guide.selection.includes(r.id))" :key="r.id">
            <b
              >镜头{{ r.number }} ·
              {{ p.guideRowImages(guide, r.id).length ? '图生视频' : '文生视频' }}</b
            >
            <div>
              <ReferenceChip
                v-for="a in p.guideRowImages(guide, r.id)"
                :key="a.sourceNodeId || a.id"
                :asset="a"
                @remove="p.guideRemoveImage(guide, r.id, a)"
              />
            </div>
            <small>{{ p.guideRowImages(guide, r.id).length }}张图片，已去重，最多10张</small>
          </div>
        </div>
        <p>
          {{
            p.isConnected
              ? '点击生成将提交本批次请求，可能产生供应商费用。结果先预览，确认后才保存节点。'
              : '本地模拟结果用于交互预览，参数会保存到对应节点。'
          }}
        </p>
        <p v-if="p.isConnected" class="help-copy">
          图片模型最多3张参考图；视频最多10张参考图。当前视频适配器不支持音频文件参考，请将音效要求写入文字。
        </p>
        <button
          v-if="guide.stage === 'image-config'"
          class="primary-button"
          @click="p.guideGenerateImages(guide)"
        >
          生成图片预览
        </button>
        <button v-else class="primary-button" @click="p.guideGenerateVideos(guide)">
          生成选中镜头的视频预览
        </button>
      </template>
      <template v-else-if="guide.stage === 'image-preview' || guide.stage === 'video-preview'">
        <details
          v-if="
            p.isConnected &&
            guide.mediaHistory?.some(batch =>
              batch.some(a => a.type === (guide.stage === 'image-preview' ? '图片' : '视频'))
            )
          "
        >
          <summary>此前生成批次</summary>
          <template v-for="(batch, index) in guide.mediaHistory" :key="index"
            ><button
              v-if="
                batch.every(a => a.type === (guide.stage === 'image-preview' ? '图片' : '视频'))
              "
              class="secondary-button"
              @click="p.guideRestoreBatch(guide, index)"
            >
              恢复批次{{ index + 1 }}（{{ batch.length }}项）
            </button></template
          >
        </details>

        <article v-for="a in guide.preview" :key="a.outputKey || a.id" class="guide-plan">
          <b>{{ a.name }}</b
          ><small v-if="a.revision"> · 已修改{{ a.revision }}次</small>
          <video
            v-if="a.type === '视频'"
            :src="p.previewMedia(a)"
            controls
            preload="metadata"
          ></video>
          <MediaCover v-else-if="p.isConnected" :asset="a" /><ProductScene
            v-else
            :variant="a.scene"
          />
          <small>{{
            p.isConnected ? '供应商返回结果，请预览确认。' : '本地示例素材，仅演示预览交互。'
          }}</small>
          <details v-if="a.versions?.length">
            <summary>历史预览版本</summary>
            <button
              v-for="(version, index) in a.versions"
              :key="index"
              class="secondary-button"
              @click="p.guideRestoreVersion(guide, a, index)"
            >
              恢复版本{{ index + 1 }}
            </button>
          </details>
          <details>
            <summary>查看生成输入</summary>
            <p>{{ a.prompt }}</p>
          </details>
        </article>
        <button class="secondary-button" @click="guide.modify = true">
          {{ guide.stage === 'image-preview' ? '修改图片' : '调整视频内容' }}
        </button>
        <div v-if="p.isConnected && guide.failedMedia">
          <p>{{ guide.failedMedia }}项调用失败，成功结果已保留，不会自动重试。</p>
          <button class="secondary-button" @click="p.guideRetryMedia(guide)">仅重试失败项</button
          ><label v-if="guide.preview.length"
            ><input v-model="guide.allowPartial" type="checkbox" />仅采用成功结果，跳过失败项</label
          >
        </div>
        <button
          v-if="p.isConnected"
          class="secondary-button"
          @click="p.guideBackToParameters(guide)"
        >
          返回参数，新建生成批次
        </button>
        <button
          v-if="guide.stage === 'image-preview'"
          class="primary-button"
          :disabled="
            !guide.preview.length || (p.isConnected && guide.failedMedia && !guide.allowPartial)
          "
          @click="p.guideAcceptImages(guide)"
        >
          确定图片内容，创建并保存图片节点，进入下一步
        </button>
        <button
          v-else
          class="primary-button"
          :disabled="
            !guide.preview.length || (p.isConnected && guide.failedMedia && !guide.allowPartial)
          "
          @click="p.guideAcceptVideos(guide)"
        >
          确定视频内容，创建并保存视频节点
        </button>
      </template>
      <template v-else-if="guide.stage === 'video'">
        <button class="primary-button" @click="p.guidePickShots(guide)">
          选择部分镜头生成视频
        </button>
        <button class="secondary-button" @click="p.guideStop(guide)">暂不生成视频</button>
      </template>
      <template v-else-if="guide.stage === 'shots'">
        <p>选中{{ guide.selection.length }}个镜头</p>
        <button class="primary-button" @click="fullTable = true">选择镜头</button>
      </template>
      <div v-if="guide.modify" class="guide-plan">
        <label v-if="guide.stage.includes('preview')"
          >要修改的名称或镜头号<input v-model="guide.revisionTarget" placeholder="留空修改全部"
        /></label>
        <label
          >修改要求<textarea v-model="guide.revision" placeholder="描述希望调整的内容"></textarea>
        </label>
        <button class="primary-button" @click="p.guideRevise(guide, guide.revision)">
          按要求重新生成草稿
        </button>
        <button class="secondary-button" @click="guide.modify = false">取消修改</button>
      </div>
      <p v-if="guide.error" role="alert">{{ guide.error }}</p>
    </fieldset>
    <Teleport to="body">
      <section
        v-if="fullStory && active()"
        class="guide-small-bubble guide-story-bubble"
        :style="smallBubblePosition"
        role="dialog"
        :aria-modal="false"
        aria-label="编辑剧情脚本草稿"
      >
        <header>
          <h2>剧情脚本草稿</h2>
          <button class="secondary-button" @click="fullStory = false">返回</button>
        </header>
        <textarea
          v-model="guide.story"
          class="guide-expanded-story"
          aria-label="剧情脚本草稿"
        ></textarea>
        <footer>
          <span>仅编辑草稿，回到对话确认后才保存节点。</span
          ><button class="primary-button" @click="fullStory = false">保存草稿，返回确认</button>
        </footer>
      </section>
      <section
        v-if="fullTable && active()"
        :class="
          guide.stage === 'storyboard' ? 'guide-full-table' : 'guide-small-bubble guide-shot-picker'
        "
        :style="guide.stage === 'storyboard' ? undefined : smallBubblePosition"
        role="dialog"
        :aria-modal="guide.stage === 'storyboard'"
        aria-label="分镜脚本表格"
      >
        <header>
          <h2>{{ guide.stage === 'shots' ? '选择需要生成视频的镜头' : '编辑分镜脚本' }}</h2>
          <button class="secondary-button" @click="fullTable = false">返回</button>
        </header>
        <div class="guide-table-scroll">
          <table>
            <thead>
              <tr>
                <th v-if="guide.stage === 'shots'">选择</th>
                <th v-for="[key, label] in visibleColumns" :key="key">{{ label }}</th>
                <th>引用</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in guide.rows" :key="r.id">
                <td v-if="guide.stage === 'shots'">
                  <input
                    v-model="guide.selection"
                    type="checkbox"
                    :value="r.id"
                    :aria-label="'选择镜头' + r.number"
                  />
                </td>
                <td v-for="[key] in visibleColumns" :key="key">
                  <textarea
                    v-if="guide.stage === 'storyboard'"
                    v-model="r[key]"
                    v-fit-textarea
                    :aria-label="'镜头' + r.number + key"
                  ></textarea
                  ><span v-else>{{ r[key] }}</span>
                </td>
                <td>
                  {{
                    p
                      .rowImages(r.id)
                      .map(a => a.name)
                      .join('、') || '无'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer>
          <button
            v-if="guide.stage === 'shots'"
            class="primary-button"
            :disabled="!guide.selection.length"
            @click="
              $event => {
                p.guideVideoConfig(guide)
                fullTable = false
              }
            "
          >
            确定镜头，选择参数</button
          ><button v-else class="primary-button" @click="fullTable = false">
            保存草稿，返回确认
          </button>
        </footer>
      </section>
    </Teleport>
  </section>
</template>
<style>
.story-guide {
  margin-top: 12px;
  background: #211c29;
  padding: 12px;
  border: 1px solid #51415f;
  border-radius: 12px;
}
.story-guide fieldset {
  border: 0;
  margin: 10px 0 0;
  padding: 0;
  min-width: 0;
}
.story-guide label {
  display: block;
  margin: 9px 0;
  color: #cabbdb;
}
.story-guide input:not([type='checkbox']),
.story-guide select,
.story-guide textarea {
  box-sizing: border-box;
  width: 100%;
  background: #19171f;
  color: #ededf3;
  border: 1px solid #50435d;
  border-radius: 7px;
  padding: 8px;
  margin-top: 5px;
  font: inherit;
}
.story-guide textarea {
  min-height: 75px;
  resize: vertical;
}
.story-guide .guide-story {
  height: 400px;
  min-height: 200px;
  line-height: 1.8;
}
.story-guide button {
  margin: 5px 4px 5px 0;
  white-space: normal;
  line-height: 1.5;
  height: auto;
  min-height: 32px;
  padding: 7px 10px;
}
.guide-plan {
  border: 1px solid #46394f;
  border-radius: 8px;
  margin: 10px 0;
  padding: 10px;
}
.guide-plan p {
  font-size: 11px;
  white-space: pre-wrap;
}
.guide-plan video {
  width: 100%;
  margin-top: 8px;
}
.guide-plan > svg {
  width: 100%;
  height: 150px;
}
.guide-check {
  display: inline-block !important;
  margin-right: 8px !important;
}
.guide-field small {
  color: #b59bd6;
}
.guide-full-table {
  position: fixed;
  inset: 12px;
  z-index: 1500;
  background: #1e1926;
  color: #ededf3;
  border: 1px solid #6e5489;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-shadow: 0 10px 80px #000b;
}
.guide-full-table header,
.guide-full-table footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.guide-table-scroll {
  flex: 1;
  overflow: auto;
  margin: 20px 0;
}
.guide-full-table table {
  border-collapse: collapse;
  min-width: 1600px;
  width: 100%;
  font-size: 12px;
}
.guide-full-table td,
.guide-full-table th {
  border: 1px solid #51415f;
  padding: 5px 7px;
  min-width: 45px;
  white-space: pre-wrap;
}
.guide-full-table textarea {
  box-sizing: border-box;
  min-width: 120px;
  width: 100%;
  min-height: 30px;
  resize: none;
  overflow-y: hidden;
  font: inherit;
  line-height: 1.5;
  background: #26202e;
  color: #ededf3;
  border: 1px solid #655078;
  padding: 8px;
}
.guide-table-summary > div {
  border-bottom: 1px solid #46394f;
  padding: 8px 0;
}
</style>

<style>
.guide-inline-table {
  max-width: 100%;
  overflow: auto;
  margin: 12px 0;
  max-height: 360px;
}
.guide-inline-table table {
  border-collapse: collapse;
  width: 1500px;
  font-size: 11px;
}
.guide-inline-table td,
.guide-inline-table th {
  border: 1px solid #51415f;
  padding: 5px;
  min-width: 110px;
}
.guide-inline-table textarea {
  min-height: 100px;
  resize: vertical;
  margin: 0;
}
</style>

<style>
.guide-story-summary {
  white-space: pre-wrap;
  max-height: 210px;
  overflow: hidden;
  color: #cbbfda;
  margin: 10px 0;
}
.guide-compact-table {
  overflow: auto;
  margin: 10px 0;
}
.guide-compact-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.guide-compact-table td,
.guide-compact-table th {
  padding: 6px;
  border: 1px solid #47384f;
  text-align: left;
}
.guide-expanded-story {
  flex: 1;
  min-height: 0;
  margin: 18px 0;
  resize: none;
  background: #19171f;
  color: #ededf3;
  border: 1px solid #604e72;
  border-radius: 9px;
  padding: 16px;
  font: 14px/1.8 inherit;
}
.story-guide details summary {
  cursor: pointer;
  color: #c4a7e8;
}
.story-guide details p {
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
}
</style>

<style>
.guide-small-bubble {
  position: fixed;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(680px, calc(100vw - 32px));
  max-height: min(550px, calc(100vh - 32px));
  background: #261e30;
  color: #ededf3;
  border: 1px solid #84619d;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 14px 60px #0009;
}
.guide-small-bubble header,
.guide-small-bubble footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-shrink: 0;
}
.guide-small-bubble h2 {
  font-size: 16px;
  margin: 0;
}
.guide-small-bubble footer {
  font-size: 11px;
  color: #b6a4c5;
}
.guide-story-bubble .guide-expanded-story {
  height: 300px;
  min-height: 100px;
  flex: 0 1 300px;
  margin: 12px 0;
  padding: 10px;
  font-size: 12px;
  overflow: auto;
}
.guide-small-bubble .guide-table-scroll {
  flex: 0 1 auto;
  max-height: 380px;
  margin: 12px 0;
  overflow: auto;
}
.guide-small-bubble table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.guide-small-bubble td,
.guide-small-bubble th {
  padding: 6px;
  border: 1px solid #51415f;
  vertical-align: top;
  white-space: pre-wrap;
}
.guide-shot-picker td:nth-child(1) {
  width: 30px;
}
.guide-full-table td {
  vertical-align: top;
}
.guide-full-table td:nth-child(1),
.guide-full-table th:nth-child(1) {
  width: 55px;
}
.guide-full-table td:nth-child(2),
.guide-full-table th:nth-child(2) {
  width: 60px;
}
.guide-full-table td:nth-child(3),
.guide-full-table th:nth-child(3) {
  width: 75px;
}
.guide-full-table td:nth-child(1) textarea,
.guide-full-table td:nth-child(2) textarea,
.guide-full-table td:nth-child(3) textarea {
  min-width: 0;
}
</style>

<style>
.story-guide .guide-plan > .media-cover {
  height: 190px;
  border-radius: 8px;
  overflow: hidden;
  margin: 10px 0;
}
.story-guide .guide-plan > .media-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
