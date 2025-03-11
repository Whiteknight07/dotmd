import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface CommentProps {
  comment: {
    id: string
    content: string
    created_at: string
    user?: {
      email?: string
      full_name?: string
      avatar_url?: string
    } | null
  }
}

export function Comment({ comment }: CommentProps) {
  const formattedDate = formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8">
        <AvatarImage src={comment.user?.avatar_url || ""} alt={comment.user?.email || "User"} />
        <AvatarFallback>{comment.user?.email?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{comment.user?.full_name || comment.user?.email || "Anonymous"}</p>
          <p className="text-xs text-muted-foreground">{formattedDate}</p>
        </div>
        <div className="mt-1 rounded-md bg-muted p-2 text-sm">{comment.content}</div>
      </div>
    </div>
  )
}

