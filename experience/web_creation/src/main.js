import { createApp } from 'vue'
import App from './App.vue'
import { installComposition } from '@fe-composition'
import './styles/tokens.css'
import './styles/creation.css'
const app=createApp(App)
installComposition({app})
app.mount('#app')
