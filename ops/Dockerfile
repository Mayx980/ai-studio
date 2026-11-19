FROM oven/bun:1.3.14

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg git python3 python3-pymysql python3-yaml python3-cryptography \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# ACT: 保留工作区与依赖以兼容运行时动态加载；需要缩减镜像时再拆分构建阶段。
RUN bun install --frozen-lockfile

RUN bun run build:server \
    && mkdir -p data/workspaces/myProject ops/db/.runtime \
    && chown -R bun:bun data ops/db/.runtime

ENV NODE_ENV=production
ENV TOONFLOW_DATA_DIR=/app/data

USER bun
EXPOSE 3000

CMD ["bun", "build/server/index.js"]
