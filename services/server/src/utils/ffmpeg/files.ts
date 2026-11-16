import { mkdtemp, readFile, writeAtomic, rm, lstat } from "@toonflow/file";
import { extname, join, relative } from "node:path";
import type { FfmpegFactory, FfmpegCommand } from "@toonflow/ffmpeg";
import { chainMethods, queryMethods } from "@toonflow/ffmpeg/remote";
import { lockWorkspaceFiles, readWorkspaceFile, resolveWorkspacePath, statWorkspaceFile, writeWorkspaceFile } from "@/utils/workspace/files";
import { maxMediaBytes, validateMedia } from "@/utils/mediaStorage";

type Command = FfmpegCommand & { _inputs: { source: string }[]; _outputs: { target?: string }[] };
const methods = new Set<string>([...chainMethods, ...queryMethods, "run", "save", "saveToFile", "kill", "on", "once", "addListener", "off", "removeListener", "removeAllListeners"]);
const simpleMethods = new Set(["input", "addInput", "mergeAdd", "output", "addOutput", "save", "saveToFile", "seekInput", "seek", "seekOutput", "duration", "frames", "audioCodec", "videoCodec", "audioBitrate", "audioChannels", "audioFrequency", "format", "fps", "size", "noAudio", "noVideo"]);
function invalid(): never { throw Object.assign(new Error("多用户媒体处理只接受受控路径、编码参数和已有剪辑滤镜；不开放任意FFmpeg参数或间接文件输入"), { status: 400 }); }

function validateCall(method: string, args: unknown[]) {
  if (!methods.has(method)) invalid();
  if (["on", "once", "addListener", "off", "removeListener", "removeAllListeners", "run", "kill"].includes(method)) return;
  if (queryMethods.includes(method as typeof queryMethods[number])) {
    const options = args.filter(value => typeof value !== "function");
    if (method === "ffprobe" && options.length && !(options.length === 1 && Array.isArray(options[0])
      && options[0].every(value => value === "-count_frames" || value === "-count_packets"))) invalid();
    if (method !== "ffprobe" && options.length) invalid();
    return;
  }
  if (simpleMethods.has(method)) {
    if (args.some(value => typeof value !== "string" && typeof value !== "number" || typeof value === "number" && !Number.isFinite(value))) invalid();
    if (["audioCodec", "videoCodec", "format"].includes(method) && !/^(?:aac|libx264|libx265|libmp3lame|libopus|pcm_s16le|copy|mp4|ipod|mp3|wav|ogg|webm|image2|png|mjpeg)$/.test(String(args[0]))) invalid();
    return;
  }
  const values = args.flat();
  if (method === "outputOptions") {
    const pairs: Record<string, RegExp> = { "-map": /^(?:0:(?:a:0\??|\d+)|\[result\])$/, "-movflags": /^\+faststart$/, "-preset": /^(fast|medium|slow)$/, "-crf": /^\d{1,2}$/, "-pix_fmt": /^yuv420p$/ };
    if (values.length % 2 || values.some((value, i) => typeof value !== "string" || i % 2 === 0 && !pairs[value]
      || i % 2 === 1 && !pairs[String(values[i - 1])]!.test(value))) invalid();
    return;
  }
  if (method === "audioFilters" && values.every(value => typeof value === "string" && /^atempo=(?:\d+(?:\.\d+)?)$/.test(value))) return;
  if (method === "videoFilters" && values.length === 1 && values[0] === "pad=ceil(iw/2)*2:ceil(ih/2)*2") return;
  if (method === "complexFilter" && values.length <= 128 && values.every(value => typeof value === "string"
    && (/^\[0:a:0\]atrim=start=\d+(?:\.\d+)?:end=\d+(?:\.\d+)?,asetpts=PTS-STARTPTS\[part\d+\]$/.test(value)
      || /^(?:\[part\d+\])+concat=n=\d+:v=0:a=1\[result\]$/.test(value)))) return;
  invalid();
}

