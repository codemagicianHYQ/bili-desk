import { useEffect, useState } from 'react'

import { Link } from 'react-router-dom'

import type { UpProfile, UpRelation } from '@shared/types'

import { BiliImage } from '@/components/ui/bili-image'

import { FollowButton } from '@/components/video/FollowButton'

import { formatCount } from '@/lib/utils'



interface UpOwnerCardProps {

  mid: number

  name: string

  face: string

}



export function UpOwnerCard({ mid, name, face }: UpOwnerCardProps) {

  const [profile, setProfile] = useState<UpProfile | null>(null)

  const [relation, setRelation] = useState<UpRelation | null>(null)

  const [loadingFollow, setLoadingFollow] = useState(false)

  const [error, setError] = useState('')



  useEffect(() => {

    setError('')

    Promise.all([

      window.biliDesk.bili.getUpProfile(mid),

      window.biliDesk.bili.getUpRelation(mid)

    ])

      .then(([upProfile, upRelation]) => {

        setProfile(upProfile)

        setRelation(upRelation)

      })

      .catch((e: Error) => setError(e.message))

  }, [mid])



  const handleFollow = async () => {

    if (!relation) return

    setLoadingFollow(true)

    setError('')

    try {

      await window.biliDesk.bili.modifyFollow(mid, !relation.isFollowing)

      setRelation({ ...relation, isFollowing: !relation.isFollowing })

    } catch (e) {

      setError(e instanceof Error ? e.message : '操作失败')

    } finally {

      setLoadingFollow(false)

    }

  }



  const displayName = profile?.name || name

  const displayFace = profile?.face || face



  return (

    <div className="space-y-2">

      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">

        <Link

          to={`/up/${mid}`}

          className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"

        >

          <BiliImage

            src={displayFace}

            alt={displayName}

            className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-border"

          />

          <div className="min-w-0 text-left">

            <p className="truncate font-medium">{displayName}</p>

            <p className="text-xs text-muted-foreground">

              {profile ? `${formatCount(profile.fans)} 粉丝` : '加载中...'}

              {profile ? ` · ${formatCount(profile.videos)} 投稿` : ''}

            </p>

          </div>

        </Link>



        <FollowButton

          isFollowing={relation?.isFollowing ?? false}

          loading={loadingFollow}

          disabled={!relation}

          onClick={() => void handleFollow()}

        />

      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

    </div>

  )

}


