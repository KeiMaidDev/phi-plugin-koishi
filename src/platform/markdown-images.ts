import { h } from 'koishi'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { imageSize } from 'image-size'

export interface MarkdownImageAssets {
    transform(content: string): Promise<string>
}

export interface MarkdownImageLogger {
    warn(message: string, ...args: unknown[]): void
}

const markdownImagePattern = /!\[([^\]\r\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

export interface MarkdownImageDimensions {
    width: number
    height: number
}

function imageBuffer(source: string) {
    try {
        if (source.startsWith('data:')) {
            const comma = source.indexOf(',')
            if (comma < 0) return
            const metadata = source.slice(0, comma)
            const payload = source.slice(comma + 1)
            return metadata.includes(';base64')
                ? Buffer.from(payload, 'base64')
                : Buffer.from(decodeURIComponent(payload))
        }
        if (source.startsWith('file://')) return fs.readFileSync(fileURLToPath(source))
        if (!/^[a-z][a-z\d+.-]*:/i.test(source) && fs.existsSync(source)) return fs.readFileSync(source)
    } catch {
        return
    }
}

/** 读取图片的像素尺寸；无法读取时返回 undefined，不影响消息发送。 */
export async function getMarkdownImageDimensions(source: string): Promise<MarkdownImageDimensions | undefined> {
    let buffer = imageBuffer(source)
    if (!buffer && /^https?:\/\//i.test(source)) {
        try {
            const response = await fetch(source, { signal: AbortSignal.timeout?.(5000) })
            if (response.ok) buffer = Buffer.from(await response.arrayBuffer())
        } catch {
            // 外部图片不可读时保留原 Markdown，不阻塞发送。
        }
    }
    if (!buffer) return
    try {
        const size = imageSize(buffer)
        if (size.width > 0 && size.height > 0) return { width: size.width, height: size.height }
    } catch {
        // 非支持格式或损坏图片不补尺寸。
    }
}

function escapeImageAlt(value: unknown) {
    return String(value ?? '图片').replace(/\\/g, '\\\\').replace(/\]/g, '\\]').replace(/\r?\n/g, ' ')
}

function escapeImageUrl(value: unknown) {
    return String(value ?? '')
        .replace(/\s/g, '%20')
        .replace(/\)/g, '\\)')
}

/** 生成 QQ Markdown 官方图片语法；已知尺寸时补 `#宽px #高px`。 */
export function formatMarkdownImage(alt: unknown, source: string, dimensions?: MarkdownImageDimensions) {
    const rawAlt = String(alt ?? '图片').replace(/\s+#\d+px\s+#\d+px\s*$/, '')
    const label = `${escapeImageAlt(rawAlt)}${dimensions ? ` #${dimensions.width}px #${dimensions.height}px` : ''}`
    return `![${label}](${escapeImageUrl(source)})`
}

export function isPublicHttpUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false
    try {
        const url = new URL(value)
        return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
    } catch {
        return false
    }
}


async function transformMarkdownImage(source: string, assets?: MarkdownImageAssets) {
    if (isPublicHttpUrl(source)) return source
    if (!assets?.transform) throw new Error('assets service is unavailable')
    const transformed = await assets.transform(String(h.image(source)))
    const image = h.parse(transformed).find(element => element.type === 'img')
    const resolved = image?.attrs?.src
    if (!isPublicHttpUrl(resolved)) throw new Error('assets transform did not return a public HTTP(S) URL')
    return resolved
}

/**
 * 把 Markdown 中无法被 QQ 直接访问的图片源转换为公开 HTTP(S) 直链。
 * 该工具不绑定发送流程；调用方需要显式处理转换后的文本。
 */
export async function resolveMarkdownImageSources(
    content: string,
    assets?: MarkdownImageAssets,
    logger?: MarkdownImageLogger,
) {
    if (!content.includes('![')) return content
    let result = content
    for (const match of content.matchAll(markdownImagePattern)) {
        const [syntax, alt, source] = match
        if (isPublicHttpUrl(source)) continue
        try {
            const resolved = await transformMarkdownImage(source, assets)
            result = result.replace(syntax, () => `![${alt}](${resolved})`)
        } catch (error) {
            logger?.warn('[phi-plugin] Markdown 图片无法转换为公开直链，已移除图片：%s', error)
            result = result.replace(syntax, () => alt)
        }
    }
    return result
}
