<script setup>
import {useCreation} from '../ports/creation'
import {scenarios} from '../scenarios/catalog'
const p=useCreation()
</script><template><div class="scenario-bar"><b>交互状态</b><button v-for="v in scenarios" :key="v" @click="p.changeScenario(v)">{{v}}</button><button @click="p.state.page='home'">首页</button><button @click="p.state.page='workspace'">画布</button><button @click="p.state.page='assets'">资产</button></div></template>