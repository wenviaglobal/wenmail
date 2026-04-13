import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Link as LinkIcon, Quote, Undo2, Redo2, RemoveFormatting,
} from "lucide-react";
import { useEffect } from "react";

interface RichEditorProps {
  content: string;
  onChange: (text: string, html: string) => void;
  placeholder?: string;
}

function ToolbarButton({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition ${active ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white"}`}
    >
      {children}
    </button>
  );
}

export function RichEditor({ content, onChange, placeholder = "Write your message..." }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-indigo-600 underline" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: content ? `<p>${content.replace(/\n/g, "<br>")}</p>` : "",
    onUpdate: ({ editor: e }) => {
      onChange(e.getText(), e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert prose-sm max-w-none min-h-[200px] p-4 outline-none focus:outline-none",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 shrink-0 flex-wrap">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo2 size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo2 size={14} /></ToolbarButton>
        <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold (Ctrl+B)"><Bold size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic (Ctrl+I)"><Italic size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline (Ctrl+U)"><UnderlineIcon size={14} /></ToolbarButton>
        <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list"><List size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"><ListOrdered size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote"><Quote size={14} /></ToolbarButton>
        <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-1" />
        <ToolbarButton onClick={() => {
          const url = prompt("Enter link URL:");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }} active={editor.isActive("link")} title="Insert link"><LinkIcon size={14} /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting"><RemoveFormatting size={14} /></ToolbarButton>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
