import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import MarkdownEditor from "@/components/markdown-editor";

type TParams = Promise<{ id: string }>;

export default async function EditorPage({ params }: { params: TParams }) {
  // Await the cookies result
  const cookieStore = await cookies();
  // Wrap cookieStore in a Promise to match expected type
  const supabase = createServerComponentClient({ cookies: () => Promise.resolve(cookieStore) });

  // Check if user is authenticated
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
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
