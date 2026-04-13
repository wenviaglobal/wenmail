import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Users, Plus, Trash2, Mail, Search, ArrowLeft, X } from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";

const API = "/api/webmail";
function headers() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("webmailToken")}` };
}

export function WebmailContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newContact, setNewContact] = useState("");
  const email = localStorage.getItem("webmailEmail") || "";

  useEffect(() => {
    if (!localStorage.getItem("webmailToken")) { navigate("/mail/login"); return; }
    loadContacts();
  }, []);

  async function loadContacts(q = "") {
    try {
      const res = await fetch(`${API}/contacts?q=${encodeURIComponent(q)}`, { headers: headers() });
      if (res.ok) setContacts(await res.json());
    } catch {}
  }

  useEffect(() => { loadContacts(search); }, [search]);

  async function addContact() {
    if (!newContact.trim()) return;
    // Record contact in Redis by sending a fake "record" via the contacts endpoint
    // We'll add it directly via Redis through a new endpoint
    try {
      await fetch(`${API}/contacts`, { method: "POST", headers: headers(), body: JSON.stringify({ email: newContact.trim() }) });
      setNewContact("");
      setShowAdd(false);
      loadContacts(search);
    } catch {}
  }

  async function removeContact(contact: string) {
    try {
      await fetch(`${API}/contacts`, { method: "DELETE", headers: headers(), body: JSON.stringify({ email: contact }) });
      loadContacts(search);
    } catch {}
  }

  function composeToContact(contactEmail: string) {
    // Extract email from "Name <email>" format
    const match = contactEmail.match(/<([^>]+)>/);
    const addr = match ? match[1] : contactEmail;
    navigate("/mail");
    // Store the compose intent — the webmail app will pick it up
    sessionStorage.setItem("compose-to", addr);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/mail")} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2"><Users size={24} className="text-indigo-500" /> Contacts</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-1">
              <Plus size={14} /> Add
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 flex items-center gap-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts..."
            className="flex-1 outline-none bg-transparent text-sm dark:text-white" />
        </div>

        {/* Add contact */}
        {showAdd && (
          <div className="mb-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex gap-2">
              <input value={newContact} onChange={e => setNewContact(e.target.value)} placeholder="name@example.com"
                onKeyDown={e => e.key === "Enter" && addContact()}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white" />
              <button onClick={addContact} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Add</button>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 p-2"><X size={16} /></button>
            </div>
          </div>
        )}

        {/* Contact list */}
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          {contacts.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-slate-500">
              <Users size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search ? "No contacts found" : "No contacts yet. Send emails to build your address book."}</p>
            </div>
          ) : (
            contacts.map((contact, i) => {
              const match = contact.match(/^(.+?)\s*<([^>]+)>$/);
              const name = match ? match[1].trim() : "";
              const addr = match ? match[2] : contact;
              const initial = (name || addr)[0]?.toUpperCase() || "?";
              const colorIndex = contact.split("").reduce((s, c) => s + c.charCodeAt(0), 0) % 10;
              const colors = ["bg-red-500", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-amber-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-cyan-500", "bg-orange-500"];

              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-slate-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition">
                  <div className={`w-9 h-9 rounded-full ${colors[colorIndex]} flex items-center justify-center text-white text-sm font-bold shrink-0`}>{initial}</div>
                  <div className="flex-1 min-w-0">
                    {name && <p className="text-sm font-medium dark:text-white truncate">{name}</p>}
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{addr}</p>
                  </div>
                  <button onClick={() => composeToContact(contact)} className="text-indigo-500 hover:text-indigo-700 p-1.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition" title="Compose">
                    <Mail size={14} />
                  </button>
                  <button onClick={() => removeContact(contact)} className="text-gray-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-slate-500 mt-4 text-center">
          Contacts are automatically saved when you send emails. You can also add them manually.
        </p>
      </div>
    </div>
  );
}
