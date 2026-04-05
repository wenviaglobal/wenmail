import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Mail, Inbox, Send, Trash2, Archive, Star, AlertTriangle, RefreshCw,
  Pencil, ArrowLeft, LogOut, Menu, X, Folder, Search, Reply, ReplyAll,
  Forward, Paperclip, Download, CheckSquare, Square, StarOff,
  MailOpen, MailCheck, Settings, Save,
} from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";

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
      setMessages(prev => prev.map(m => m.uid === uid ? { ...m, seen: true } : m));
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
  const displayMessages = starredFilter ? messages.filter(m => m.flagged) : messages;
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
            <button onClick={handleLogout} className="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 flex items-center gap-1"><LogOut size={14} /> Logout</button>
            <div className="flex items-center gap-1">
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
            <button onClick={() => flagMessages([...selected], "\\Flagged", true)} className="text-yellow-600 hover:text-yellow-800 flex items-center gap-1 text-xs"><Star size={12} /> Star</button>
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
                <div className="flex-1 min-w-0" onClick={() => openMessage(msg.uid)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm truncate flex-1 ${!msg.seen ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-slate-400"}`}>
                      {msg.from?.name || msg.from?.address || "Unknown"}
                    </span>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
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
                      if (att.isImage && att.preview) {
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

interface ComposeProps {
  email: string;
  compose: { mode: "new" | "reply" | "replyAll" | "forward"; original?: MsgDetail; draftUid?: number };
  onClose: () => void;
  onSent: () => void;
}

function ComposeModal({ email, compose, onClose, onSent }: ComposeProps) {
  const { mode, original } = compose;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ filename: string; content: string; contentType: string }[]>([]);

  const isDraft = !!compose.draftUid;

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

  const [to, setTo] = useState(prefillTo);
  const [subject, setSubject] = useState(prefillSubject);
  const [text, setText] = useState(prefillBody);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState("");

  async function handleSaveDraft() {
    setSavingDraft(true); setError("");
    try {
      await api("/draft", { method: "POST", body: JSON.stringify({ to, subject, text, attachments: attachments.length > 0 ? attachments : undefined }) });
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
    Array.from(files).forEach(file => {
      // Max 25 MB per file
      if (file.size > 25 * 1024 * 1024) { setError(`${file.name} exceeds 25 MB limit`); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setAttachments(prev => [...prev, { filename: file.name, content: base64, contentType: file.type || "application/octet-stream" }]);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true); setError("");
    try {
      await api("/send", { method: "POST", body: JSON.stringify({
        to, subject, text,
        attachments: attachments.length > 0 ? attachments : undefined,
        inReplyTo: original?.messageId || undefined,
        references: original?.references ? `${original.references} ${original.messageId}` : original?.messageId || undefined,
      })});
      // Delete draft after successful send
      if (compose.draftUid) {
        await api(`/draft/${compose.draftUid}`, { method: "DELETE" }).catch(() => {});
      }
      onSent();
    } catch { setError("Failed to send email"); }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white dark:bg-slate-800 w-full md:w-[680px] md:rounded-xl shadow-2xl flex flex-col max-h-[90vh] md:max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold dark:text-white">
            {isDraft ? "Edit Draft" : mode === "new" ? "New Message" : mode === "reply" ? "Reply" : mode === "replyAll" ? "Reply All" : "Forward"}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2 text-sm">
            <span className="text-gray-400 dark:text-slate-500 w-12">From:</span>
            <span className="text-gray-700 dark:text-slate-300">{email}</span>
          </div>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
            <span className="text-gray-400 dark:text-slate-500 text-sm w-12">To:</span>
            <input type="text" value={to} onChange={e => setTo(e.target.value)} required placeholder="recipient@example.com"
              className="flex-1 text-sm outline-none bg-transparent dark:text-white" />
          </div>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
            <span className="text-gray-400 dark:text-slate-500 text-sm w-12">Subj:</span>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
              className="flex-1 text-sm outline-none bg-transparent dark:text-white" />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
              {attachments.map((att, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded px-2 py-1 text-xs">
                  <Paperclip size={10} /> {att.filename}
                  <button type="button" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1"><X size={10} /></button>
                </span>
              ))}
            </div>
          )}

          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write your message..."
            className="flex-1 p-4 text-sm outline-none resize-none bg-transparent dark:text-white min-h-[200px]" />

          {error && <div className="px-4 py-2 text-red-500 text-sm">{error}</div>}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!to || sending}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                <Send size={16} /> {sending ? "Sending..." : "Send"}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded" title="Attach file">
                <Paperclip size={18} />
              </button>
              <button type="button" onClick={handleSaveDraft} disabled={savingDraft}
                className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded flex items-center gap-1 text-sm" title="Save as Draft">
                <Save size={16} /> {savingDraft ? "Saving..." : "Draft"}
              </button>
            </div>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Discard</button>
          </div>
        </form>
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
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required />
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm" required />
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
