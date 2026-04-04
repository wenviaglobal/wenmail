import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Mail, Inbox, Send, Trash2, Archive, Star, AlertTriangle, RefreshCw,
  Pencil, ArrowLeft, LogOut, Menu, X, ChevronDown, Folder,
} from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";

const API = "/api/webmail";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("webmailToken")}`,
  };
}

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers(), ...opts?.headers } });
  if (res.status === 401) {
    localStorage.removeItem("webmailToken");
    window.location.href = "/mail/login";
    throw new Error("Unauthorized");
  }
  return res.json();
}

interface MessageSummary {
  uid: number;
  from: { name: string; address: string } | null;
  to: { name: string; address: string }[];
  subject: string;
  date: string | null;
  seen: boolean;
  flagged: boolean;
  size: number;
}

interface MessageDetail extends MessageSummary {
  body: string;
  contentType: string;
  cc: { name: string; address: string }[];
}

interface FolderInfo {
  name: string;
  path: string;
  specialUse: string | null;
  messages: number;
  unseen: number;
}

const folderIcons: Record<string, typeof Inbox> = {
  "\\Inbox": Inbox,
  "\\Sent": Send,
  "\\Trash": Trash2,
  "\\Drafts": Pencil,
  "\\Junk": AlertTriangle,
  "\\Archive": Archive,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function WebmailApp() {
  const navigate = useNavigate();
  const email = localStorage.getItem("webmailEmail") || "";
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [currentFolder, setCurrentFolder] = useState("INBOX");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [selectedMsg, setSelectedMsg] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [total, setTotal] = useState(0);

  const loadFolders = useCallback(async () => {
    try {
      const data = await api("/folders");
      setFolders(data);
    } catch {}
  }, []);

  const loadMessages = useCallback(async (folder: string) => {
    setLoading(true);
    setSelectedMsg(null);
    try {
      const data = await api(`/messages?folder=${encodeURIComponent(folder)}`);
      setMessages(data.messages || []);
      setTotal(data.total || 0);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("webmailToken")) {
      navigate("/mail/login");
      return;
    }
    loadFolders();
    loadMessages("INBOX");
  }, []);

  async function openMessage(uid: number) {
    setLoading(true);
    try {
      const data = await api(`/message/${uid}?folder=${encodeURIComponent(currentFolder)}`);
      setSelectedMsg(data);
      // Update seen status in list
      setMessages((prev) => prev.map((m) => (m.uid === uid ? { ...m, seen: true } : m)));
    } catch {}
    setLoading(false);
  }

  async function moveMessage(uid: number, toFolder: string) {
    await api("/move", {
      method: "POST",
      body: JSON.stringify({ uid, fromFolder: currentFolder, toFolder }),
    });
    setSelectedMsg(null);
    loadMessages(currentFolder);
    loadFolders();
  }

  function selectFolder(path: string) {
    setCurrentFolder(path);
    loadMessages(path);
    setSidebarOpen(false);
  }

  function handleLogout() {
    api("/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("webmailToken");
    localStorage.removeItem("webmailEmail");
    navigate("/mail/login");
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center">
              <Mail size={16} className="text-white" />
            </div>
            <span className="font-bold dark:text-white"><span className="text-indigo-600">Wen</span>Mail</span>
          </div>
          <button className="lg:hidden text-gray-400" onClick={() => setSidebarOpen(false)}><X size={20} /></button>
        </div>

        <div className="p-3">
          <button
            onClick={() => { setShowCompose(true); setSidebarOpen(false); }}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-sm"
          >
            <Pencil size={16} /> Compose
          </button>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {folders.map((f) => {
            const Icon = folderIcons[f.specialUse || ""] || Folder;
            const isActive = f.path === currentFolder;
            return (
              <button
                key={f.path}
                onClick={() => selectFolder(f.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-medium"
                    : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                }`}
              >
                <Icon size={16} />
                <span className="flex-1 text-left">{f.name}</span>
                {f.unseen > 0 && (
                  <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">{f.unseen}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200 dark:border-slate-700">
          <p className="text-xs text-gray-500 dark:text-slate-500 truncate mb-2">{email}</p>
          <div className="flex items-center justify-between">
            <button onClick={handleLogout} className="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 flex items-center gap-1">
              <LogOut size={14} /> Logout
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <button className="lg:hidden text-gray-500 dark:text-slate-400" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <h2 className="font-semibold text-gray-800 dark:text-white flex-1">{currentFolder === "INBOX" ? "Inbox" : currentFolder}</h2>
          <span className="text-xs text-gray-400 dark:text-slate-500">{total} messages</span>
          <button onClick={() => loadMessages(currentFolder)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Message list */}
          <div className={`${selectedMsg ? "hidden md:flex" : "flex"} flex-col w-full md:w-96 border-r border-gray-200 dark:border-slate-700 overflow-y-auto bg-white dark:bg-slate-800`}>
            {messages.length === 0 && !loading && (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">No messages</div>
            )}
            {messages.map((msg) => (
              <button
                key={msg.uid}
                onClick={() => openMessage(msg.uid)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition ${
                  selectedMsg?.uid === msg.uid ? "bg-indigo-50 dark:bg-indigo-900/20" : ""
                } ${!msg.seen ? "bg-blue-50/50 dark:bg-blue-900/10" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm truncate flex-1 ${!msg.seen ? "font-semibold text-gray-900 dark:text-white" : "text-gray-600 dark:text-slate-400"}`}>
                    {msg.from?.name || msg.from?.address || "Unknown"}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-slate-500 ml-2 shrink-0">{formatDate(msg.date)}</span>
                </div>
                <div className={`text-sm truncate ${!msg.seen ? "font-medium text-gray-800 dark:text-slate-200" : "text-gray-500 dark:text-slate-400"}`}>
                  {msg.subject}
                </div>
              </button>
            ))}
          </div>

          {/* Message detail */}
          {selectedMsg ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-800">
              <div className="px-4 md:px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => setSelectedMsg(null)} className="md:hidden text-gray-500"><ArrowLeft size={20} /></button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1 truncate">{selectedMsg.subject}</h3>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                      {selectedMsg.from?.name || selectedMsg.from?.address}
                      {selectedMsg.from?.name && <span className="text-gray-400 dark:text-slate-500 font-normal ml-1">&lt;{selectedMsg.from.address}&gt;</span>}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      To: {selectedMsg.to.map((t) => t.address).join(", ")}
                      {selectedMsg.cc?.length > 0 && ` | Cc: ${selectedMsg.cc.map((t) => t.address).join(", ")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => moveMessage(selectedMsg.uid, "Trash")} className="text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={16} /></button>
                    <button onClick={() => moveMessage(selectedMsg.uid, "Archive")} className="text-gray-400 hover:text-blue-500" title="Archive"><Archive size={16} /></button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{selectedMsg.date ? new Date(selectedMsg.date).toLocaleString() : ""}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {selectedMsg.contentType === "html" ? (
                  <div className="prose dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: selectedMsg.body }} />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-slate-300 font-sans">{selectedMsg.body}</pre>
                )}
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
      {showCompose && <ComposeModal email={email} onClose={() => setShowCompose(false)} onSent={() => { setShowCompose(false); loadFolders(); }} />}
    </div>
  );
}

function ComposeModal({ email, onClose, onSent }: { email: string; onClose: () => void; onSent: () => void }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await api("/send", { method: "POST", body: JSON.stringify({ to, subject, text }) });
      onSent();
    } catch {
      setError("Failed to send email");
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
      <div className="bg-white dark:bg-slate-800 w-full md:w-[640px] md:rounded-xl shadow-2xl flex flex-col max-h-[90vh] md:max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <h3 className="font-semibold dark:text-white">New Message</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400 dark:text-slate-500 w-12">From:</span>
              <span className="text-gray-700 dark:text-slate-300">{email}</span>
            </div>
          </div>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 dark:text-slate-500 text-sm w-12">To:</span>
              <input type="text" value={to} onChange={(e) => setTo(e.target.value)} required
                placeholder="recipient@example.com"
                className="flex-1 text-sm outline-none bg-transparent dark:text-white" />
            </div>
          </div>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 dark:text-slate-500 text-sm w-12">Subj:</span>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="flex-1 text-sm outline-none bg-transparent dark:text-white" />
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message..."
            className="flex-1 p-4 text-sm outline-none resize-none bg-transparent dark:text-white min-h-[200px]"
          />
          {error && <div className="px-4 py-2 text-red-500 text-sm">{error}</div>}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
            <button type="submit" disabled={!to || sending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              <Send size={16} /> {sending ? "Sending..." : "Send"}
            </button>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Discard</button>
          </div>
        </form>
      </div>
    </div>
  );
}
