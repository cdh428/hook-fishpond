/**
 * 进程内滑动窗口限流（登录类接口用）。
 *
 * 目的：把「无限次尝试口令」变成「有限次」。
 * 局限（务必如实告知，别当成强防护）：
 *  - Vercel serverless 每个实例各自持有一份内存，N 个实例 ≈ N 倍配额，
 *    冷启动还会把计数清零；
 *  - 所以它能挡住脚本小子式的连续爆破，挡不住分布式的慢速撞库。
 * 真要做强限流需要外部存储（Redis / Upstash）或平台侧 WAF 规则。
 *
 * 之所以先用这个：零依赖、零成本、不会因为新环境变量没配就把服务打挂。
 */

type Bucket = number[];

const buckets = new Map<string, Bucket>();

/** 从请求里取客户端 IP（Vercel 会在 x-forwarded-for 里放真实来源） */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * @param key      限流维度（如 `admin-login:ip:1.2.3.4`）
 * @param limit    窗口内允许的次数
 * @param windowMs 窗口长度
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - hits[0])) / 1000),
    );
    buckets.set(key, hits); // 不追加，保持窗口滚动
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);

  // 顺手回收过期 key，防止 Map 无限增长（长驻实例才会累积）
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) {
      if (!v.length || now - v[v.length - 1] > windowMs) buckets.delete(k);
    }
  }

  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

/** 登录成功时清掉该维度的计数（避免正常用户被自己之前的失败拖累） */
export function rateLimitReset(key: string): void {
  buckets.delete(key);
}

/** 仅测试用：清空全部计数 */
export function rateLimitClearAll(): void {
  buckets.clear();
}
