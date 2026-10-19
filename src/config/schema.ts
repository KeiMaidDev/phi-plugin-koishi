// @ts-nocheck
import { Schema } from 'koishi'
import { editable, defaults, readGeneratedSettings } from './shared'

const groupOrder = [
    '系统设置',
    '渲染设置',
    '猜曲绘设置',
    '开字母设置',
    '提示猜歌设置',
    '弗一把设置',
    '其他设置',
    'API 内部凭据',
]

function createKoishiSchema() {
    const configuredGroups = [...new Set(editable.map(item => item.group))]
    const groups = [...groupOrder, ...configuredGroups.filter(group => !groupOrder.includes(group))]
    return Schema.intersect([Schema.object({
        __updatePlugin: Schema.any().role('phi-plugin-update', { target: 'plugin' }).description('更新插件'),
        __updateArtwork: Schema.any().role('phi-plugin-update', { target: 'artwork' }).description('更新曲绘库'),
    }).description('更新操作'), ...groups.map(group => Schema.object(Object.fromEntries(
        editable.filter(item => item.group === group).map(item => {
            /** @type {import('koishi').Schema<any>} */
            let schema
            if (item.type === 'boolean') schema = Schema.boolean()
            else if (item.type === 'number') {
                schema = Schema.number()
                if (item.min !== undefined) schema = schema.min(item.min)
                if (item.max !== undefined) schema = schema.max(item.max)
                if (item.step !== undefined) schema = schema.step(item.step)
            } else if (item.type === 'select') {
                /** @type {import('koishi').Schema<any>[]} */
                const options = (item.options || []).map(option => Schema.const(option.value).description(option.label))
                if (item.allowCustom) options.push(Schema.string().description('自定义地址'))
                schema = Schema.union(options)
            } else {
                schema = Schema.string()
                if (item.secret) schema = schema.role('secret')
                if (item.allowFalse) schema = Schema.union([Schema.const(false).description('不使用代理'), schema])
            }
            schema = schema.description(`${item.label}：${item.description || ''}`).default(defaults[item.key])
            if (item.generated) {
                Object.defineProperty(schema.meta, 'default', {
                    enumerable: true,
                    get: () => readGeneratedSettings()[item.key],
                })
            }
            return [item.key, schema]
        }),
    )).description(group))])
}

export { createKoishiSchema }
