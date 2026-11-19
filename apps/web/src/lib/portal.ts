// ACT: 本轮仅补充双端 UIUX；独立路径用于本地预览，platform 构建固定平台端。
export const isPlatformPortal = Boolean(import.meta.env.VITE_PLATFORM_PORTAL) || import.meta.env.DEV && location.pathname.startsWith("/platform/");
export const portalHome = isPlatformPortal ? "/admin" : "/home";
export const portalName = isPlatformPortal ? "平台端" : "用户端";
export function acceptsPortalRole(role: string) { return isPlatformPortal ? role === "platformAdmin" : role === "user"; }
