// UI-only workflow commands. No business transport or real model execution.
export function extendWorkflow(p, seedRows) {
  const s = p.state,
    copy = x => JSON.parse(JSON.stringify(x))
  let serial = 100,
    revision = 0
  Object.assign(s, {
    connections: [],
    viewport: { x: 0, y: 0, width: 850, height: 700 },
    modalRevision: 0,
    linkSource: null,
    projectId: 'project-summer',
    projects: [
      {
        id: 'project-summer',
        name: s.projectName,
        lastOpened: '2026-10-20T10:24:00',
        cover: 'amber'
      },
      {
        id: 'project-event',
        name: '品牌开放日 · 活动预热',
        lastOpened: '2026-10-19T16:38:00',
        cover: 'event'
      }
    ]
  })
  const params = n => {
    n.params ||= {
      quality: '标准',
      resolution: '1080P',
      background: '自动',
      count: 1,
      duration: '5秒',
      voice: '自然女声',
      format: 'MP3',
      volume: 80
    }
    return n.params
  }
  s.nodes.forEach(params)
  const snapshot = () =>
    copy({
      nodes: s.nodes,
      rows: s.rows,
      messages: s.messages,
      sessions: s.sessions,
      activeSession: s.activeSession,
      prompt: s.prompt,
      references: s.references,
      connections: s.connections,
      selectedRows: s.selectedRows
    })
  function saveProject() {
    const project = s.projects.find(x => x.id === s.projectId)
    if (project) {
      project.name = s.projectName
      project.workspace = snapshot()
      project.cover =
        s.nodes.find(n => n.type === '图片' && n.status === 'success')?.scene || project.cover
    }
  }
  function rowsFor(text) {
    revision++
    return seedRows.map((r, i) => ({
      ...r,
      id: 'shot-revision-' + revision + '-' + i,
      visual: text ? ['开场呈现：', '核心亮点：', '结尾定格：'][i] + text.slice(0, 150) : r.visual,
      imagePrompt: text
        ? '镜头' + (i + 1) + '，' + text.slice(0, 120) + '，' + r.imagePrompt
        : r.imagePrompt
    }))
  }
  function contents(n) {
    if (n.type === '文字') return n.text || n.prompt || ''
    if (n.type === '脚本') return s.rows.map(r => r.number + ' ' + r.visual).join('\n')
    return n.status === 'success' ? n.type + '生成结果 · 版本' + (n.version || 1) : ''
  }
  function materials(nodes = s.nodes, rows = s.rows) {
    const value = n =>
      n.type === '脚本' ? rows.map(r => r.number + ' ' + r.visual).join('\n') : contents(n)
    return nodes
      .filter(n => value(n))
      .map(n => ({
        id: 'canvas-' + n.id,
        sourceNodeId: n.id,
        name: n.name,
        type: n.type === '脚本' ? '文档' : n.type,
        text: value(n),
        scene: n.scene,
        version: n.version || 1
      }))
  }
  function canConnect(source, target) {
    if (source === target) return false
    const seen = new Set()
    function reaches(id) {
      if (id === source) return true
      if (seen.has(id)) return false
      seen.add(id)
      return s.connections.filter(c => c.source === id).some(c => reaches(c.target))
    }
    return !reaches(target)
  }
  const oldConfirm = p.confirm,
    oldRemove = p.removeReference
  Object.assign(p, {
    params,
    materials,
    saveProject,
    contents,
    openModal(type, data = {}) {
      s.modalData = data
      s.modalRevision++
      s.error = ''
      s.modal = type
    },
    go(page) {
      saveProject()
      s.page = page
      s.modal = null
      s.pendingRow = null
      s.linkSource = null
    },
    newProject(name) {
      if (s.readonly) {
        p.notify('当前为只读')
        return
      }
      saveProject()
      s.projectId = 'project-' + serial++
      s.projectName = name
      s.nodes = []
      s.rows = []
      s.connections = []
      s.messages = []
      s.sessions = ['灵感探索']
      s.activeSession = '灵感探索'
      s.prompt = ''
      s.references = []
      s.selectedRows = []
      s.tasks = []
      s.projects.unshift({
        id: s.projectId,
        name,
        lastOpened: new Date().toISOString(),
        cover: 'blank'
      })
      s.page = 'workspace'
      saveProject()
    },
    openProject(name) {
      saveProject()
      const project =
        s.projects.find(x => x.id === name || x.name === name) ||
        s.projects.find(x => x.id === s.projectId)
      if (!project) return
      s.projectId = project.id
      s.projectName = project.name
      project.lastOpened = new Date().toISOString()
      const workspace = project.workspace
      if (workspace) Object.assign(s, copy(workspace))
      else
        Object.assign(s, {
          nodes: [],
          rows: [],
          connections: [],
          messages: [],
          sessions: ['灵感探索'],
          activeSession: '灵感探索',
          prompt: '',
          references: [],
          selectedRows: []
        })
      s.tasks = []
      s.page = 'workspace'
      s.loading = false
      s.linkSource = null
    },
    addNode(type, rowId, position) {
      if (s.readonly) return p.notify('当前项目为只读')
      if (type === '脚本' && s.nodes.some(n => n.type === '脚本')) {
        p.notify('当前已有脚本节点')
        return
      }
      const i = s.nodes.length,
        id = type === '脚本' ? 'script' : 'node-' + serial++
      let spawn = position
      if (!spawn) {
        const width = type === '脚本' ? 1046 : 320,
          height = type === '脚本' ? 800 : 470
        for (let slot = 0; slot < 150; slot++) {
          const x = Math.max(30, s.viewport.x + 50 + (slot % 4) * 370),
            y = Math.max(30, s.viewport.y + 50 + Math.floor(slot / 4) * 510)
          if (
            !s.nodes.some(
              other =>
                x < other.x + (other.type === '脚本' ? other.width || 1046 : 320) + 35 &&
                x + width + 35 > other.x &&
                y < other.y + (other.type === '脚本' ? 800 : 470) + 35 &&
                y + height + 35 > other.y
            )
          ) {
            spawn = { x, y }
            break
          }
        }
      }
      const n = {
        id,
        type,
        name: type + '节点 ' + serial++,
        x: Math.max(30, spawn?.x ?? s.viewport.x + 50 + (i % 3) * 45),
        y: Math.max(30, spawn?.y ?? s.viewport.y + 50 + (i % 3) * 55),
        rowId,
        prompt: '',
        text: '',
        status: 'idle',
        scene: 'amber',
        refs: [],
        ratio: '16:9',
        mode: '图生视频',
        imageConfirmed: false
      }
      params(n)
      s.nodes.push(n)
      s.selectedNode = id
      s.pendingRow = null
      return id
    },
    connectNodes(source, target) {
      if (s.readonly) return false
      if (!s.nodes.some(n => n.id === source) || !s.nodes.some(n => n.id === target)) return false
      if (!canConnect(source, target)) {
        p.notify('不能连接自己或形成循环引用')
        return false
      }
      if (s.connections.some(c => c.source === source && c.target === target)) return true
      s.connections.push({ id: 'edge-' + serial++, source, target })
      p.notify('已连接，并自动引用上游内容')
      s.linkSource = null
      return true
    },
    removeConnection(id) {
      if (s.readonly) return
      s.connections = s.connections.filter(c => c.id !== id)
    },
    upstream(n) {
      return s.connections
        .filter(c => c.target === n.id)
        .map(c => {
          const source = s.nodes.find(x => x.id === c.source)
          return source
            ? {
                ...c,
                name: source.name,
                type: source.type,
                text: contents(source),
                version: source.version || 1,
                scene: source.scene
              }
            : null
        })
        .filter(Boolean)
    },
    referenceText(n) {
      const row = p.row(n.rowId)
      const lines = row
        ? [
            'number',
            'duration',
            'scale',
            'camera',
            'visual',
            'sound',
            'emotion',
            'environment',
            'imagePrompt',
            'motionPrompt'
          ].map((key, i) => s.columns[i] + '：' + (row[key] || '—'))
        : []
      return [...lines, ...p.upstream(n).map(x => x.name + '：' + x.text)].join('\n')
    },
    generateScript() {
      if (s.readonly) return
      const upstream = s.nodes
        .filter(n => n.type === '脚本')
        .flatMap(n => p.upstream(n))
        .map(x => x.text)
        .join('\n')
      const text = s.prompt.trim() || upstream
      if (!text && !s.references.length) {
        s.error = '文字和有效参考均为空，无法生成分镜'
        return
      }
      if (s.rows.length) {
        p.openModal('confirm', {
          title: '重新生成分镜表？',
          description: '采用当前输入重新生成，解除旧镜头行引用；保留下游节点和已有结果。',
          action: 'script',
          scriptText: text
        })
        return
      }
      p.performScript(text)
    },
    performScript(text = s.prompt) {
      s.nodes.filter(n => n.rowId).forEach(n => (n.rowId = null))
      s.rows = rowsFor(text)
      s.selectedRows = []
      s.scriptRevision = revision
      p.closeModal()
      p.notify('已生成第 ' + revision + ' 版分镜（模拟内容）')
    },
    confirm() {
      const d = s.modalData
      if (s.readonly) return
      if (d?.action === 'script') {
        p.performScript(d.scriptText)
        return
      }
      if (d?.action === 'delete-node')
        s.connections = s.connections.filter(c => c.source !== d.id && c.target !== d.id)
      oldConfirm()
    },
    applyAsset(a, nodeId) {
      if (s.readonly) return
      const n = s.nodes.find(x => x.id === nodeId)
      if (!n) return
      if (a.sourceNodeId) {
        if (p.connectNodes(a.sourceNodeId, nodeId)) p.closeModal()
        return
      }
      if (a.type === '提示词') {
        if (n.prompt.trim()) {
          p.openModal('confirm', {
            title: '替换当前提示词？',
            description: '只替换提示词文本，保留模型和参数。',
            action: 'apply',
            nodeId,
            text: a.text
          })
          return
        }
        n.prompt = a.text
      } else {
        n.refs ||= []
        if (!n.refs.includes(a.name)) n.refs.push(a.name)
      }
      p.closeModal()
    },
    requestGenerate(id) {
      const n = s.nodes.find(x => x.id === id)
      if (!n || s.readonly) return
      const up = p.upstream(n)
      if (n.type === '视频' && n.mode === '图生视频' && !n.imageConfirmed) {
        p.notify('请先选择并确认图片版本')
        return
      }
      if (!n.prompt?.trim() && !n.rowId && !n.refs?.length && !up.some(x => x.text)) {
        p.notify('请输入提示词或引用已就绪内容')
        return
      }
      const cfg = params(n)
      p.openModal('confirm', {
        title: '确认本次生成',
        description:
          n.name +
          ' · ' +
          (n.type === '视频'
            ? '万相 3.0'
            : n.type === '音频'
              ? 'Seed Audio1.0'
              : '千问图像生成 3.0 Pro') +
          ' · ' +
          (n.type === '音频'
            ? cfg.voice + ' / ' + cfg.format
            : n.ratio + ' / ' + cfg.quality + ' / ' + cfg.resolution) +
          ' · ' +
          cfg.count +
          '份。当前为模拟生成。',
        action: 'generate',
        nodeId: id
      })
    },
    runGeneration(id) {
      const n = s.nodes.find(x => x.id === id)
      if (!n) return
      n.inputSnapshot = copy({
        prompt: n.prompt,
        references: p.referenceText(n),
        params: params(n),
        refs: n.refs
      })
      n.status = 'running'
      const task = { id: 'task-' + serial++, name: n.name, status: '生成中' }
      s.tasks.unshift(task)
      setTimeout(() => {
        n.status = 'success'
        n.version = (n.version || 0) + 1
        n.stale = false
        task.status = '已完成'
        p.notify('生成完成 · 版本' + n.version + '（模拟结果）')
      }, 700)
    },
    referenceImage(id) {
      p.openModal('reference', {
        for: 'node',
        node: s.nodes.find(n => n.id === id),
        confirmImage: true
      })
    },
    buildWorkflow(text, initial = false) {
      if (s.readonly) return
      const x = s.viewport.x + 40,
        y = s.viewport.y + 40
      const created = []
      let cursorX = x
      const ensure = (type, px, py) => {
        const id = p.addNode(type, undefined, { x: px, y: py })
        if (id) created.push(id)
        return id
      }
      if (/整理|排版|布局|编排/.test(text) && s.nodes.length) {
        let cursor = x
        s.nodes.forEach(n => {
          n.x = cursor
          n.y = y
          cursor += n.type === '脚本' ? 1140 : 410
        })
        s.messages.push({
          role: 'assistant',
          text: '已整理当前画布布局，保留节点内容与连接。',
          tool: '移动 ' + s.nodes.length + ' 个节点 · 场景演示'
        })
        s.autoFit = true
        return
      }
      const specific = /图片|视频|音频|配音|音乐|文字|文本|脚本|分镜/.test(text)
      const types =
        initial || !specific
          ? ['文字', '脚本', '图片', '视频', ...(/音频|配音|音乐/.test(text) ? ['音频'] : [])]
          : [
              ...(/文字|文本/.test(text) ? ['文字'] : []),
              ...(/脚本|分镜/.test(text) ? ['脚本'] : []),
              ...(/图片/.test(text) ? ['图片'] : []),
              ...(/视频/.test(text) ? ['图片', '视频'] : []),
              ...(/音频|配音|音乐/.test(text) ? ['音频'] : [])
            ]
      let previous
      ;[...new Set(types)].forEach((type, i) => {
        let id
        if (type === '脚本' && s.nodes.some(n => n.type === '脚本'))
          id = s.nodes.find(n => n.type === '脚本').id
        else id = ensure(type, cursorX, y)
        if (!id) return
        cursorX += type === '脚本' ? 1140 : 410
        const n = s.nodes.find(n => n.id === id)
        n.prompt = text
        if (type === '文字') n.text = text
        if (type === '脚本' && !s.rows.length) s.rows = rowsFor(text)
        if (previous) p.connectNodes(previous, id)
        previous = id
      })
      s.messages.push({
        role: 'assistant',
        text: '已根据你的需求创建节点并连接上游参考。你可以继续输入要求来补充节点或整理画布。图片、视频和音频生成仍需单独确认。',
        tool: '创建 ' + created.length + ' 个节点 · 已连接参考 · 场景演示'
      })
      s.selectedNode = created.at(-1)
      s.autoFit = true
    },
    start() {
      const text = s.prompt.trim()
      const refs = copy(s.references)
      if (!text && !refs.length) {
        s.error = '请输入创作需求，或先引用参考内容'
        return
      }
      if (s.readonly) return
      p.newProject((text || '参考素材创作').slice(0, 18))
      s.prompt = text
      s.references = refs
      s.messages = [{ role: 'user', text: text || '根据参考内容创作' }]
      p.buildWorkflow(text || '按参考内容制作产品视频', true)
      s.error = ''
    },
    sendAgent() {
      const text = s.agentText.trim()
      if (!text || s.busy || s.readonly) return
      s.messages.push({ role: 'user', text })
      s.agentText = ''
      s.busy = true
      setTimeout(() => {
        p.buildWorkflow(text)
        s.busy = false
      }, 400)
    },
    removeReference(id, index) {
      oldRemove(id, index)
    }
  })
  if (s.scenario === 'empty') s.projects = []
  if (s.projects[0]) s.projects[0].workspace = snapshot()
}
