// src/app/editor/[id]/page.tsx

import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import MarkdownEditor from "@/components/markdown-editor";
import type { Database } from "@/lib/supabase-types"; // Import Database type
// Optional: For specific 'not found' handling
// import { notFound } from 'next/navigation';

// Define the expected shape of the document data fetched
interface EditorDocumentData {
  id: string;
  title: string;
  user_id: string;
  // Keep 'content' for initial prop, Yjs will take over
  content: string;
}

// Define the params type correctly
interface EditorPageProps {
  params: {
    id: string; // The document ID from the URL
  };
}

export default async function EditorPage({ params }: EditorPageProps) {
  const cookieStore = cookies();
  // Use Database type for better type safety
  const supabase = createServerComponentClient<Database>({ cookies: () => cookieStore });

  // 1. Check User Authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    console.log("User not authenticated, redirecting to login.");
    redirect("/login");
  }

  // Get the document ID from parameters
  const { id } = params;
  if (!id) {
      console.error("No document ID provided in params.");
      redirect("/dashboard"); // Or: notFound();
  }

  // 2. Fetch Initial Document Metadata
  // Select 'content' for initial prop, title, and user_id for checks
  const { data: documentData, error: docError } = await supabase
    .from("documents")
    .select("id, title, user_id, content")
    .eq("id", id)
    .single<EditorDocumentData>();

  // Handle document not found
  if (docError || !documentData) {
    console.error(`Error fetching document ${id}:`, docError);
    // notFound(); // Use this for a proper 404 page
    redirect("/dashboard"); // Fallback redirect
  }

  // 3. Check Document Access (Ownership or Share)
  let hasAccess = false;
  if (documentData.user_id === user.id) {
    // User is the owner
    hasAccess = true;
  } else {
    // Check if the document is shared with the current user
    // Destructure 'count' directly from the response when using { head: true }
    const { count, error: shareError } = await supabase
      .from("document_shares")
      .select('*', { count: 'exact', head: true }) // Query efficiently just for existence
      .eq("document_id", id)
      .eq("user_id", user.id);

    if (shareError) {
        console.error(`Error checking share for doc ${id}, user ${user.id}:`, shareError);
        // Fail safely - deny access if share check fails
        // Consider showing an error page instead of just redirecting silently
    } else if (count !== null && count > 0) { // Check the top-level 'count' directly
        // Share record exists (count is greater than 0)
        hasAccess = true;
    }
  }

  // Redirect if user doesn't have access
  if (!hasAccess) {
    console.log(`User ${user.id} denied access to document ${id}.`);
    // Consider redirecting to a dedicated "access denied" page
    redirect("/dashboard");
  }

  // 4. Render the Editor Component
  // Pass the fetched document metadata. Yjs will handle the actual content sync.
  return <MarkdownEditor document={documentData} />;
}

// Optional: Add metadata generation if needed
// import type { Metadata } from 'next';
// export async function generateMetadata({ params }: EditorPageProps): Promise<Metadata> {
//   // Fetch title server-side for metadata (similar fetch logic as above, maybe without content)
//   // const { data } = await supabase.from('documents').select('title').eq('id', params.id).single();
//   // const documentTitle = data?.title;
//   return {
//     title: `Editing: ${'Document Title' || 'Document'} - MarkCollab`, // Replace with fetched title
//   };
// }