import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import MarkdownEditor from "@/components/markdown-editor";

type TParams = Promise<{ id: string }>;

export default async function EditorPage({ params }: { params: TParams }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient<any>({ cookies: () => cookieStore });

  // Check if user is authenticated
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // Await the asynchronous params to get the actual id value
  const { id } = await params;
  
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
  if (document.user_id !== user.id) {
    // Check if document is shared with this user
    const { data: sharedDoc } = await supabase
      .from("document_shares")
      .select("*")
      .eq("document_id", id)
      .eq("user_id", user.id)
      .single();

    if (!sharedDoc) {
      redirect("/dashboard");
    }
  }

  return <MarkdownEditor document={document} />;
}
