// 隔离预览使用同源独立地址，正式构建通过 mode 固定端身份。
export const isPlatformPortal = Boolean(import.meta.env.VITE_PLATFORM_PORTAL) || import.meta.env.MODE === "scenario" && location.pathname.startsWith("/platform/");
export const portalHome = isPlatformPortal ? "/admin" : "/home";
export const portalName = isPlatformPortal ? "平台端" : "用户端";
export function acceptsPortalRole(role: string) { return isPlatformPortal ? role === "platformAdmin" : role === "user"; }
