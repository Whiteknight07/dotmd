// src/components/markdown-editor.tsx

"use client"

import React, { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClientComponentClient, Session } from "@supabase/auth-helpers-nextjs"
import { ArrowLeft, Share, MessageSquare, Loader2, X as CloseIcon } from "lucide-react"
import { marked } from "marked"
import type { RealtimeChannel, RealtimePresenceState } from "@supabase/realtime-js" // Correct type import
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
// FIX: Assuming CommentProps in comment.tsx will be updated to accept null for user fields
import { Comment } from "@/components/comment"
import * as Y from 'yjs'
// FIX: Correct import for SupabaseProvider (default export)
import SupabaseProvider from 'y-supabase';

import type { Database } from "@/lib/supabase-types" // Import Database type if you have it

// --- Interfaces ---

// Document data passed as prop
interface DocumentProp {
  id: string
  title: string
  content: string // For initial render before Yjs loads
  user_id: string
}

// User profile data
interface User {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
}

// User tracked by Yjs Awareness
interface ActiveUser extends User {
  color: string
  cursor?: {
    anchor: number | null
    head: number | null
  }
}

// Comment data
interface CommentType {
  id: string
  user_id: string
  document_id: string
  content: string
  position: number
  created_at: string
  user?: {
    email: string
    full_name?: string | null
    avatar_url?: string | null
  } | null
}

// Type for awareness state value from y-protocols
interface AwarenessState {
    user?: User;
    color?: string;
    cursor?: { anchor: number | null, head: number | null };
    // Add other fields you might track
}


// --- Helper Functions ---

