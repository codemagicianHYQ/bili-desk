import { taxonomyRepo } from '../db/repositories/taxonomy'
import { biliApi } from './bili-api'
import { classifyFavoriteItemsAsync } from './fav-classifier'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function createTaskReporter(taskId: number) {
  let lastUpdateAt = 0

  return (patch: { progress?: number; message?: string; status?: 'running' | 'done' | 'failed' }) => {
    const now = Date.now()
    if (patch.status !== 'done' && patch.status !== 'failed' && now - lastUpdateAt < 400) {
      return
    }
    lastUpdateAt = now
    taxonomyRepo.updateTask(taskId, patch)
  }
}

export class FavClassifyEngine {
  startClassifyAll(): number {
    const task = taxonomyRepo.createTask('fav_classification')
    void this.runClassifyAll(task.id)
    return task.id
  }

  startClassifyFolder(mediaId: number): number {
    const task = taxonomyRepo.createTask('fav_classification_folder')
    void this.runClassifyFolder(task.id, mediaId)
    return task.id
  }

  private async runClassifyAll(taskId: number): Promise<void> {
    const report = createTaskReporter(taskId)

    try {
      taxonomyRepo.ensureExtendedFavTaxonomy()
      report({ status: 'running', progress: 0, message: '正在获取收藏夹列表...' })

      const folders = await biliApi.getFavFolders()
      const seen = new Set<number>()
      const all: Awaited<ReturnType<typeof biliApi.getAllFavResourcesInFolder>> = []
      const totalEstimate = Math.max(
        folders.reduce((sum, folder) => sum + folder.mediaCount, 0),
        1
      )

      for (let index = 0; index < folders.length; index++) {
        const folder = folders[index]
        report({
          progress: Math.min(15, Math.round((index / folders.length) * 15)),
          message: `正在拉取「${folder.title}」(${index + 1}/${folders.length})...`
        })

        const items = await biliApi.getAllFavResourcesInFolder(folder.id, async (fetchedInFolder) => {
          report({
            progress: Math.min(
              18,
              Math.round(15 * (all.length + fetchedInFolder) / totalEstimate)
            ),
            message: `正在拉取「${folder.title}」已获取 ${fetchedInFolder} 条...`
          })
          await yieldToEventLoop()
        })

        for (const item of items) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          all.push(item)
        }

        await yieldToEventLoop()
        if (index < folders.length - 1) {
          await sleep(500)
        }
      }

      if (all.length === 0) {
        report({ status: 'done', progress: 100, message: '暂无收藏视频可分类' })
        return
      }

      report({ progress: 20, message: `已获取 ${all.length} 条收藏，正在重建目录并分类...` })

      const total = await classifyFavoriteItemsAsync(all, (done, totalCount) => {
        report({
          progress: Math.round(20 + (done / totalCount) * 75),
          message: `正在分类 ${done}/${totalCount}...`
        })
      })

      report({ status: 'done', progress: 100, message: `已完成 ${total} 个视频的本地分类` })
    } catch (error) {
      const message =
        error instanceof Error && (error.message.includes('412') || error.message.includes('安全策略'))
          ? '请求被 B 站安全策略拦截，请等待几秒后重试'
          : error instanceof Error
            ? error.message
            : '收藏分类失败'
      report({
        status: 'failed',
        progress: 100,
        message
      })
    }
  }

  private async runClassifyFolder(taskId: number, mediaId: number): Promise<void> {
    const report = createTaskReporter(taskId)

    try {
      taxonomyRepo.ensureDefaultFavTaxonomy()
      report({ status: 'running', progress: 5, message: '正在拉取当前收藏夹...' })

      const items = await biliApi.getAllFavResourcesInFolder(mediaId, async (fetched) => {
        report({
          progress: Math.min(20, Math.round((fetched / Math.max(fetched, 1)) * 20)),
          message: `已获取 ${fetched} 条收藏...`
        })
        await yieldToEventLoop()
      })

      if (items.length === 0) {
        report({ status: 'done', progress: 100, message: '当前收藏夹没有视频' })
        return
      }

      const total = await classifyFavoriteItemsAsync(items, (done, totalCount) => {
        report({
          progress: Math.round(20 + (done / totalCount) * 75),
          message: `正在分类 ${done}/${totalCount}...`
        })
      }, { resetCategories: false })

      report({ status: 'done', progress: 100, message: `已完成 ${total} 个视频的本地分类` })
    } catch (error) {
      const message =
        error instanceof Error && (error.message.includes('412') || error.message.includes('安全策略'))
          ? '请求被 B 站安全策略拦截，请等待几秒后重试'
          : error instanceof Error
            ? error.message
            : '收藏分类失败'
      report({
        status: 'failed',
        progress: 100,
        message
      })
    }
  }
}

export const favClassifyEngine = new FavClassifyEngine()
