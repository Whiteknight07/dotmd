"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { FilePlus, MoreVertical, Pencil, Share, Trash, Users } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { toast } from "@/hooks/use-toast"

interface Document {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export default function DocumentList({ documents }: { documents: Document[] }) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [shareEmail, setShareEmail] = useState("")
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("all")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleDelete = async () => {
    if (!selectedDocument) return
    setIsLoading(true)

    try {
      const { error } = await supabase.from("documents").delete().eq("id", selectedDocument.id)

      if (error) throw error

      toast({
        title: "Document deleted",
        description: "Your document has been deleted successfully.",
      })

      router.refresh()
    } catch (error: any) {
      setError(error.message || "Failed to delete document")
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setIsDeleteDialogOpen(false)
    }
  }

  const handleShare = async () => {
    if (!selectedDocument || !shareEmail) return
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
          document_id: selectedDocument.id,
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
      setError(error.message || "Failed to share document")
      toast({
        title: "Error",
        description: error.message || "Failed to share document",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Filter documents based on active tab
  const filteredDocuments = documents.filter((doc) => {
    if (activeTab === "all") return true
    if (activeTab === "recent") {
      const lastWeek = new Date()
      lastWeek.setDate(lastWeek.getDate() - 7)
      return new Date(doc.updated_at) >= lastWeek
    }
    return true
  })

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-destructive/15 px-4 py-3 text-sm text-destructive">
          <p>{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Tabs defaultValue="all" className="w-full sm:w-auto" onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Documents</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button asChild>
          <Link href="/dashboard/new">
            <FilePlus className="mr-2 h-4 w-4" />
            New Document
          </Link>
        </Button>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <div className="rounded-full bg-primary/10 p-3 text-primary">
            <FilePlus className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-xl font-semibold">No documents yet</h3>
          <p className="mt-2 mb-6 text-sm text-muted-foreground max-w-sm">
            Create your first document to get started with collaborative Markdown editing
          </p>
          <Button asChild>
            <Link href="/dashboard/new">
              <FilePlus className="mr-2 h-4 w-4" />
              Create Document
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((document) => (
            <div
              key={document.id}
              className="group relative rounded-lg border p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/50"
            >
              <div className="absolute right-4 top-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-70 hover:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/editor/${document.id}`}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedDocument(document)
                        setIsShareDialogOpen(true)
                      }}
                    >
                      <Share className="mr-2 h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setSelectedDocument(document)
                        setIsDeleteDialogOpen(true)
                      }}
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Link href={`/editor/${document.id}`} className="block h-full">
                <div className="flex flex-col h-full">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-lg font-semibold line-clamp-1">{document.title}</h3>
                    <Badge variant="outline" className="ml-auto">
                      Markdown
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Updated {formatDistanceToNow(new Date(document.updated_at), { addSuffix: true })}
                  </p>
                  <div className="mt-auto pt-4 border-t flex items-center justify-between">
                    <div className="flex -space-x-2">
                      <Avatar className="h-7 w-7 border-2 border-background">
                        <AvatarFallback>JD</AvatarFallback>
                      </Avatar>
                      <Avatar className="h-7 w-7 border-2 border-background">
                        <AvatarFallback>AK</AvatarFallback>
                      </Avatar>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />3 users
                    </Button>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedDocument?.title}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              {isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Document</DialogTitle>
            <DialogDescription>
              Enter the email of the user you want to share &quot;{selectedDocument?.title}&quot; with.
            </DialogDescription>
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
              {isLoading ? "Sharing..." : "Share"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