const getUserColor = (userId: string): string => {
  const colors = [
    '#30bced', '#6eeb83', '#ffbc42', '#ecd444', '#ee6352',
    '#9ac2c9', '#8acb88', '#fefe62', '#ffb703', '#fb8500',
    '#EF767A', '#456990', '#49BEAA', '#A8D0E6', '#F7AEF8'
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// --- Component ---
export default function MarkdownEditor({ document }: { document: DocumentProp }) {
  // --- State & Refs ---
  const [yDoc, setYDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<SupabaseProvider | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const awarenessRef = useRef<any>(null); // Yjs Awareness instance (`awarenessProtocol.Awareness`)
  const [editorContent, setEditorContent] = useState(document.content);
  const [title, setTitle] = useState(document.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const lastSavedTitle = useRef(document.title);
  const titleSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [newComment, setNewComment] = useState("");
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"split" | "editor" | "preview">("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const supabase = createClientComponentClient<Database>();

  // --- Effects ---

  // 1. Fetch Current User Profile
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error("Auth error or no user:", authError);
        router.push('/login');
        return;
      }
      const { data: profileData, error: profileError } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      if (profileError && profileError.code !== 'PGRST116') {
        console.error("Error fetching profile:", profileError);
        toast({ title: "Profile Error", description: "Could not load profile.", variant: "destructive" });
        setCurrentUser({ id: user.id, email: user.email || 'No Email' }); // Fallback
      } else if (profileData) {
        setCurrentUser(profileData);
      } else {
        setCurrentUser({ id: user.id, email: user.email || 'No Email' }); // Fallback if profile null
      }
    };
    fetchCurrentUser();
  }, [supabase, router]);

  // 2. Fetch and Subscribe to Comments
  useEffect(() => {
    if (!document.id) return;
    // Use any for now to avoid version mismatch issues
    let commentsChannel: any = null;

    const fetchComments = async () => {
      const { data, error } = await supabase
        .from("comments")
        .select(`id, content, created_at, position, user_id, document_id, user:profiles(email, full_name, avatar_url)`)
        .eq("document_id", document.id)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Error fetching comments:", error);
        toast({ title: "Error", description: "Failed to load comments.", variant: "destructive" });
        return;
      }
      if (data && Array.isArray(data)) {
        // Transform the data to match CommentType by extracting first user profile
        setComments(data.map(comment => ({
          ...comment,
          user: Array.isArray(comment.user) && comment.user.length > 0
            ? comment.user[0]
            : null
        })) as CommentType[]);
      } else {
        setComments([]);
      }
    };

    fetchComments(); // Initial fetch

    // Subscribe
    commentsChannel = supabase
      .channel(`comments:${document.id}`)
      .on<CommentType>(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `document_id=eq.${document.id}` },
        () => { fetchComments(); } // Refetch on change
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') console.log(`Subscribed to comments channel for doc ${document.id}`);
        if (err) console.error(`Error subscribing to comments channel:`, err);
      });

    // Cleanup
    return () => {
      if (commentsChannel) {
        supabase.removeChannel(commentsChannel).catch(err => console.error("Error removing comments channel:", err));
      }
    };
  }, [document.id, supabase]);

  // 3. Initialize Yjs and Provider
  useEffect(() => {
    if (!document || !supabase || !currentUser || !currentUser.id) {
      console.log("Yjs init waiting for dependencies...");
      return;
    }

    console.log(`Initializing Yjs for doc: ${document.id}, user: ${currentUser.id}`);
    const doc = new Y.Doc();
    setYDoc(doc);
    const yText = doc.getText('markdown');
    yTextRef.current = yText;
    const channelId = `document-yjs:${document.id}`;
    let realtimeChannel: any = null;
    let supabaseProvider: any = null;

    try {
        realtimeChannel = supabase.channel(channelId);
        
        supabaseProvider = new SupabaseProvider(doc, supabase, {
            channel: realtimeChannel,
            tableName: 'documents',
            idName: 'id',
            columnName: 'yjs_content',
            id: document.id,
        });

        setProvider(supabaseProvider);
        awarenessRef.current = supabaseProvider.awareness;

        // --- Sync Editor Content ---
        const handleYTextChange = () => {
          if (!yTextRef.current) return;
          const currentYjsText = yTextRef.current.toString();
          setEditorContent(prev => (prev !== currentYjsText ? currentYjsText : prev));
        };
        yText.observe(handleYTextChange);

        // --- Sync Awareness ---
        const handleAwarenessChange = () => {
            if (!awarenessRef.current || !currentUser || !currentUser.id) return;
            // FIX: Explicitly type states map; values are AwarenessState (or 'any' if unknown structure)
            const states: Map<number, AwarenessState> = awarenessRef.current.getStates();
            const users = Array.from(states.values())
                .filter((state): state is AwarenessState & { user: User } => // Type guard to ensure state.user exists
                    !!state && !!state.user && state.user.id !== currentUser!.id)
                .map(state => ({
                    ...(state.user), // Spread validated user data
                    color: state.color || getUserColor(state.user.id),
                    cursor: state.cursor,
                })) as ActiveUser[];
            setActiveUsers(users);
        };
        awarenessRef.current.on('change', handleAwarenessChange);

        // Set initial local awareness state
        if (awarenessRef.current) {
            awarenessRef.current.setLocalStateField('user', {
                id: currentUser.id, email: currentUser.email, avatar_url: currentUser.avatar_url, full_name: currentUser.full_name
            });
            awarenessRef.current.setLocalStateField('color', getUserColor(currentUser.id));
        }

        // --- Provider Status Handling ---
        supabaseProvider.on('sync', (isSynced: boolean) => {
            console.log(`Yjs Provider ${isSynced ? 'synced' : 'out of sync'}`);
            if (isSynced) handleYTextChange();
        });
        supabaseProvider.on('error', (error: any) => {
            console.error('SupabaseProvider error:', error);
            toast({ title: "Sync Error", description: "Real-time connection issue.", variant: "destructive" });
        });

        // --- Cleanup ---
        return () => {
            console.log("Cleaning up Yjs, Awareness, and Supabase channel:", channelId);
            // Unbind handlers first
            awarenessRef.current?.off('change', handleAwarenessChange);
            yText?.unobserve(handleYTextChange);
            // Destroy Yjs objects
            awarenessRef.current?.destroy();
            supabaseProvider?.destroy(); // This should disconnect & clean up the channel
            doc?.destroy();
            // Optional: Explicit channel removal (might be redundant)
            // if (realtimeChannel) {
            //     supabase.removeChannel(realtimeChannel).catch(err => console.error("Error removing channel:", err));
            // }
            // Reset state
            setProvider(null);
            setYDoc(null);
            yTextRef.current = null;
            awarenessRef.current = null;
            setActiveUsers([]);
        };

    } catch (error) {
        console.error("Error initializing Yjs/SupabaseProvider:", error);
        toast({ title: "Initialization Error", description: "Failed to set up real-time editor.", variant: "destructive" });
        // Cleanup any partially created objects if necessary
        if (realtimeChannel) supabase.removeChannel(realtimeChannel);
        doc?.destroy();
        return; // Prevent further execution in this effect
    }

  }, [document, supabase, currentUser]); // Dependencies

  // 4. Cleanup Title Save Timeout on Unmount
  useEffect(() => {
    return () => { if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current); };
  }, []);

  // --- Callback Handlers ---

  const handleEditorChange = useCallback((newEditorValue: string) => {
    setEditorContent(newEditorValue);
    if (yTextRef.current && yDoc && provider?.synced) {
      const yText = yTextRef.current;
      yDoc.transact(() => {
        if (newEditorValue !== yText.toString()) {
          yText.delete(0, yText.length);
          yText.insert(0, newEditorValue);
        }
      }, 'local');
    }
  }, [yDoc, provider]);

  const updateAwarenessCursor = useCallback(() => {
    if (!textareaRef.current || !awarenessRef.current || !provider?.synced) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    const anchor = selectionStart;
    const head = selectionEnd;
    awarenessRef.current.setLocalStateField('cursor', { anchor, head });
  }, [provider]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current);
    titleSaveTimeout.current = setTimeout(async () => {
      if (newTitle !== lastSavedTitle.current && currentUser) {
        setIsSavingTitle(true);
        try {
          const { error } = await supabase
            .from('documents').update({ title: newTitle, updated_at: new Date().toISOString() }).eq('id', document.id);
          if (error) throw error;
          lastSavedTitle.current = newTitle;
        } catch (error: any) {
          console.error("Error saving title:", error);
          toast({ title: "Error", description: `Failed to save title: ${error.message}`, variant: "destructive" });
        } finally {
          setIsSavingTitle(false);
        }
      }
    }, 1500);
  };

  const handleShare = async () => {
    if (!shareEmail || !currentUser) return;
    setIsLoading(true);
    try {
      const { data: targetUser, error: findError } = await supabase
        .from('profiles').select('id').eq('email', shareEmail.trim()).single();
      if (findError || !targetUser) throw new Error("User not found.");
      if (targetUser.id === currentUser.id) throw new Error("Cannot share with yourself.");
      const { count, error: checkError } = await supabase
        .from('document_shares').select('*', { count: 'exact', head: true }).eq('document_id', document.id).eq('user_id', targetUser.id);
      if (checkError) throw checkError;
      if (count !== null && count > 0) throw new Error("Already shared with this user.");
      const { error: insertError } = await supabase
        .from('document_shares').insert({ document_id: document.id, user_id: targetUser.id });
      if (insertError) throw insertError;
      toast({ title: "Shared Successfully", description: `Document shared with ${shareEmail}.` });
      setShareEmail("");
      setIsShareDialogOpen(false);
    } catch (error: any) {
      console.error("Sharing error:", error);
      toast({ title: "Sharing Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const addComment = async () => {
    if (!newComment.trim() || selectedPosition === null || !currentUser) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from("comments").insert({
        document_id: document.id, user_id: currentUser.id, content: newComment.trim(), position: selectedPosition,
      });
      if (error) throw error;
      setNewComment("");
      setSelectedPosition(null);
      toast({ title: "Comment Added" });
    } catch (error: any) {
      console.error("Add comment error:", error);
      toast({ title: "Error", description: `Failed to add comment: ${error.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSelection = () => {
    if (!textareaRef.current || isCommentsOpen) return;
    if (textareaRef.current.selectionStart !== textareaRef.current.selectionEnd) {
      setSelectedPosition(textareaRef.current.selectionStart);
      setIsCommentsOpen(true);
    }
  };

  // --- Cursor Rendering ---
  const getCoordsFromIndex = (index: number): { x: number; y: number; height: number } | null => {
    const textarea = textareaRef.current;
    // FIX: Add check for document prop existence before accessing window.document
    if (!textarea || typeof editorContent !== 'string' || index < 0 || index > editorContent.length || typeof window === 'undefined') {
      return null;
    }

    const measureDiv = window.document.createElement('div');
    const styles = window.getComputedStyle(textarea);
    [ /* ... styles props ... */
        'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
        'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom',
        'borderTopWidth', 'borderLeftWidth', 'borderRightWidth', 'borderBottomWidth',
        'width', 'boxSizing', 'whiteSpace', 'wordWrap', 'wordBreak', 'tabSize'
    ].forEach(prop => { (measureDiv.style as any)[prop] = (styles as any)[prop]; });
    measureDiv.style.position = 'absolute';
    measureDiv.style.top = '-9999px';
    measureDiv.style.left = '-9999px';
    measureDiv.style.height = 'auto';
    measureDiv.style.visibility = 'hidden';

    const textBefore = editorContent.substring(0, index);
    const markerSpan = window.document.createElement('span');
    // Use zero-width space as marker to avoid layout shifts
    markerSpan.textContent = '\u200B';

    measureDiv.textContent = textBefore;
    measureDiv.appendChild(markerSpan);
    window.document.body.appendChild(measureDiv);

    const markerRect = markerSpan.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    const x = markerRect.left - textareaRect.left - parseFloat(styles.borderLeftWidth || '0') - parseFloat(styles.paddingLeft || '0') + textarea.scrollLeft;
    const y = markerRect.top - textareaRect.top - parseFloat(styles.borderTopWidth || '0') - parseFloat(styles.paddingTop || '0') + textarea.scrollTop;
    const height = markerRect.height || parseFloat(styles.lineHeight || '0');

    window.document.body.removeChild(measureDiv);

    return { x, y, height };
  };

  const renderCursors = () => {
    if (!textareaRef.current) return null;
    return activeUsers
      .filter(user => user.cursor && user.cursor.anchor !== null)
      .map((user) => {
        try {
          const coords = getCoordsFromIndex(user.cursor!.anchor!);
          if (!coords) return null;
          return (
            <TooltipProvider key={`${user.id}-cursor`}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div aria-hidden="true" className="absolute w-0.5 animate-pulse"
                    style={{
                      top: `${coords.y}px`, left: `${coords.x}px`, height: `${coords.height}px`,
                      backgroundColor: user.color, opacity: 0.9, zIndex: 10
                    }} />
                </TooltipTrigger>
                <TooltipContent><p>{user.full_name || user.email || "User"}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        } catch (e) { console.error("Error rendering cursor for user", user.id, e); return null; }
      });
  };

  // --- Render JSX ---
  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-sm">
         <div className="container flex h-16 items-center justify-between gap-2 px-4 md:px-6">
             {/* Left Side */}
             <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="rounded-full flex-shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
                <div className="flex items-center gap-2 min-w-0 flex-grow">
                    <Input type="text" value={title} onChange={handleTitleChange} className="border-none bg-transparent text-lg font-semibold focus:outline-none focus:ring-0 p-0 h-auto truncate flex-grow" placeholder="Untitled Document" aria-label="Document Title"/>
                    {isSavingTitle && (<div className="flex items-center text-sm text-muted-foreground flex-shrink-0" aria-live="polite"><Loader2 className="mr-1 h-3 w-3 animate-spin" /><span className="hidden sm:inline">Saving title...</span></div>)}
                    {provider && !provider.synced && (<div className="flex items-center text-sm text-yellow-600 flex-shrink-0" aria-live="polite"><Loader2 className="mr-1 h-3 w-3 animate-spin" /><span className="hidden sm:inline">Syncing...</span></div>)}
                </div>
             </div>
             {/* Right Side */}
             <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <Tabs value={view} onValueChange={(v) => setView(v as any)} className="hidden md:block"><TabsList><TabsTrigger value="editor">Editor</TabsTrigger><TabsTrigger value="split">Split</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList></Tabs>
                {/* Avatars */}
                <div className="flex -space-x-2 items-center" aria-label="Active collaborators">
                    {currentUser && (<TooltipProvider><Tooltip><TooltipTrigger asChild><Avatar className="h-8 w-8 border-2 border-background ring-2 ring-primary"><AvatarImage src={currentUser.avatar_url || ""} alt={currentUser.email} /><AvatarFallback>{currentUser.email?.charAt(0).toUpperCase() || 'Me'}</AvatarFallback></Avatar></TooltipTrigger><TooltipContent><p>You ({currentUser.email})</p></TooltipContent></Tooltip></TooltipProvider>)}
                    {activeUsers.slice(0, 3).map((user) => (<TooltipProvider key={user.id}><Tooltip><TooltipTrigger asChild><Avatar className="h-8 w-8 border-2 border-background" style={{ backgroundColor: user.color }}><AvatarImage src={user.avatar_url || ""} alt={user.email} /><AvatarFallback className="text-white text-xs font-semibold">{user.full_name?.split(' ').map(n=>n[0]).slice(0,2).join('') || user.email?.charAt(0).toUpperCase() || '?'}</AvatarFallback></Avatar></TooltipTrigger><TooltipContent><p>{user.full_name || user.email}</p></TooltipContent></Tooltip></TooltipProvider>))}
                    {activeUsers.length > 3 && (<Avatar className="h-8 w-8 border-2 border-background bg-muted"><AvatarFallback>+{activeUsers.length - 3}</AvatarFallback></Avatar>)}
                </div>
                {/* Buttons */}
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant={isCommentsOpen ? "secondary" : "ghost"} size="icon" className="rounded-full relative" onClick={() => setIsCommentsOpen(!isCommentsOpen)} aria-label={isCommentsOpen ? "Close Comments" : "Open Comments"} aria-expanded={isCommentsOpen}><MessageSquare className="h-4 w-4" />{comments.length > 0 && (<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground" aria-label={`${comments.length} comments`}>{comments.length}</span>)}</Button></TooltipTrigger><TooltipContent><p>Comments</p></TooltipContent></Tooltip></TooltipProvider>
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsShareDialogOpen(true)} aria-label="Share Document"><Share className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Share</p></TooltipContent></Tooltip></TooltipProvider>
             </div>
         </div>
      </header>

      {/* Main Content Area */}
      <div className={`grid flex-1 overflow-hidden ${isCommentsOpen ? 'grid-cols-[1fr_auto]' : 'grid-cols-1'}`}>
        {/* Editor/Preview Pane */}
        <div className="grid h-full overflow-hidden">
            {/* Split View */}
            {view === "split" && (
                <div className="grid md:grid-cols-2 h-full overflow-hidden">
                    <div className="relative h-full border-r overflow-hidden">
                        <Textarea ref={textareaRef} value={editorContent} onChange={(e) => handleEditorChange(e.target.value)} onSelect={() => { updateAwarenessCursor(); handleTextSelection(); }} onClick={updateAwarenessCursor} onFocus={updateAwarenessCursor} onKeyUp={updateAwarenessCursor} className="absolute inset-0 w-full h-full resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0 whitespace-pre-wrap overflow-auto" placeholder="Start writing..." aria-label="Markdown Editor"/>
                        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">{renderCursors()}</div>
                    </div>
                    <ScrollArea className="p-4 h-full" aria-label="Markdown Preview"><div className="prose max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked(editorContent || '') }} /></ScrollArea>
                </div>
            )}
            {/* Editor Only View */}
            {view === "editor" && (
                <div className="relative h-full overflow-hidden">
                    <Textarea ref={textareaRef} value={editorContent} onChange={(e) => handleEditorChange(e.target.value)} onSelect={() => { updateAwarenessCursor(); handleTextSelection(); }} onClick={updateAwarenessCursor} onFocus={updateAwarenessCursor} onKeyUp={updateAwarenessCursor} className="absolute inset-0 w-full h-full resize-none border-0 p-4 font-mono text-sm focus-visible:ring-0 whitespace-pre-wrap overflow-auto" placeholder="Start writing..." aria-label="Markdown Editor"/>
                    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">{renderCursors()}</div>
                </div>
            )}
            {/* Preview Only View */}
            {view === "preview" && (
                <ScrollArea className="p-4 h-full" aria-label="Markdown Preview"><div className="prose max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: marked(editorContent || '') }}/></ScrollArea>
            )}
        </div>

        {/* Comments Sidebar */}
        {isCommentsOpen && (
            <aside className="w-80 border-l bg-background z-10 flex flex-col h-full" aria-label="Comments Section">
                <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
                    <h3 className="font-semibold text-lg">Comments</h3>
                    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => { setIsCommentsOpen(false); setSelectedPosition(null); }} aria-label="Close Comments"><CloseIcon className="h-5 w-5" /></Button>
                </div>
                {/* New Comment Input */}
                {selectedPosition !== null && (
                    <div className="p-4 border-b flex-shrink-0 bg-muted/50">
                        <h4 className="text-sm font-medium mb-2">Add Comment</h4>
                        <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." className="min-h-[80px] text-sm" rows={3} aria-label="New comment input"/>
                        <div className="flex justify-end mt-2 gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedPosition(null)}>Cancel</Button><Button size="sm" onClick={addComment} disabled={!newComment.trim() || isLoading}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button></div>
                    </div>
                )}
                {/* Comments List */}
                <ScrollArea className="flex-1"><div className="p-4">
                    {comments.length === 0 && selectedPosition === null ? (<div className="text-center text-muted-foreground py-8"><MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No comments yet</p><p className="text-xs mt-1">Select text to add one.</p></div>)
                    : (<div className="space-y-4">{comments.map((comment) => (<Comment key={comment.id} comment={comment} />))}</div>)}
                </div></ScrollArea>
            </aside>
        )}
      </div>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>Share Document</DialogTitle><DialogDescription>Enter the email of the user you want to collaborate with.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4"><div className="space-y-2"><Label htmlFor="share-email">Email address</Label><Input id="share-email" type="email" placeholder="collaborator@example.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)}/></div></div>
              <DialogFooter><Button variant="outline" onClick={() => setIsShareDialogOpen(false)} disabled={isLoading}>Cancel</Button><Button onClick={handleShare} disabled={isLoading || !shareEmail.trim()}>{isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share className="h-4 w-4 mr-2" />}Share</Button></DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}