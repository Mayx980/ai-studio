import {describe,it,expect,vi,afterEach} from 'vitest'
import {createScenario} from './creation'
afterEach(()=>vi.useRealTimers())
describe('创作流程约束',()=>{
 it('无输入无参考阻止生成，有参考允许空输入',()=>{const p=createScenario('empty');p.generateScript();expect(p.state.rows).toHaveLength(0);expect(p.state.error).toContain('均为空');p.state.references.push({id:'ref',name:'产品文档'});p.generateScript();expect(p.state.rows).toHaveLength(3)})
 it('同一行可连接多节点，排序和改编号不改变关联',()=>{const p=createScenario();const id=p.addNode('图片','shot-a');p.moveRow('shot-a',1);p.editRow('shot-a','number','99');expect(p.state.nodes.filter(n=>n.rowId==='shot-a')).toHaveLength(3);expect(p.row(p.state.nodes.find(n=>n.id===id).rowId).number).toBe('99')})
 it('删除镜头需确认，保留下游节点与结果',()=>{const p=createScenario();p.deleteRow('shot-a');expect(p.row('shot-a')).toBeTruthy();p.confirm();expect(p.row('shot-a')).toBeUndefined();expect(p.state.nodes.find(n=>n.id==='image-1')).toMatchObject({status:'success',rowId:null})})
 it('图生视频先确认图片，文生视频不要求图片',()=>{const p=createScenario();p.requestGenerate('video-1');expect(p.state.modal).toBeNull();p.setNode('video-1','mode','文生视频');p.requestGenerate('video-1');expect(p.state.modalData.action).toBe('generate')})
 it('提示词覆盖须确认且不改变模型参数与参考',()=>{const p=createScenario();p.setNode('image-1','prompt','原提示词');p.applyAsset(p.state.assets[1],'image-1');expect(p.state.nodes[1].prompt).toBe('原提示词');p.confirm();expect(p.state.nodes[1]).toMatchObject({ratio:'16:9',refs:['产品参考图'],prompt:p.state.assets[1].text})})
 it('保存独立快照，空名称和只读不可写',()=>{const p=createScenario();p.saveAsset({name:'',type:'提示词',text:'hi',category:'风格',tags:[]});expect(p.state.assets).toHaveLength(3);const d={name:'视觉风格',type:'提示词',text:'晨光',category:'风格',tags:['场景','风格']};p.saveAsset(d);d.tags.push('角色');expect(p.state.assets[0].tags).toHaveLength(2);const ro=createScenario('permission');ro.saveAsset(d);expect(ro.state.assets).toHaveLength(3)})
 it('会话切换恢复各自历史',()=>{const p=createScenario();p.newSession();expect(p.state.messages).toHaveLength(0);p.switchSession('灵感探索');expect(p.state.messages).toHaveLength(2)})
})
