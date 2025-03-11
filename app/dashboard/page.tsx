import { redirect } from "next/navigation"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import DashboardShell from "@/components/dashboard-shell"
import DocumentList from "@/components/document-list"

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies })

  // Check if user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/login")
  }

  // Fetch user's documents
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false })

  // Fetch user profile
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single()

  return (
    <DashboardShell user={profile}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Your Documents</h1>
          <p className="text-muted-foreground">Create, edit, and collaborate on your Markdown documents</p>
        </div>
        <DocumentList documents={documents || []} />
      </div>
    </DashboardShell>
  )
}

