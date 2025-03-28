"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { ArrowLeft, Save, Share, MessageSquare, Loader2 } from "lucide-react"
import { marked } from "marked"
import { useDebounce } from "use-debounce"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "@/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Comment } from "@/components/comment"

interface Document {
  id: string
  title: string
  content: string
  user_id: string
}

interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
}

interface ActiveUser extends User {
  color: string
  cursor?: {
    position: number
    selection?: { start: number; end: number }
  }
}

interface CommentType {
  id: string
  user_id: string
  document_id: string
  content: string
  position: number
  created_at: string
  user?: {
    email: string
    full_name?: string
    avatar_url?: string
  }
}

// Generate a random color for user cursors
const getRandomColor = () => {
  const colors = [
    "bg-red-500",
    "bg-blue-500",
    "bg-green-500",
    "bg-yellow-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-orange-500",
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

export default function MarkdownEditor({ document }: { document: Document }) {
  const [content, setContent] = useState(document.content)
  const [title, setTitle] = useState(document.title)
  const [debouncedContent] = useDebounce(content, 1000)
  const [debouncedTitle] = useDebounce(title, 1000)
  const [saving, setSaving] = useState(false)
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [shareEmail, setShareEmail] = useState("")
  const [isCommentsOpen, setIsCommentsOpen] = useState(false)
  const [comments, setComments] = useState<CommentType[]>([])
  const [newComment, setNewComment] = useState("")
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [view, setView] = useState<"split" | "editor" | "preview">("split")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClientComponentClient()

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      if (data) {
        setCurrentUser(data)
      }
    }

    fetchCurrentUser()
  }, [supabase])

  // Fetch comments
  useEffect(() => {
    const fetchComments = async () => {
      const { data, error } = await supabase
        .from("comments")
        .select(`
          *,
          user:profiles(email, full_name, avatar_url)
        `)
        .eq("document_id", document.id)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching comments:", error)
        toast({
          title: "Error",
          description: "Failed to load comments.",
          variant: "destructive",
        })
        return
      }

      // Ensure the structure matches CommentType, especially the nested user object
      const formattedComments = data.map(comment => ({
        ...comment,
        user: comment.user ? {
          email: (comment.user as any).email,
          full_name: (comment.user as any).full_name,
          avatar_url: (comment.user as any).avatar_url,
        } : null // Handle case where user might be null
      })) as CommentType[]


      setComments(formattedComments || [])
    }

    fetchComments()

    // Subscribe to new comments
    const channel = supabase
      .channel(`comments:${document.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `document_id=eq.${document.id}`,
        },
        () => {
          fetchComments()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [document.id, supabase])

  // Set up real-time collaboration
  useEffect(() => {
    let channel: RealtimeChannel

    const setupRealtime = async () => {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Subscribe to document changes
      channel = supabase
        .channel(`document:${document.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "documents",
            filter: `id=eq.${document.id}`,
          },
          (payload) => {
            // Only update if the change was made by another user
            if (payload.new.user_id !== user.id) {
              setContent(payload.new.content)
              setTitle(payload.new.title)
            }
          },
        )
        .on("broadcast", { event: "cursor-update" }, (payload) => {
          setActiveUsers((current) =>
            current.map((u) => (u.id === payload.payload.user.id ? { ...u, cursor: payload.payload.cursor } : u)),
          )
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState()
          const userMap = new Map<string, ActiveUser>()
          Object.values(state).forEach((presence: any) => {
            const userPresence = presence[0] // Assuming the first presence is the relevant one
            if (userPresence && userPresence.user && userPresence.user.id) {
              userMap.set(userPresence.user.id, {
                ...userPresence.user,
                color: userPresence.color,
                cursor: userPresence.cursor,
              })
            }
          })
          setActiveUsers(Array.from(userMap.values())) // Set state with unique users from the map
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
          const newUser = {
            ...newPresences[0].user,
            color: newPresences[0].color,
          }
          setActiveUsers((prev) => [...prev.filter((u) => u.id !== newUser.id), newUser])

          // Notify about new user
          toast({
            title: "User joined",
            description: `${newUser.email || "A user"} joined the document`,
          })
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
          const userId = leftPresences[0].user.id
          setActiveUsers((prev) => prev.filter((u) => u.id !== userId))
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && user) {
            // Get user profile
            const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

            // Track presence with user info and random color
            await channel.track({
              user: profile,
              color: getRandomColor(),
              cursor: null,
              online_at: new Date().toISOString(),
            })
          }
        })
    }

    setupRealtime()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [document.id, supabase])

  // Update cursor position
  const updateCursorPosition = () => {
    if (!textareaRef.current) return

    const channel = supabase.channel(`document:${document.id}`)
    const position = textareaRef.current.selectionStart
    const selection =
      textareaRef.current.selectionStart !== textareaRef.current.selectionEnd
        ? {
            start: textareaRef.current.selectionStart,
            end: textareaRef.current.selectionEnd,
          }
        : undefined

    channel.send({
      type: "broadcast",
      event: "cursor-update",
      payload: {
        user: currentUser,
        cursor: { position, selection },
      },
    })
  }

  // Save document when content changes
  useEffect(() => {
    const saveDocument = async () => {
      if (debouncedContent === document.content && debouncedTitle === document.title) return

      setSaving(true)
      try {
        const { error } = await supabase
          .from("documents")
          .update({
            content: debouncedContent,
            title: debouncedTitle,
            updated_at: new Date().toISOString(),
            user_id: currentUser?.id, // Add user_id to track who made the change
          })
          .eq("id", document.id)

        if (error) throw error
      } catch (error) {
        console.error("Error saving document:", error)
        toast({
          title: "Error saving",
          description: "Failed to save your changes",
          variant: "destructive",
        })
      } finally {
        setSaving(false)
      }
    }

    // Only run saveDocument if currentUser is loaded
    if (currentUser) {
      saveDocument()
    }
  }, [debouncedContent, debouncedTitle, document.content, document.id, document.title, supabase, currentUser]) // Add currentUser here

  // Handle sharing
  const handleShare = async () => {
    if (!shareEmail) return
    setIsLoading(true)

    try {
      // Get user by email
      const { data: users, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", shareEmail)
        .single()

      if (userError) throw new Error("User not found")

      // Share document
      const { error } = await supabase.from("document_shares").insert([
        {
          document_id: document.id,
          user_id: users.id,
        },
      ])

      if (error) throw error

      toast({
        title: "Document shared",
        description: `Document has been shared with ${shareEmail}`,
      })

      setShareEmail("")
      setIsShareDialogOpen(false)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to share document",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Add comment
  const addComment = async () => {
    if (!newComment || selectedPosition === null || !currentUser) return
    setIsLoading(true)

    try {
      const { error } = await supabase.from("comments").insert([
        {
          document_id: document.id,
          user_id: currentUser.id,
          content: newComment,
          position: selectedPosition,
        },
      ])

      if (error) throw error

      setNewComment("")
      setSelectedPosition(null)

      toast({
        title: "Comment added",
        description: "Your comment has been added to the document",
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle text selection for commenting
  const handleTextSelection = () => {
    if (!textareaRef.current) return
    if (textareaRef.current.selectionStart !== textareaRef.current.selectionEnd) {
      setSelectedPosition(textareaRef.current.selectionStart)
    }
  }

  // Render user cursors
  const renderCursors = () => {
    if (!textareaRef.current) return null

    return activeUsers
      .filter((user) => user.id !== currentUser?.id && user.cursor)
      .map((user) => {
        const { cursor, color, email } = user
        if (!cursor) return null

        // Calculate position based on textarea
        const textBeforeCursor = content.substring(0, cursor.position)
        const lines = textBeforeCursor.split("\n")
        const lineNumber = lines.length - 1
        const charPosition = lines[lineNumber].length

        // Get line height and char width (approximate)
        const lineHeight = 24 // Adjust based on your font size
        const charWidth = 8 // Adjust based on your font

        const top = lineNumber * lineHeight
        const left = charPosition * charWidth

        return (
          <TooltipProvider key={user.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={`absolute w-0.5 h-5 ${color} animate-pulse`}
                  style={{ top: `${top}px`, left: `${left}px` }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p>{email || "Anonymous user"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to Dashboard</span>
            </Button>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-none bg-transparent text-lg font-semibold focus:outline-none focus:ring-0"
                placeholder="Untitled Document"
              />
              {saving && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as any)} className="hidden md:block">
              <TabsList>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="split">Split</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex -space-x-2 mr-2">
              {activeUsers.slice(0, 3).map((user) => (
                <TooltipProvider key={user.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Avatar
                        className={`h-8 w-8 border-2 border-background ${user.id === currentUser?.id ? "ring-2 ring-primary" : ""}`}
                      >
                        <AvatarImage src={user.avatar_url || ""} alt={user.email} />
                        <AvatarFallback className={user.color + " text-white"}>
                          {user.email?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{user.email || "Anonymous user"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
              {activeUsers.length > 3 && (
                <Avatar className="h-8 w-8 border-2 border-background">
                  <AvatarFallback>+{activeUsers.length - 3}</AvatarFallback>
                </Avatar>
              )}
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full relative"
                    onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                  >
                    <MessageSquare className="h-4 w-4" />
                    {comments.length > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                        {comments.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Comments</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setIsShareDialogOpen(true)}
                  >
                    <Share className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Share</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </header>

      <div className="grid flex-1 overflow-hidden">
        {view === "split" && (
          <div className="grid md:grid-cols-2 h-full">
            <div className="relative border-r overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={() => {
                  updateCursorPosition()
                  handleTextSelection()
                }}
                onClick={() => updateCursorPosition()}
                onKeyUp={() => updateCursorPosition()}
                className="min-h-[calc(100vh-4rem)] w-full resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0"
                placeholder="Start writing your markdown here..."
              />
              {renderCursors()}
            </div>
            <ScrollArea className="p-4 h-[calc(100vh-4rem)]">
              <div
                className="prose max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: marked(content) }}
              />
            </ScrollArea>
          </div>
        )}

        {view === "editor" && (
          <div className="relative h-full overflow-hidden">
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onSelect={() => {
                updateCursorPosition()
                handleTextSelection()
              }}
              onClick={() => updateCursorPosition()}
              onKeyUp={() => updateCursorPosition()}
              className="min-h-[calc(100vh-4rem)] w-full resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0"
              placeholder="Start writing your markdown here..."
            />
            {renderCursors()}
          </div>
        )}

        {view === "preview" && (
          <ScrollArea className="p-4 h-[calc(100vh-4rem)]">
            <div className="prose max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked(content) }} />
          </ScrollArea>
        )}

        {isCommentsOpen && (
          <div className="fixed right-0 top-16 bottom-0 w-80 border-l bg-background z-10 flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Comments</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsCommentsOpen(false)}>
                ×
              </Button>
            </div>

            {selectedPosition !== null && (
              <div className="p-4 border-b">
                <h4 className="text-sm font-medium mb-2">Add Comment</h4>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="min-h-[100px] text-sm"
                />
                <div className="flex justify-end mt-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedPosition(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={addComment} disabled={!newComment || isLoading}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Comment"}
                  </Button>
                </div>
              </div>
            )}

            <ScrollArea className="flex-1 p-4">
              {comments.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No comments yet</p>
                  <p className="text-xs mt-1">Select text to add a comment</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <Comment key={comment.id} comment={comment} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
            <DialogDescription>Enter the email of the user you want to share this document with.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShareDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleShare} disabled={isLoading || !shareEmail}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share className="h-4 w-4 mr-2" />}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

