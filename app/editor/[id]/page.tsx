import { redirect } from "next/navigation"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import MarkdownEditor from "@/components/markdown-editor"

export default async function EditorPage({ params }: { params: { id: string } }) {
  // Await the cookies result
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // Check if user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  // Await params (if they are provided as a promise, or to satisfy the new rules)
  const { id } = await Promise.resolve(params);
  
  // Fetch document
  const { data: document } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (!document) {
    redirect("/dashboard");
  }

  // Check if user has access to this document
  if (document.user_id !== session.user.id) {
    // Check if document is shared with this user
    const { data: sharedDoc } = await supabase
      .from("document_shares")
      .select("*")
      .eq("document_id", id)
      .eq("user_id", session.user.id)
      .single();

    if (!sharedDoc) {
      redirect("/dashboard");
    }
  }

  return <MarkdownEditor document={document} />;
}
