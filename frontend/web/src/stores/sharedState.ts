import { studio } from "@/ports";
import { nextTick } from "vue";
import { ElMessage } from "element-plus";
import { accountsRequired, currentUser } from "./accounts";

export const sharedStoreKeys = ["toonflow.projectList", "aiStudio.assetTags"];
type SharedState = { revision: string; stores: Record<string, unknown> };
let stores: Record<string, unknown> = {};
let revision = "";
let loaded = false;
let saving = Promise.resolve();
let lastSave = Promise.resolve();
let failure: Error | undefined;
let pending = 0;

function readState(value: unknown): SharedState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("服务端未返回有效创作索引");
  const state = value as Partial<SharedState>;
  if (typeof state.revision !== "string" || !/^[a-f0-9]{64}$/.test(state.revision)
    || !state.stores || typeof state.stores !== "object" || Array.isArray(state.stores)
    || Object.keys(state.stores).some(key => !sharedStoreKeys.includes(key))) throw new Error("服务端创作索引格式无效");
  return { revision: state.revision, stores: state.stores };
}

export async function loadSharedState() {
  if (loaded) return;
  const { data } = await studio.loadCreationState<{ code: number; data: unknown }>({ headers: { "x-toonflow-workspace": "1", "Cache-Control": "no-cache" } });
  if (data.code !== 200) throw new Error("读取共享创作索引失败");
  const state = readState(data.data);
  stores = state.stores;
  revision = state.revision;
  loaded = true;
}

export const sharedStorage = {
  getItem(key: string) {
    if (!loaded) throw new Error("共享创作索引尚未加载");
    if (accountsRequired.value && key === "toonflow.projectList") {
      const state = Object.hasOwn(stores, key) ? stores[key] : {};
      const view = sessionStorage.getItem(`afxenProjectView.${currentUser.value!.id}`);
      return JSON.stringify({ ...(state as object), ...(view ? JSON.parse(view) : { project: null, lastSimpleDirectory: "" }) });
    }
    return Object.hasOwn(stores, key) ? JSON.stringify(stores[key]) : null;
  },
  setItem(key: string, value: string) {
    if (!loaded || !sharedStoreKeys.includes(key)) throw new Error("共享存储键无效或尚未加载");
    const next = JSON.parse(value);
    if (accountsRequired.value && key === "toonflow.projectList") {
      sessionStorage.setItem(`afxenProjectView.${currentUser.value!.id}`, JSON.stringify({ project: next.project ?? null, lastSimpleDirectory: next.lastSimpleDirectory ?? "" }));
      delete next.project;
      delete next.lastSimpleDirectory;
    }
    if (Object.hasOwn(stores, key) && JSON.stringify(stores[key]) === JSON.stringify(next)) return;
    stores = { ...stores, [key]: next };
    const requested = structuredClone(stores);
    pending++;
    lastSave = saving.then(async () => {
      if (failure) throw failure;
      const { data } = await studio.saveCreationState<{ code: number; data: unknown }>({ revision, stores: requested }, { headers: { "x-toonflow-workspace": "1" } });
      if (data.code !== 200) throw new Error("共享创作索引保存失败");
      revision = readState(data.data).revision;
    }).finally(() => { pending--; });
    saving = lastSave.catch(cause => {
      if (failure) return;
      failure = cause instanceof Error ? cause : new Error("共享创作索引保存失败");
      ElMessage({ type: "error", message: `${failure.message}。未保存内容保留在当前页面，请先保留内容再刷新`, duration: 0, showClose: true });
    });
  },
};

export async function flushSharedState() {
  await nextTick();
  await lastSave;
  if (failure) throw failure;
}

window.addEventListener("beforeunload", event => {
  if (pending || failure) event.preventDefault();
});
