import { Search as SearchIcon } from 'lucide-react'

export function SearchPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <SearchIcon className="h-12 w-12 opacity-40" />
      <p>搜索功能将在后续版本实现</p>
    </div>
  )
}