/** 多用户只物化当前任务输入；发布云输出完成后才发送end，失败保留可恢复的临时结果。 */
export function createMediaFactory(factory: FfmpegFactory, cwd: string, signal?: AbortSignal): FfmpegFactory {
  const wrapped = ((input?: unknown, options?: object) => {
    const settings = typeof input === "object" && input ? { ...input } as Record<string, unknown> : { ...options, source: input };
    if (settings.cwd && settings.cwd !== cwd) invalid();
    const command = factory(settings as Parameters<FfmpegFactory>[1]) as Command;
    let folder: string | undefined;
    let release: (() => void) | undefined;
    let preparing: Promise<void> | undefined;
    let running = false;
    let originalInputs: string[] = [];
    const outputs: { path: string; local: string }[] = [];
    const emit = command.emit.bind(command);
    const run = command.run.bind(command);
    const probe = command.ffprobe.bind(command);
    const controller = new AbortController();
    const activeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const cancel = () => command.kill("SIGKILL");
    activeSignal.addEventListener("abort", cancel, { once: true });
    async function cleanup() { activeSignal.removeEventListener("abort", cancel); release?.(); release = undefined; if (folder) { const path = folder; await rm(path, { recursive: true }); folder = undefined; } }
    async function prepare() {
      if (preparing) return preparing;
      preparing = (async () => {
        activeSignal.throwIfAborted();
        folder = await mkdtemp(join(cwd, ".afxenMedia"));
        originalInputs = command._inputs.map(item => item.source);
        const paths = command._outputs.flatMap(item => item.target ? [item.target] : []);
        release = lockWorkspaceFiles(paths);
        for (const [index, item] of command._inputs.entries()) {
          if (typeof item.source !== "string") invalid();
          const source = await resolveWorkspacePath(cwd, relative(cwd, item.source));
          const info = await statWorkspaceFile(source.path);
          if (!info.isFile() || info.size > maxMediaBytes) invalid();
          const bytes = await readWorkspaceFile(source.path, activeSignal);
          // FFmpeg会按内容自动探测并读取清单的间接文件；不接收无容器头的PCM声明绕过。
          validateMedia(bytes);
          item.source = join(folder, `input${index}${extname(source.path)}`);
          await writeAtomic(item.source, bytes, { exclusive: true });
        }
        for (const [index, item] of command._outputs.entries()) {
          if (!item.target) continue;
          const target = await resolveWorkspacePath(cwd, relative(cwd, item.target));
          const existing = await statWorkspaceFile(target.path).catch((cause: NodeJS.ErrnoException) => { if (cause.code !== "ENOENT") throw cause; });
          if (existing) throw Object.assign(new Error("媒体输出已存在，原内容未覆盖"), { status: 409, code: "EEXIST" });
          item.target = join(folder, `output${index}${extname(target.path)}`);
          outputs.push({ path: target.path, local: item.target });
        }
        activeSignal.throwIfAborted();
      })();
      return preparing;
    }
    command.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (event !== "end" && event !== "error") return emit(event, ...args);
      void (async () => {
        try {
          if (event === "end") {
            activeSignal.throwIfAborted();
            for (const output of outputs) {
              const info = await lstat(output.local);
              if (!info.isFile() || info.size > maxMediaBytes) throw new Error("媒体处理输出无效或超过100 MiB");
              await writeWorkspaceFile(output.path, await readFile(output.local), true);
            }
          }
          await cleanup();
          emit(event, ...args);
        } catch (cause) {
          release?.(); release = undefined;
          emit("error", new Error(`媒体处理未完整保存，已产生的结果保留在 ${folder ?? cwd}；请勿重复提交并联系管理员。${cause instanceof Error ? cause.message : "保存失败"}`, { cause }));
        }
      })();
      return true;
    }) as typeof command.emit;
    command.run = () => {
      if (running) invalid();
      running = true;
      void prepare().then(() => { activeSignal.throwIfAborted(); run(); }).catch(cause => command.emit("error", cause));
    };
    command.ffprobe = ((...args: unknown[]) => {
      const callback = args.at(-1);
      if (typeof callback !== "function") invalid();
      void prepare().then(() => {
        Reflect.apply(probe, command, [...args.slice(0, -1), (cause: unknown, data: any) => {
          if (data?.format) data.format.filename = originalInputs[0];
          // fluent在转码准备期间也会调用ffprobe；它不拥有主任务临时文件和输出锁。
          if (running) callback(activeSignal.aborted ? activeSignal.reason : cause, data);
          else void cleanup().then(() => callback(activeSignal.aborted ? activeSignal.reason : cause, data)).catch(cause => callback(cause));
        }]);
      }).catch(cause => {
        if (running) callback(cause);
        else void cleanup().then(() => callback(cause)).catch(cause => callback(cause));
      });
    }) as typeof command.ffprobe;
    const proxy = new Proxy(command, { get(target, key, receiver) {
      if (typeof key !== "string" || typeof Reflect.get(target, key, receiver) !== "function") return Reflect.get(target, key, receiver);
      return (...args: unknown[]) => {
        validateCall(key, args);
        if (key === "kill") controller.abort();
        const result = Reflect.apply(Reflect.get(target, key), target, args);
        return result === target ? proxy : result;
      };
    } });
    return proxy;
  }) as unknown as FfmpegFactory;
  Object.setPrototypeOf(wrapped, factory);
  wrapped.ffprobe = ((path: string, ...args: unknown[]) => Reflect.apply(wrapped(path).ffprobe, wrapped, args)) as FfmpegFactory["ffprobe"];
  return wrapped;
}
