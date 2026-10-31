import { h } from 'koishi'

export interface MarkdownImageAssets {
    transform(content: string): Promise<string>
}

export interface MarkdownImageLogger {
    warn(message: string, ...args: unknown[]): void
}

const markdownImagePattern = /!\[([^\]\r\n]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

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
