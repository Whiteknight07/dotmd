import { redirect } from "next/navigation"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import DashboardShell from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Pencil } from "lucide-react"

export default async function SharedDocumentsPage() {
  const supabase = createServerComponentClient({ cookies })

  // Check if user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/login")
  }

  // Fetch user profile
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single()

  // Fetch documents shared with the user
  const { data: sharedDocuments, error: sharedError } = await supabase
    .from("document_shares")
    .select(`
      *,
      documents:documents(
        id,
        title,
        content,
        user_id,
        created_at,
        updated_at,
        owner:profiles(id, email, full_name, avatar_url)
      )
    `)
    .eq("user_id", session.user.id)
  
  console.log("Shared documents query result:", { sharedDocuments, error: sharedError })

  return (
    <DashboardShell user={profile}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Shared with Me</h1>
          <p className="text-muted-foreground">Documents that have been shared with you by other users</p>
        </div>

        {!sharedDocuments || sharedDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-semibold">No shared documents</h3>
            <p className="mt-2 mb-6 text-sm text-muted-foreground max-w-sm">
              When someone shares a document with you, it will appear here
            </p>
            {sharedError && (
              <p className="text-sm text-destructive">Error loading shared documents: {sharedError.message}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sharedDocuments.map((item) => (
              <div
                key={item.id}
                className="group relative rounded-lg border p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/50"
              >
                <Link href={`/editor/${item.documents.id}`} className="block h-full">
                  <div className="flex flex-col h-full">
                    <div className="mb-2 flex items-center gap-2">
                      <h3 className="text-lg font-semibold line-clamp-1">{item.documents.title}</h3>
                      <Badge variant="outline" className="ml-auto">
                        Shared
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Updated {formatDistanceToNow(new Date(item.documents.updated_at), { addSuffix: true })}
                    </p>
                    <div className="mt-auto pt-4 border-t flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={item.documents.owner?.avatar_url || ""} alt={item.documents.owner?.email || "Owner"} />
                          <AvatarFallback>{item.documents.owner?.email?.charAt(0).toUpperCase() || "O"}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          Shared by {item.documents.owner?.full_name || item.documents.owner?.email || "Unknown"}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

