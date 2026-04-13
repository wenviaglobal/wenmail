import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Mail, Inbox, Send, Trash2, Archive, Star, AlertTriangle, RefreshCw,
  Pencil, ArrowLeft, LogOut, Menu, X, Folder, Search, Reply, ReplyAll,
  Forward, Paperclip, Download, CheckSquare, Square, StarOff,
  MailOpen, MailCheck, Settings, Save, Eye, EyeOff, ChevronDown, ChevronUp,
  Minus, Maximize2, Minimize2, Printer, Users, FileText, CalendarClock, Tag,
} from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";
import { EmailChips } from "../../components/email-chips";
import { RichEditor } from "../../components/rich-editor";

const API = "/api/webmail";
function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("webmailToken")}` };
}
async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers(), ...opts?.headers } });
  if (res.status === 401) { localStorage.removeItem("webmailToken"); window.location.href = "/mail/login"; throw new Error("Unauthorized"); }
  return res.json();
}

interface Attachment { id: number; filename: string; contentType: string; size: number; isImage?: boolean; preview?: string; }
interface MsgSummary {
  uid: number; from: { name: string; address: string } | null;
  to: { name: string; address: string }[]; subject: string; date: string | null;
  seen: boolean; flagged: boolean; hasAttachment?: boolean; size: number; messageId?: string;
}
interface MsgDetail extends MsgSummary {
  text: string; html: string; contentType: string; attachments: Attachment[];
  cc: { name: string; address: string }[]; inReplyTo: string | null; references: string | null;
  replyTo: { name: string; address: string }[];
}
interface FolderInfo { name: string; path: string; specialUse: string | null; messages: number; unseen: number; }

const folderIcons: Record<string, typeof Inbox> = {
  "\\Inbox": Inbox, "\\Sent": Send, "\\Trash": Trash2, "\\Drafts": Pencil, "\\Junk": AlertTriangle, "\\Archive": Archive,
};

function formatDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d), now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}
async function downloadAttachment(uid: number, attId: number, folder: string, filename: string) {
  const res = await fetch(`${API}/message/${uid}/attachment/${attId}?folder=${encodeURIComponent(folder)}`, { headers: headers() });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function addrStr(a: { name: string; address: string } | null) { return a ? (a.name ? `${a.name} <${a.address}>` : a.address) : ""; }

// Toast for undo send
function UndoToast({ message, onUndo, onDone }: { message: string; onUndo: () => void; onDone: () => void }) {
  const [remaining, setRemaining] = useState(5);
  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-slate-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in fade-in">
      <span className="text-sm">{message}</span>
      <span className="text-xs text-gray-400">{remaining}s</span>
      <button onClick={onUndo} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition">Undo</button>
    </div>
  );
}

export function WebmailApp() {
  const navigate = useNavigate();
  const email = localStorage.getItem("webmailEmail") || "";
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [currentFolder, setCurrentFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MsgSummary[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<MsgDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [compose, setCompose] = useState<{ mode: "new" | "reply" | "replyAll" | "forward"; original?: MsgDetail; draftUid?: number } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [starredFilter, setStarredFilter] = useState(false);
  const PAGE_SIZE = parseInt(localStorage.getItem("wenmail-page-size") || "30") || 30;

  const loadFolders = useCallback(async () => { try { setFolders(await api("/folders")); } catch {} }, []);
  const loadMessages = useCallback(async (folder: string, p = 1) => {
    setLoading(true); setSelectedMsg(null); setSelected(new Set());
    try { const d = await api(`/messages?folder=${encodeURIComponent(folder)}&page=${p}&limit=${PAGE_SIZE}`); setMessages(d.messages || []); setTotal(d.total || 0); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("webmailToken")) { navigate("/mail/login"); return; }
    loadFolders(); loadMessages("INBOX");
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as any)?.contentEditable === "true") return;
      if (e.key === "c" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setCompose({ mode: "new" }); }
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && selectedMsg) { e.preventDefault(); startReply(selectedMsg, "reply"); }
      if (e.key === "a" && !e.ctrlKey && !e.metaKey && selectedMsg) { e.preventDefault(); startReply(selectedMsg, "replyAll"); }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey && selectedMsg) { e.preventDefault(); startReply(selectedMsg, "forward"); }
      if (e.key === "Escape") { if (selectedMsg) setSelectedMsg(null); }
      if (e.key === "/" && !e.ctrlKey) { e.preventDefault(); document.querySelector<HTMLInputElement>("[placeholder='Search...']")?.focus(); }
      if (e.key === "Delete" && selectedMsg) { handleDelete([selectedMsg.uid]); }
      if (e.key === "e" && selectedMsg) { moveMessages([selectedMsg.uid], currentFolder === "Archive" ? "INBOX" : "Archive"); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedMsg, currentFolder]);

  async function openMessage(uid: number) {
    setLoading(true);
    try {
      const d = await api(`/message/${uid}?folder=${encodeURIComponent(currentFolder)}`);
      // If opening a draft, open in compose mode to continue editing
      if (currentFolder === "Drafts") {
        setCompose({ mode: "new", original: d, draftUid: uid });
        setLoading(false);
        return;
      }
      setSelectedMsg(d);
      // Mark as read in local state immediately
      setMessages(prev => [...prev.map(m => m.uid === uid ? { ...m, seen: true } : m)]);
      // Refresh folder unread counts
      loadFolders();
    } catch {}
    setLoading(false);
  }

  async function moveMessages(uids: number[], toFolder: string) {
    if (toFolder === "Archive") await api("/ensure-folder", { method: "POST", body: JSON.stringify({ folder: toFolder }) }).catch(() => {});
    await api("/move", { method: "POST", body: JSON.stringify({ uids, fromFolder: currentFolder, toFolder }) });
    setSelectedMsg(null); setSelected(new Set()); loadMessages(currentFolder, page); loadFolders();
  }

  async function deleteMessages(uids: number[]) {
    await api("/delete", { method: "POST", body: JSON.stringify({ uids, folder: currentFolder }) });
    setSelectedMsg(null); setSelected(new Set()); loadMessages(currentFolder); loadFolders();
  }

  const isTrashOrJunk = currentFolder === "Trash" || currentFolder === "Junk";

  function handleDelete(uids: number[]) {
    if (isTrashOrJunk) deleteMessages(uids);
    else moveMessages(uids, "Trash");
  }

  async function flagMessages(uids: number[], flag: string, add: boolean) {
    await api("/flag", { method: "POST", body: JSON.stringify({ uids, folder: currentFolder, flag, add }) });
    loadMessages(currentFolder); loadFolders();
  }

  async function doSearch() {
    if (!searchQuery.trim()) { loadMessages(currentFolder); return; }
    setSearching(true); setSelectedMsg(null);
    try { const d = await api(`/search?folder=${encodeURIComponent(currentFolder)}&q=${encodeURIComponent(searchQuery)}`); setMessages(d.messages || []); setTotal(d.total || 0); } catch {}
    setSearching(false);
  }

  function selectFolder(path: string) { setCurrentFolder(path); setSearchQuery(""); setPage(1); setStarredFilter(false); loadMessages(path, 1); setSidebarOpen(false); }
  function goToPage(p: number) { setPage(p); loadMessages(currentFolder, p); }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Group by conversation (clean subject)
  const cleanSubject = (s: string) => s.replace(/^(Re:|Fwd?:|Fw:)\s*/gi, "").trim().toLowerCase();
  const threadView = localStorage.getItem("wenmail-thread-view") !== "false";

  const displayMessages = (() => {
    let msgs = starredFilter ? messages.filter(m => m.flagged) : messages;
    if (!threadView) return msgs;
    // Group by clean subject — show latest per thread with count
    const threads = new Map<string, { latest: MsgSummary; count: number; uids: number[] }>();
    for (const m of msgs) {
      const key = cleanSubject(m.subject);
      const existing = threads.get(key);
      if (!existing) {
        threads.set(key, { latest: m, count: 1, uids: [m.uid] });
      } else {
        existing.count++;
        existing.uids.push(m.uid);
        if (new Date(m.date || 0) > new Date(existing.latest.date || 0)) existing.latest = m;
      }
    }
    return Array.from(threads.values()).map(t => ({ ...t.latest, _threadCount: t.count, _threadUids: t.uids }));
  })();
  function handleLogout() { api("/logout", { method: "POST" }).catch(() => {}); localStorage.removeItem("webmailToken"); localStorage.removeItem("webmailEmail"); navigate("/mail/login"); }
  function toggleSelect(uid: number) { setSelected(prev => { const s = new Set(prev); s.has(uid) ? s.delete(uid) : s.add(uid); return s; }); }
  function selectAll() { setSelected(prev => prev.size === displayMessages.length ? new Set() : new Set(displayMessages.map(m => m.uid))); }

  function startReply(msg: MsgDetail, mode: "reply" | "replyAll" | "forward") { setCompose({ mode, original: msg }); }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center"><Mail size={16} className="text-white" /></div>
            <span className="font-bold dark:text-white"><span className="text-indigo-600">Wen</span>Mail</span>
          </div>
          <button className="lg:hidden text-gray-400" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>
        <div className="p-3">
          <button onClick={() => { setCompose({ mode: "new" }); setSidebarOpen(false); }}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm">
            <Pencil size={16} /> Compose
          </button>
        </div>
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {folders.map(f => {
            const Icon = folderIcons[f.specialUse || ""] || Folder;
            return (
              <button key={f.path} onClick={() => selectFolder(f.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${f.path === currentFolder && !starredFilter ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium border-l-[3px] border-l-indigo-500 pl-[9px]" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/70 hover:pl-4"}`}>
                <Icon size={16} /><span className="flex-1 text-left">{f.name}</span>
                {f.unseen > 0 && <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">{f.unseen}</span>}
              </button>
            );
          })}
          {/* Starred filter */}
          <button onClick={() => { setStarredFilter(!starredFilter); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${starredFilter ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 font-medium border-l-[3px] border-l-yellow-500 pl-[9px]" : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/70 hover:pl-4"}`}>
            <Star size={16} /><span className="flex-1 text-left">Starred</span>
          </button>
        </nav>
        <div className="p-3 border-t border-gray-200 dark:border-slate-700">
          <p className="text-xs text-gray-500 dark:text-slate-500 truncate mb-2">{email}</p>
          <div className="flex items-center justify-between">
            <button onClick={handleLogout} className="text-xs text-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-150"><LogOut size={14} /> Logout</button>
            <div className="flex items-center gap-1">
              <button onClick={() => navigate("/mail/contacts")} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Contacts"><Users size={16} /></button>
              <button onClick={() => { setShowSettings(true); setSidebarOpen(false); }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Settings"><Settings size={16} /></button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button className="lg:hidden text-gray-500 dark:text-slate-400" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <h2 className="font-semibold text-gray-800 dark:text-white text-sm">{starredFilter ? "Starred" : currentFolder === "INBOX" ? "Inbox" : currentFolder}</h2>
          <div className="flex-1" />
          {/* Search */}
          <form onSubmit={e => { e.preventDefault(); doSearch(); }} className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg px-2 py-1">
            <Search size={14} className="text-gray-400" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
              className="bg-transparent text-sm outline-none w-24 md:w-48 dark:text-white" />
          </form>
          <span className="text-xs text-gray-400 dark:text-slate-500 hidden md:block">{total}</span>
          <button onClick={() => { setSearchQuery(""); setStarredFilter(false); loadMessages(currentFolder, page); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <RefreshCw size={14} className={loading || searching ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800 text-sm">
            <span className="text-indigo-700 dark:text-indigo-400 font-medium">{selected.size} selected</span>
            <button onClick={() => handleDelete([...selected])} className="text-red-600 hover:text-red-800 flex items-center gap-1 text-xs"><Trash2 size={12} /> {isTrashOrJunk ? "Delete Forever" : "Delete"}</button>
            <button onClick={() => moveMessages([...selected], currentFolder === "Archive" ? "INBOX" : "Archive")} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"><Archive size={12} /> {currentFolder === "Archive" ? "Unarchive" : "Archive"}</button>
            <button onClick={() => flagMessages([...selected], "\\Seen", true)} className="text-gray-600 hover:text-gray-800 flex items-center gap-1 text-xs"><MailCheck size={12} /> Read</button>
            <button onClick={() => flagMessages([...selected], "\\Seen", false)} className="text-gray-600 hover:text-gray-800 flex items-center gap-1 text-xs"><MailOpen size={12} /> Unread</button>
            {displayMessages.filter(m => selected.has(m.uid)).every(m => m.flagged)
              ? <button onClick={() => flagMessages([...selected], "\\Flagged", false)} className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1 text-xs"><StarOff size={12} /> Unstar</button>
              : <button onClick={() => flagMessages([...selected], "\\Flagged", true)} className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1 text-xs"><Star size={12} /> Star</button>
            }
            <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-500 text-xs">Clear</button>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Message list */}
          <div className={`${selectedMsg ? "hidden md:flex" : "flex"} flex-col w-full md:w-96 border-r border-gray-200 dark:border-slate-700 overflow-y-auto bg-white dark:bg-slate-800`}>
            {/* Select all */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800">
              <button onClick={selectAll} className="text-gray-400 hover:text-gray-600">
                {selected.size === displayMessages.length && displayMessages.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <span className="text-xs text-gray-400">{displayMessages.length > 0 ? `${displayMessages.length} messages` : ""}</span>
            </div>

            {displayMessages.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                {starredFilter ? "No starred messages" : searchQuery ? "No results" : "No messages"}
              </div>
            )}
            {displayMessages.map(msg => (
              <div key={msg.uid}
                className={`flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-slate-700/50 hover:bg-indigo-50/50 dark:hover:bg-slate-700/70 cursor-pointer transition-all duration-150 ${selectedMsg?.uid === msg.uid ? "bg-indigo-50 dark:bg-indigo-900/25 border-l-[3px] border-l-indigo-500 pl-[9px]" : "border-l-[3px] border-l-transparent"} ${!msg.seen ? "bg-blue-50/30 dark:bg-blue-900/10" : ""}`}>
                <button onClick={e => { e.stopPropagation(); toggleSelect(msg.uid); }} className="mt-1 text-gray-300 hover:text-gray-500 shrink-0">
                  {selected.has(msg.uid) ? <CheckSquare size={14} className="text-indigo-600" /> : <Square size={14} />}
                </button>
                <button onClick={e => { e.stopPropagation(); flagMessages([msg.uid], "\\Flagged", !msg.flagged); }}
                  className={`mt-1 shrink-0 ${msg.flagged ? "text-yellow-500" : "text-gray-300 hover:text-yellow-500"}`}>
                  {msg.flagged ? <Star size={14} /> : <StarOff size={14} />}
                </button>
                <SenderAvatar name={msg.from?.name || msg.from?.address || "?"} />
                <div className="flex-1 min-w-0" onClick={() => openMessage(msg.uid)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm truncate flex-1 ${!msg.seen ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-slate-400"}`}>
                      {msg.from?.name || msg.from?.address || "Unknown"}
                    </span>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {(msg as any)._threadCount > 1 && <span className="text-xs bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 px-1 rounded font-medium">{(msg as any)._threadCount}</span>}
                      {msg.hasAttachment && <Paperclip size={10} className="text-gray-400" />}
                      <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(msg.date)}</span>
                    </div>
                  </div>
                  <div className={`text-sm truncate ${!msg.seen ? "font-medium text-gray-800 dark:text-slate-200" : "text-gray-500 dark:text-slate-400"}`}>
                    {msg.subject}
                  </div>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && !starredFilter && (
              <div className="flex items-center justify-center gap-2 py-2 border-t border-gray-100 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800 shrink-0">
                <button onClick={() => goToPage(page - 1)} disabled={page <= 1}
                  className="px-2 py-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 disabled:opacity-30">&lt; Prev</button>
                <span className="text-xs text-gray-400 dark:text-slate-500">Page {page} of {totalPages}</span>
                <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}
                  className="px-2 py-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 disabled:opacity-30">Next &gt;</button>
              </div>
            )}
          </div>

          {/* Message detail */}
          {selectedMsg ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-800">
              <div className="px-4 md:px-6 py-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => setSelectedMsg(null)} className="md:hidden text-gray-500"><ArrowLeft size={20} /></button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1 truncate">{selectedMsg.subject}</h3>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                      {selectedMsg.from?.name || selectedMsg.from?.address}
                      {selectedMsg.from?.name && <span className="text-gray-400 dark:text-slate-500 font-normal ml-1 text-xs">&lt;{selectedMsg.from.address}&gt;</span>}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                      To: {selectedMsg.to.map(t => t.address).join(", ")}
                      {selectedMsg.cc?.length > 0 && ` | Cc: ${selectedMsg.cc.map(t => t.address).join(", ")}`}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">{selectedMsg.date ? new Date(selectedMsg.date).toLocaleString() : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startReply(selectedMsg, "reply")} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded" title="Reply"><Reply size={16} /></button>
                    <button onClick={() => startReply(selectedMsg, "replyAll")} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded" title="Reply All"><ReplyAll size={16} /></button>
                    <button onClick={() => startReply(selectedMsg, "forward")} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded" title="Forward"><Forward size={16} /></button>
                    <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />
                    <button onClick={() => handleDelete([selectedMsg.uid])} className="p-1.5 text-gray-400 hover:text-red-500 rounded" title={isTrashOrJunk ? "Delete Forever" : "Delete"}><Trash2 size={16} /></button>
                    <button onClick={() => moveMessages([selectedMsg.uid], currentFolder === "Archive" ? "INBOX" : "Archive")} className="p-1.5 text-gray-400 hover:text-blue-500 rounded" title={currentFolder === "Archive" ? "Unarchive" : "Archive"}><Archive size={16} /></button>
                    <div className="relative group/label">
                      <button className="p-1.5 text-gray-400 hover:text-purple-500 rounded" title="Label"><Tag size={16} /></button>
                      <div className="hidden group-hover/label:block absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
                        {["Important", "Work", "Personal", "Urgent", "Follow-up"].map(label => (
                          <button key={label} onClick={() => api("/label", { method: "POST", body: JSON.stringify({ uids: [selectedMsg.uid], folder: currentFolder, label, add: true }) }).then(() => loadMessages(currentFolder, page))}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${label === "Important" ? "bg-red-500" : label === "Work" ? "bg-blue-500" : label === "Personal" ? "bg-green-500" : label === "Urgent" ? "bg-orange-500" : "bg-purple-500"}`} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(`<html><head><title>${selectedMsg.subject}</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:20px}h1{font-size:20px}pre{white-space:pre-wrap}.meta{color:#666;font-size:14px;margin-bottom:20px}</style></head><body><h1>${selectedMsg.subject}</h1><div class="meta"><strong>From:</strong> ${selectedMsg.from?.address}<br><strong>To:</strong> ${selectedMsg.to.map(t=>t.address).join(", ")}<br><strong>Date:</strong> ${selectedMsg.date ? new Date(selectedMsg.date).toLocaleString() : ""}</div>${selectedMsg.contentType === "html" && selectedMsg.html ? selectedMsg.html : `<pre>${selectedMsg.text}</pre>`}</body></html>`); w.document.close(); w.print(); } }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Print"><Printer size={16} /></button>
                    <button onClick={() => flagMessages([selectedMsg.uid], "\\Flagged", !selectedMsg.flagged)} className={`p-1.5 rounded ${selectedMsg.flagged ? "text-yellow-500" : "text-gray-400 hover:text-yellow-500"}`} title="Star"><Star size={16} /></button>
                  </div>
                </div>
              </div>

              {/* Attachments bar */}
              {selectedMsg.attachments?.length > 0 && (
                <div className="px-4 md:px-6 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
                  <div className="flex items-center gap-2 mb-2">
                    <Paperclip size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500 dark:text-slate-400">{selectedMsg.attachments.length} attachment(s)</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {selectedMsg.attachments.map(att => {
                      const doDownload = () => downloadAttachment(selectedMsg.uid, att.id, currentFolder, att.filename);
                      const ct = att.contentType?.toLowerCase() || "";
                      const isImage = att.isImage && att.preview;
                      const isVideo = ct.startsWith("video/");
                      const isPdf = ct === "application/pdf";
                      const isAudio = ct.startsWith("audio/");
                      const isText = ct.startsWith("text/") && !ct.includes("html");

                      // Image preview
                      if (isImage) {
                        return (
                          <div key={att.id} className="relative group cursor-pointer" onClick={doDownload}>
                            <img src={att.preview} alt={att.filename}
                              className="max-h-44 max-w-64 rounded-lg border border-gray-200 dark:border-slate-600 object-contain bg-white dark:bg-slate-700" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                              <span className="bg-white dark:bg-slate-800 text-gray-700 dark:text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-lg">
                                <Download size={12} /> Save ({formatSize(att.size)})
                              </span>
                            </div>
                          </div>
                        );
                      }

                      // Video preview
                      if (isVideo) {
                        return <AttachmentMediaPreview key={att.id} att={att} uid={selectedMsg.uid} folder={currentFolder} type="video" onDownload={doDownload} />;
                      }

                      // Audio preview
                      if (isAudio) {
                        return <AttachmentMediaPreview key={att.id} att={att} uid={selectedMsg.uid} folder={currentFolder} type="audio" onDownload={doDownload} />;
                      }

                      // PDF preview
                      if (isPdf) {
                        return <AttachmentMediaPreview key={att.id} att={att} uid={selectedMsg.uid} folder={currentFolder} type="pdf" onDownload={doDownload} />;
                      }

                      // Default download button
                      return (
                        <button key={att.id} onClick={doDownload}
                          className="inline-flex items-center gap-1.5 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-600">
                          <Download size={12} /> {att.filename} <span className="text-gray-400">({formatSize(att.size)})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {selectedMsg.contentType === "html" && selectedMsg.html ? (
                  <div className="prose dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selectedMsg.html }} />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-300 font-sans">{selectedMsg.text}</pre>
                )}
              </div>

              {/* Quick reply */}
              <div className="px-4 md:px-6 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/80">
                <button onClick={() => startReply(selectedMsg, "reply")}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
                  <Reply size={14} /> Click here to reply
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50 dark:bg-slate-900">
              <div className="text-center text-gray-400 dark:text-slate-600">
                <Mail size={48} className="mx-auto mb-3 opacity-30" />
                <p>Select a message to read</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {compose && <ComposeModal email={email} compose={compose} onClose={() => setCompose(null)} onSent={() => { setCompose(null); loadFolders(); loadMessages(currentFolder); }} />}

      {/* Settings modal */}
      {showSettings && <SettingsModal email={email} onClose={() => setShowSettings(false)} />}

    </div>
  );
}

// ==========================================
// COMPOSE MODAL
// ==========================================

// ==========================================
// SENDER AVATAR
// ==========================================

const avatarColors = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-cyan-500", "bg-orange-500"];

function SenderAvatar({ name }: { name: string }) {
  const initial = (name[0] || "?").toUpperCase();
  const colorIndex = name.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0) % avatarColors.length;
  return (
    <div className={`shrink-0 w-8 h-8 rounded-full ${avatarColors[colorIndex]} flex items-center justify-center text-white text-xs font-bold mt-0.5`}>
      {initial}
    </div>
  );
}

// ==========================================
// ATTACHMENT MEDIA PREVIEW (video, audio, pdf)
// ==========================================

function AttachmentMediaPreview({ att, uid, folder, type, onDownload }: {
  att: Attachment; uid: number; folder: string; type: "video" | "audio" | "pdf"; onDownload: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    if (blobUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/message/${uid}/attachment/${att.id}?folder=${encodeURIComponent(folder)}`, { headers: headers() });
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
    } catch {}
    setLoading(false);
  }

  // Auto-load for audio (small), manual for video/pdf (large)
  useEffect(() => { if (type === "audio") loadPreview(); }, []);

  if (type === "video") {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden bg-black max-w-sm">
        {blobUrl ? (
          <video src={blobUrl} controls className="max-h-48 max-w-full" />
        ) : (
          <button onClick={loadPreview} className="flex flex-col items-center justify-center w-64 h-36 bg-gray-900 hover:bg-gray-800 transition text-white">
            {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Mail size={24} className="mb-2 opacity-50" />}
            <span className="text-xs mt-1">{loading ? "Loading..." : "Click to preview video"}</span>
            <span className="text-xs text-gray-400 mt-0.5">{att.filename} ({formatSize(att.size)})</span>
          </button>
        )}
        <div className="flex items-center justify-between px-2 py-1 bg-gray-900">
          <span className="text-xs text-gray-400 truncate">{att.filename}</span>
          <button onClick={onDownload} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Download size={10} /> Save</button>
        </div>
      </div>
    );
  }

  if (type === "audio") {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 min-w-[250px]">
        <p className="text-xs font-medium dark:text-white mb-2 truncate">{att.filename}</p>
        {blobUrl ? (
          <audio src={blobUrl} controls className="w-full h-8" />
        ) : (
          <div className="text-xs text-gray-400">Loading...</div>
        )}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">{formatSize(att.size)}</span>
          <button onClick={onDownload} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"><Download size={10} /> Save</button>
        </div>
      </div>
    );
  }

  if (type === "pdf") {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden max-w-sm">
        {blobUrl ? (
          <iframe src={blobUrl} className="w-80 h-48 bg-white" title={att.filename} />
        ) : (
          <button onClick={loadPreview} className="flex flex-col items-center justify-center w-64 h-36 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 transition">
            {loading ? <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> : <span className="text-2xl mb-1">📄</span>}
            <span className="text-xs text-gray-600 dark:text-slate-300 mt-1">{loading ? "Loading..." : "Click to preview PDF"}</span>
            <span className="text-xs text-gray-400 mt-0.5">{att.filename} ({formatSize(att.size)})</span>
          </button>
        )}
        <div className="flex items-center justify-between px-2 py-1 bg-gray-100 dark:bg-slate-800">
          <span className="text-xs text-gray-500 dark:text-slate-400 truncate">{att.filename}</span>
          <button onClick={onDownload} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"><Download size={10} /> Save</button>
        </div>
      </div>
    );
  }

  return null;
}

interface ComposeProps {
  email: string;
  compose: { mode: "new" | "reply" | "replyAll" | "forward"; original?: MsgDetail; draftUid?: number };
  onClose: () => void;
  onSent: () => void;
}

function ComposeModal({ email, compose, onClose, onSent }: ComposeProps) {
  const { mode, original } = compose;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ filename: string; content: string; contentType: string; size: number }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [dragging, setDragging] = useState(false);
  const [windowState, setWindowState] = useState<"default" | "minimized" | "expanded">("default");
  const dragCounter = useRef(0);
  const totalAttachmentSize = attachments.reduce((sum, a) => sum + a.size, 0);

  const isDraft = !!compose.draftUid;
  const minimized = windowState === "minimized";
  const expanded = windowState === "expanded";

  // Drag and drop handlers
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  const prefillTo = () => {
    if (!original) return "";
    if (isDraft) return original.to?.map(t => t.address).join(", ") || "";
    if (mode === "reply") return original.replyTo?.[0]?.address || original.from?.address || "";
    if (mode === "replyAll") {
      const addrs = [original.from?.address, ...original.to.map(t => t.address), ...(original.cc || []).map(t => t.address)].filter(a => a && a !== email);
      return addrs.join(", ");
    }
    return "";
  };
  const prefillSubject = () => {
    if (!original) return "";
    if (isDraft) return original.subject || "";
    const subj = original.subject.replace(/^(Re:|Fwd?:)\s*/gi, "").trim();
    return mode === "forward" ? `Fwd: ${subj}` : `Re: ${subj}`;
  };
  const signature = localStorage.getItem("wenmail-signature") || "";
  const sigBlock = signature ? `\n\n--\n${signature}` : "";

  const prefillBody = () => {
    if (!original) return sigBlock;
    if (isDraft) return original.text || "";
    const date = original.date ? new Date(original.date).toLocaleString() : "";
    const from = addrStr(original.from);
    const header = `\n\nOn ${date}, ${from} wrote:\n`;
    const quoted = (original.text || "").split("\n").map(l => `> ${l}`).join("\n");
    if (mode === "forward") return `${sigBlock}\n\n---------- Forwarded message ----------\nFrom: ${from}\nDate: ${date}\nSubject: ${original.subject}\nTo: ${original.to.map(t => t.address).join(", ")}\n\n${original.text || ""}`;
    return `${sigBlock}${header}${quoted}`;
  };

  const [to, setTo] = useState<string[]>(prefillTo().split(/[,;\s]+/).filter(e => e.includes("@")));
  const [cc, setCc] = useState<string[]>(isDraft && original?.cc ? original.cc.map(c => c.address) : []);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(cc.length > 0);
  const [subject, setSubject] = useState(prefillSubject);
  const [text, setText] = useState(prefillBody);
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [templates, setTemplates] = useState<any[]>([]);

  async function handleSaveDraft() {
    setSavingDraft(true); setError("");
    try {
      await api("/draft", { method: "POST", body: JSON.stringify({ to: to.join(", "), subject, text, attachments: attachments.length > 0 ? attachments : undefined }) });
      // Delete old draft if editing one
      if (compose.draftUid) {
        await api(`/draft/${compose.draftUid}`, { method: "DELETE" }).catch(() => {});
      }
      onSent(); // Closes modal and refreshes
    } catch { setError("Failed to save draft"); }
    setSavingDraft(false);
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const fileList = Array.from(files);

    // Validate before reading
    for (const file of fileList) {
      if (file.size > 25 * 1024 * 1024) { setError(`"${file.name}" exceeds 25 MB limit (${formatSize(file.size)})`); return; }
    }
    const newTotal = totalAttachmentSize + fileList.reduce((s, f) => s + f.size, 0);
    if (newTotal > 25 * 1024 * 1024) { setError(`Total attachments would be ${formatSize(newTotal)} — max 25 MB`); return; }

    setUploading(true);
    let loaded = 0;
    const total = fileList.length;

    fileList.forEach(file => {
      setUploadProgress(`Reading ${file.name}...`);
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setAttachments(prev => [...prev, { filename: file.name, content: base64, contentType: file.type || "application/octet-stream", size: file.size }]);
        loaded++;
        if (loaded >= total) { setUploading(false); setUploadProgress(""); }
        else setUploadProgress(`Reading file ${loaded + 1} of ${total}...`);
      };
      reader.onerror = () => { setError(`Failed to read ${file.name}`); setUploading(false); setUploadProgress(""); };
      reader.readAsDataURL(file);
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError("");
    try {
      await api("/send", { method: "POST", body: JSON.stringify({
        to: to.join(", "), subject, text,
        html: html || undefined,
        cc: cc.length > 0 ? cc.join(", ") : undefined,
        bcc: bcc.length > 0 ? bcc.join(", ") : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
        inReplyTo: original?.messageId || undefined,
        references: original?.references ? `${original.references} ${original.messageId}` : original?.messageId || undefined,
      })});
      // Delete draft after successful send
      if (compose.draftUid) {
        await api(`/draft/${compose.draftUid}`, { method: "DELETE" }).catch(() => {});
      }
      onSent();
    } catch (err: any) {
      try {
        const body = await err?.response?.json?.();
        setError(body?.message || "Failed to send email — check attachment size");
      } catch { setError("Failed to send email — the message may be too large"); }
    }
    setSending(false);
  }

  return (
    <div className={`fixed z-50 transition-all ${minimized ? "bottom-0 right-4 w-80" : "inset-0 bg-black/50 flex items-end md:items-center justify-center"}`}>
      <div
        className={`bg-white dark:bg-slate-800 shadow-2xl flex flex-col transition-all relative ${
          minimized ? "rounded-t-xl h-12 border border-gray-200 dark:border-slate-700"
          : expanded ? "w-[95vw] h-[92vh] rounded-xl"
          : "w-full md:w-[680px] md:rounded-xl max-h-[90vh] md:max-h-[80vh]"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {dragging && !minimized && (
          <div className="absolute inset-0 bg-indigo-500/10 dark:bg-indigo-500/20 border-2 border-dashed border-indigo-500 rounded-xl z-50 flex items-center justify-center">
            <div className="text-center">
              <Paperclip size={32} className="text-indigo-500 mx-auto mb-2" />
              <p className="text-indigo-700 dark:text-indigo-300 font-semibold">Drop files to attach</p>
              <p className="text-indigo-500 text-xs mt-1">Max 25 MB per file</p>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-slate-700 shrink-0 cursor-pointer bg-gray-50 dark:bg-slate-800/80 rounded-t-xl" onClick={() => minimized && setWindowState("default")}>
          <h3 className="font-semibold dark:text-white text-sm truncate">
            {isDraft ? "Edit Draft" : mode === "new" ? "New Message" : mode === "reply" ? "Reply" : mode === "replyAll" ? "Reply All" : "Forward"}
            {minimized && to.length > 0 && <span className="text-gray-400 font-normal ml-2">— {to[0]}</span>}
          </h3>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={(e) => { e.stopPropagation(); setWindowState(minimized ? "default" : "minimized"); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition" title={minimized ? "Restore" : "Minimize"}>
              {minimized ? <ChevronUp size={14} /> : <Minus size={14} />}
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setWindowState(expanded ? "default" : "expanded"); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition" title={expanded ? "Restore" : "Full screen"}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition" title="Close"><X size={14} /></button>
          </div>
        </div>
        {!minimized && (
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden">
          {/* Header fields */}
          <div className="shrink-0">
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2 text-sm">
              <span className="text-gray-400 dark:text-slate-500 w-12 shrink-0">From:</span>
              <span className="text-gray-700 dark:text-slate-300">{email}</span>
            </div>
            <div className="px-4 py-1.5 border-b border-gray-100 dark:border-slate-700 flex items-start gap-2">
              <span className="text-gray-400 dark:text-slate-500 text-sm w-12 shrink-0 pt-1">To:</span>
              <div className="flex-1"><EmailChips value={to} onChange={setTo} placeholder="Add recipients..." /></div>
              {!showCcBcc && (
                <button type="button" onClick={() => setShowCcBcc(true)} className="text-xs text-indigo-500 hover:text-indigo-700 shrink-0 pt-1.5">
                  CC/BCC
                </button>
              )}
            </div>
            {showCcBcc && (
              <>
                <div className="px-4 py-1.5 border-b border-gray-100 dark:border-slate-700 flex items-start gap-2">
                  <span className="text-gray-400 dark:text-slate-500 text-sm w-12 shrink-0 pt-1">CC:</span>
                  <div className="flex-1"><EmailChips value={cc} onChange={setCc} placeholder="Add CC..." /></div>
                </div>
                <div className="px-4 py-1.5 border-b border-gray-100 dark:border-slate-700 flex items-start gap-2">
                  <span className="text-gray-400 dark:text-slate-500 text-sm w-12 shrink-0 pt-1">BCC:</span>
                  <div className="flex-1"><EmailChips value={bcc} onChange={setBcc} placeholder="Add BCC..." /></div>
                  <button type="button" onClick={() => setShowCcBcc(false)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0 pt-1.5">
                    <ChevronUp size={14} />
                  </button>
                </div>
              </>
            )}
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <span className="text-gray-400 dark:text-slate-500 text-sm w-12 shrink-0">Subj:</span>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
                className="flex-1 text-sm outline-none bg-transparent dark:text-white" />
            </div>
          </div>

          {/* Attachments — shrink-0 */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {attachments.map((att, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg px-2 py-1 text-xs">
                    <Paperclip size={10} /> {att.filename} <span className="text-gray-400">({formatSize(att.size)})</span>
                    <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1"><X size={10} /></button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{attachments.length} file(s), {formatSize(totalAttachmentSize)} total (max 25 MB per file)</p>
            </div>
          )}

          {/* Rich text editor — scrollable, takes remaining space */}
          <RichEditor content={text} onChange={(t, h) => { setText(t); setHtml(h); }} placeholder="Write your message..." />

          {/* Status messages — shrink-0 */}
          {uploading && (
            <div className="px-4 py-2 flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 shrink-0">
              <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              {uploadProgress}
            </div>
          )}
          {error && <div className="px-4 py-2 text-red-500 text-sm shrink-0">{error}</div>}

          {/* Template picker */}
          {showTemplates && templates.length > 0 && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 shrink-0 max-h-40 overflow-y-auto bg-gray-50 dark:bg-slate-800/50">
              <p className="text-xs text-gray-500 mb-2 font-medium">Choose a template:</p>
              <div className="grid grid-cols-2 gap-1">
                {templates.map((t: any) => (
                  <button key={t.id} type="button" onClick={() => {
                    setSubject(t.subject); setText(t.text); setHtml(t.html); setShowTemplates(false);
                  }} className="text-left px-2 py-1.5 text-xs bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded hover:border-indigo-400 transition">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-gray-400 ml-1">({t.category})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Schedule picker */}
          {showSchedule && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 shrink-0 bg-gray-50 dark:bg-slate-800/50 flex items-center gap-2">
              <CalendarClock size={14} className="text-green-500 shrink-0" />
              <input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                className="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm dark:bg-slate-700 dark:text-white" />
              <button type="button" disabled={!scheduleDate || to.length === 0} onClick={async () => {
                setSending(true); setError("");
                try {
                  await api("/schedule", { method: "POST", body: JSON.stringify({
                    to: to.join(", "), subject, text, html: html || undefined,
                    cc: cc.length > 0 ? cc.join(", ") : undefined,
                    scheduledAt: new Date(scheduleDate).toISOString(),
                    attachments: attachments.length > 0 ? attachments : undefined,
                  })});
                  onSent();
                } catch { setError("Failed to schedule"); }
                setSending(false);
              }} className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                Schedule
              </button>
              <button type="button" onClick={() => setShowSchedule(false)} className="text-gray-400 hover:text-gray-600 text-xs">Cancel</button>
            </div>
          )}

          {/* Footer — always visible at bottom */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={to.length === 0 || sending || uploading}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                <Send size={16} /> {sending ? "Sending..." : "Send"}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded flex items-center gap-1 text-xs" title="Attach file (max 25 MB)">
                <Paperclip size={16} /> {attachments.length === 0 ? "Attach" : ""}
              </button>
              <button type="button" onClick={handleSaveDraft} disabled={savingDraft}
                className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded flex items-center gap-1 text-sm" title="Save as Draft">
                <Save size={16} /> {savingDraft ? "Saving..." : "Draft"}
              </button>
              <button type="button" onClick={async () => {
                if (templates.length === 0) { try { setTemplates(await api("/templates")); } catch {} }
                setShowTemplates(!showTemplates);
              }} className="p-2 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded" title="Email Templates">
                <FileText size={16} />
              </button>
              <button type="button" onClick={() => setShowSchedule(!showSchedule)}
                className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded" title="Schedule Send">
                <CalendarClock size={16} />
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Discard</button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

// ==========================================
// SETTINGS MODAL
// ==========================================

function SettingsModal({ email, onClose }: { email: string; onClose: () => void }) {
  const hostname = "mail.wenvia.global";
  const [tab, setTab] = useState<"general" | "compose" | "account" | "setup">("general");
  const [pageSize, setPageSize] = useState(localStorage.getItem("wenmail-page-size") || "30");
  const [sig, setSig] = useState(localStorage.getItem("wenmail-signature") || "");
  const [displayName, setDisplayName] = useState(localStorage.getItem("wenmail-display-name") || "");
  const [saved, setSaved] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  function saveSettings() {
    localStorage.setItem("wenmail-page-size", pageSize);
    localStorage.setItem("wenmail-signature", sig);
    localStorage.setItem("wenmail-display-name", displayName);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true); setPwMsg("");
    try {
      const res = await api("/change-password", { method: "POST", body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
      if (res.token) localStorage.setItem("webmailToken", res.token);
      setPwMsg("Password changed successfully");
      setCurrentPw(""); setNewPw("");
    } catch { setPwMsg("Failed — check current password"); }
    setPwLoading(false);
  }

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "compose" as const, label: "Compose" },
    { id: "account" as const, label: "Account" },
    { id: "setup" as const, label: "Mail Setup" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold dark:text-white flex items-center gap-2"><Settings size={18} /> Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700 px-5">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition ${tab === t.id ? "border-indigo-600 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {tab === "general" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your Name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" />
                <p className="text-xs text-gray-400 mt-1">Shown as sender name in outgoing emails</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Messages Per Page</label>
                <select value={pageSize} onChange={e => setPageSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm">
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </>
          )}

          {tab === "compose" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email Signature</label>
              <textarea value={sig} onChange={e => setSig(e.target.value)} rows={5} placeholder="Your signature here..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm resize-none" />
              <p className="text-xs text-gray-400 mt-1">Appended to every new email and reply. Leave blank for no signature.</p>
            </div>
          )}

          {tab === "account" && (
            <>
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Email</span><span className="font-medium dark:text-white">{email}</span></div>
              </div>
              <form onSubmit={changePassword} className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Change Password</h4>
                <div className="relative">
                  <input type={showCurrentPw ? "text" : "password"} value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required />
                  <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                    {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div className="relative">
                  <input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required />
                  <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                    {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pwMsg && <p className={`text-sm ${pwMsg.includes("success") ? "text-green-600" : "text-red-500"}`}>{pwMsg}</p>}
                <button type="submit" disabled={newPw.length < 8 || pwLoading}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {pwLoading ? "Changing..." : "Change Password"}
                </button>
              </form>
            </>
          )}

          {tab === "setup" && (
            <>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Incoming Mail (IMAP)</h4>
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Server</span><code className="dark:text-white">{hostname}</code></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Port</span><code className="dark:text-white">993</code></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Security</span><code className="dark:text-white">SSL/TLS</code></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Outgoing Mail (SMTP)</h4>
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Server</span><code className="dark:text-white">{hostname}</code></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Port</span><code className="dark:text-white">587</code></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-slate-400">Security</span><code className="dark:text-white">STARTTLS</code></div>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">Compatible Apps</h4>
                <div className="grid grid-cols-2 gap-2">
                  {["Thunderbird", "Outlook", "Apple Mail", "Gmail App", "Outlook Mobile", "iPhone Mail"].map(a => (
                    <div key={a} className="bg-gray-50 dark:bg-slate-700/50 rounded px-3 py-1.5 text-xs text-gray-600 dark:text-slate-400">{a}</div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
          {saved && <span className="text-green-600 text-sm">Settings saved!</span>}
          {!saved && <span />}
          <div className="flex gap-2">
            {(tab === "general" || tab === "compose") && (
              <button onClick={saveSettings} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1"><Save size={14} /> Save</button>
            )}
            <button onClick={onClose} className="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-slate-700">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
