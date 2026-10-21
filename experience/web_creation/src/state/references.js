export function extendReferences(p) {
  const s = p.state
  s.columns = [...s.columns.slice(0, 10), '引用']
  s.editorOpen = false
  const rawRequest = p.requestGenerate
  const rawOpen = p.openModal,
    rawConnect = p.connectNodes,
    rawRemove = p.removeConnection,
    rawPerform = p.performScript,
    rawConfirm = p.confirm
  const copy = x => JSON.parse(JSON.stringify(x))
  function nodeMaterial(n) {
    return {
      ...(p.materials([n])[0] || {
        id: 'canvas-' + n.id,
        sourceNodeId: n.id,
        name: n.name,
        type: n.type,
        scene: n.scene,
        version: n.version || 1,
        pending: true
      }),
      outputIndex: n.outputIndex || 0
    }
  }
  function ids(n) {
    return [...new Set([...(n.rowRefs || []), ...(n.rowId ? [n.rowId] : [])])].filter(id =>
      p.row(id)
    )
  }
  Object.assign(p, {
    openModal(type, data = {}) {
      if (type === 'script-editor') {
        s.editorOpen = true
        s.modal = null
        return
      }
      return rawOpen(type, data)
    },
    requestGenerate(id) {
      const n = s.nodes.find(n => n.id === id)
      if (n?.type === '视频' && n.mode !== '文生视频') {
        if (!n.imageConfirmed) {
          p.notify('请先选择并确认图片')
          return
        }
        n.mode = n.confirmedImages?.length > 1 ? '参考图生视频' : '图生视频'
      }
      return rawRequest(id)
    },
    rowIds: ids,
    connect(rowId, nodeId) {
      if (s.readonly || !p.row(rowId)) return false
      const n = s.nodes.find(n => n.id === nodeId)
      if (!n || n.type === '脚本') return false
      n.rowRefs = [...new Set([...ids(n), rowId])]
      n.rowId = n.rowRefs[0]
      n.excludedRowMedia = (n.excludedRowMedia || []).filter(
        key => !key.startsWith('row-media:' + rowId + ':')
      )
      p.notify('已引用镜头 ' + p.row(rowId).number)
      return true
    },
    disconnectRow(nodeId, rowId) {
      if (s.readonly) return
      const n = s.nodes.find(n => n.id === nodeId)
      if (!n) return
      n.rowRefs = rowId ? ids(n).filter(id => id !== rowId) : []
      n.rowId = n.rowRefs[0] || null
    },
    removeRow(id) {
      if (s.readonly) return
      s.rows = s.rows.filter(r => r.id !== id)
      for (const n of s.nodes) {
        n.rowRefs = [...(n.rowRefs || []), ...(n.rowId ? [n.rowId] : [])].filter(
          r => r !== id && p.row(r)
        )
        n.rowId = n.rowRefs[0] || null
      }
      for (const c of s.connections) if (c.rowIds) c.rowIds = c.rowIds.filter(r => r !== id)
      s.selectedRows = s.selectedRows.filter(r => r !== id)
    },
    rowImages(rowId) {
      const script = s.nodes.find(n => n.type === '脚本')
      const linked = s.connections
        .filter(c => c.target === script?.id && c.rowIds?.includes(rowId))
        .map(c => {
          const n = s.nodes.find(n => n.id === c.source)
          return n ? { ...nodeMaterial(n), rowId, bindingId: c.id, kind: 'row-image' } : null
        })
        .filter(Boolean)
      return [
        ...linked,
        ...(p.row(rowId)?.imageRefs || []).map(a => ({ ...a, rowId, kind: 'row-image' }))
      ]
    },
    removeRowImage(rowId, asset) {
      if (s.readonly) return
      if (asset.bindingId) {
        p.removeConnection(asset.bindingId, rowId)
        return
      }
      const row = p.row(rowId)
      if (row) row.imageRefs = (row.imageRefs || []).filter(a => a.id !== asset.id)
    },
    assignImageToRows(asset, rowIds, targetId) {
      if (s.readonly) return false
      if (asset.type !== '图片') {
        s.error = '分镜引用列仅支持图片'
        return false
      }
      const script =
        s.nodes.find(n => n.id === targetId && n.type === '脚本') ||
        s.nodes.find(n => n.type === '脚本')
      if (!script) return false
      const selected = [...new Set(rowIds)].filter(id => p.row(id))
      if (s.rows.length && !selected.length) {
        s.error = '请至少选择一个镜头'
        return false
      }
      if (asset.sourceNodeId) {
        if (!rawConnect(asset.sourceNodeId, script.id)) return false
        const connection = s.connections.find(
          c => c.source === asset.sourceNodeId && c.target === script.id
        )
        connection.rowIds = selected
      } else {
        script.assetRefs ||= []
        if (!script.assetRefs.some(a => a.id === asset.id)) script.assetRefs.push(copy(asset))
        for (const row of s.rows) {
          row.imageRefs = (row.imageRefs || []).filter(a => a.id !== asset.id)
          if (selected.includes(row.id)) row.imageRefs.push(copy(asset))
        }
      }
      p.notify('图片已应用到 ' + selected.length + ' 个镜头')
      return true
    },
    connectNodes(source, target, options = {}) {
      const a = s.nodes.find(n => n.id === source),
        b = s.nodes.find(n => n.id === target)
      if (a?.type === '图片' && b?.type === '脚本' && !options.direct) {
        const existing = s.connections.find(c => c.source === source && c.target === target)
        p.openModal('row-assignment', {
          asset: nodeMaterial(a),
          targetId: target,
          rowIds: existing?.rowIds || []
        })
        return false
      }
      return rawConnect(source, target)
    },
    connectToRow(source, rowId) {
      if (s.readonly || !p.row(rowId)) return false
      const node = s.nodes.find(n => n.id === source),
        script = s.nodes.find(n => n.type === '脚本')
      if (!node || node.type === '脚本' || !script) return false
      if (!rawConnect(source, script.id)) return false
      const connection = s.connections.find(c => c.source === source && c.target === script.id)
      connection.rowIds = [...new Set([...(connection.rowIds || []), rowId])]
      p.notify('已连接上游到镜头 ' + p.row(rowId).number)
      return true
    },
    connectImageToRow(source, rowId) {
      const n = s.nodes.find(n => n.id === source)
      if (n?.type !== '图片') {
        p.notify('分镜行的引用入口支持图片节点')
        return false
      }
      const script = s.nodes.find(n => n.type === '脚本')
      const existing = s.connections.find(c => c.source === source && c.target === script?.id)
      return p.assignImageToRows(nodeMaterial(n), [...(existing?.rowIds || []), rowId], script?.id)
    },
    removeConnection(id, rowId) {
      const c = s.connections.find(c => c.id === id)
      if (c?.rowIds && rowId) {
        c.rowIds = c.rowIds.filter(r => r !== rowId)
        if (c.rowIds.length) return
      }
      const n = s.nodes.find(n => n.id === c?.target),
        before = n?.confirmedImages?.length,
        remaining = n?.confirmedImages?.filter(a => a.sourceNodeId !== c?.source)
      rawRemove(id)
      if (n && before) {
        n.confirmedImages = remaining
        n.confirmedImage = remaining[0] || null
        n.imageConfirmed = remaining.length > 0
        if (n.mode !== '文生视频') n.mode = remaining.length > 1 ? '参考图生视频' : '图生视频'
      }
    },
    attachReference(asset, nodeId) {
      if (s.readonly) return false
      const n = s.nodes.find(n => n.id === nodeId)
      if (!n) return false
      if (asset.kind === 'row') return p.connect(asset.rowId, nodeId)
      if (asset.key && p.inputReferences(n).some(a => a.key === asset.key)) return true
      if (n.type === '脚本' && asset.type === '图片') {
        const existing = asset.sourceNodeId
          ? s.connections.find(c => c.source === asset.sourceNodeId && c.target === nodeId)
          : null
        p.openModal('row-assignment', {
          asset,
          targetId: nodeId,
          rowIds:
            existing?.rowIds ||
            s.rows.filter(r => r.imageRefs?.some(a => a.id === asset.id)).map(r => r.id)
        })
        return true
      }
      if (asset.sourceNodeId) return p.connectNodes(asset.sourceNodeId, nodeId)
      n.assetRefs ||= []
      if (!n.assetRefs.some(a => a.id === asset.id)) n.assetRefs.push(copy(asset))
      p.notify('已引用 ' + asset.name)
      return true
    },
    inputReferences(n) {
      const result = []
      for (const rowId of ids(n)) {
        const row = p.row(rowId)
        result.push({
          id: 'row:' + rowId,
          key: 'row:' + rowId,
          name: '镜头 ' + row.number,
          type: '文档',
          text: p.rowText(row),
          rowId,
          kind: 'row'
        })
        for (const a of p.rowImages(rowId)) {
          const key = 'row-media:' + rowId + ':' + a.id
          if (!n.excludedRowMedia?.includes(key))
            result.push({ ...a, key, kind: 'row-media', name: a.name })
        }
      }
      for (const c of s.connections.filter(c => c.target === n.id)) {
        const source = s.nodes.find(x => x.id === c.source)
        if (source) {
          const confirmed = n.imageConfirmed
            ? n.confirmedImages?.find(a => a.sourceNodeId === source.id)
            : null
          result.push({
            ...nodeMaterial(source),
            ...confirmed,
            key: 'edge:' + c.id,
            bindingId: c.id,
            kind: 'upstream'
          })
        }
      }
      for (const a of n.confirmedImages || [])
        if (n.imageConfirmed && !a.sourceNodeId)
          result.push({ ...a, key: 'confirmed:' + a.id, kind: 'confirmed' })
      for (const a of n.assetRefs || []) result.push({ ...a, key: 'asset:' + a.id, kind: 'asset' })
      for (const [i, name] of (n.refs || []).entries()) {
        if (result.some(a => a.name === name)) continue
        result.push({
          ...s.assets.find(a => a.name === name),
          id: 'legacy-' + i,
          key: 'legacy:' + i,
          name,
          type: s.assets.find(a => a.name === name)?.type || '文档',
          kind: 'legacy',
          index: i
        })
      }
      return result
    },
    rowText(row) {
      return [
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
      ]
        .map((key, i) => s.columns[i] + '：' + (row[key] || '—'))
        .join('\n')
    },
    referenceText(n) {
      if (!n) return ''
      return p
        .inputReferences(n)
        .map(a =>
          a.kind === 'row'
            ? a.text
            : a.text
              ? a.name + '：' + a.text
              : a.name + '（' + a.type + '参考）'
        )
        .join('\n')
    },
    removeInputReference(nodeId, asset) {
      if (s.readonly) return
      const n = s.nodes.find(n => n.id === nodeId)
      if (!n) return
      if (asset.kind === 'row') p.disconnectRow(nodeId, asset.rowId)
      else if (asset.kind === 'row-media') {
        n.excludedRowMedia ||= []
        n.excludedRowMedia.push(asset.key)
      } else if (asset.kind === 'upstream') p.removeConnection(asset.bindingId)
      else if (asset.kind === 'confirmed') {
        n.confirmedImages = n.confirmedImages.filter(a => a.id !== asset.id)
        n.confirmedImage = n.confirmedImages[0] || null
        n.imageConfirmed = n.confirmedImages.length > 0
        if (n.mode !== '文生视频')
          n.mode = n.confirmedImages.length > 1 ? '参考图生视频' : '图生视频'
      } else if (asset.kind === 'asset')
        n.assetRefs = (n.assetRefs || []).filter(a => a.id !== asset.id)
      else p.removeReference(nodeId, asset.index)
    },
    confirmImages(nodeId, assets) {
      if (s.readonly) return false
      const n = s.nodes.find(n => n.id === nodeId)
      if (!n || !assets.length || assets.length > 10 || assets.some(a => a.type !== '图片')) {
        s.error = '请选择1到10张图片'
        return false
      }
      for (const a of assets)
        if (a.sourceNodeId) {
          if (a.sourceNodeId === nodeId) {
            s.error = '不能引用节点自身'
            return false
          }
        }
      const previous = s.connections.map(c => ({ ...c }))
      for (const a of assets) {
        if (a.sourceNodeId && !rawConnect(a.sourceNodeId, nodeId)) {
          s.connections = previous
          return false
        }
      }
      n.confirmedImages = copy(
        assets.map(a => ({ ...a, outputs: a.outputs, outputIndex: a.outputIndex || 0 }))
      )
      n.confirmedImage = n.confirmedImages[0]
      n.imageConfirmed = true
      n.mode = assets.length > 1 ? '参考图生视频' : '图生视频'
      p.notify('已确认 ' + assets.length + ' 张图片 · ' + n.mode)
      return true
    },
    performScript(text = s.prompt) {
      const before = s.rows
      const result = rawPerform(text)
      if (s.rows !== before) {
        for (const n of s.nodes) {
          n.rowRefs = []
          if (n.type === '脚本') n.version = s.scriptRevision || 1
        }
        for (const c of s.connections) if (c.rowIds) c.rowIds = []
      }
      return result
    },
    confirm() {
      if (s.modalData?.action === 'delete-row') {
        p.removeRow(s.modalData.id)
        p.closeModal()
        return
      }
      return rawConfirm()
    }
  })
}
