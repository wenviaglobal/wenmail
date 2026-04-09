import { useState } from "react";
import { useNavigate } from "react-router";
import { Mail, Eye, EyeOff } from "lucide-react";
import { ThemeToggle } from "../../components/theme-toggle";

export function WebmailLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/webmail/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");
      localStorage.setItem("webmailToken", data.token);
      localStorage.setItem("webmailEmail", data.email);
      navigate("/mail");
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await fetch("/api/webmail/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSent(true);
    } catch {
      setForgotSent(true);
    }
    setForgotLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
              <Mail size={20} className="text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-center mb-1 dark:text-white">
            <span className="text-indigo-600">Wen</span>Mail
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Sign in to your mailbox</p>

          {!showForgot ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourdomain.com"
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 pr-10 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm">
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <button onClick={() => { setShowForgot(true); setForgotEmail(email); }}
                className="w-full text-center text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-4">
                Forgot Password?
              </button>
            </>
          ) : (
            <>
              {!forgotSent ? (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Enter your email address and we'll notify your organization's admin to reset your password.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                    <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@yourdomain.com"
                      className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                  <button type="submit" disabled={forgotLoading}
                    className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                    {forgotLoading ? "Submitting..." : "Request Password Reset"}
                  </button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail size={20} className="text-green-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-white mb-2">Request Submitted</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Your organization's admin has been notified. They will reset your password and provide you with the new credentials.
                  </p>
                </div>
              )}
              <button onClick={() => { setShowForgot(false); setForgotSent(false); }}
                className="w-full text-center text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-4">
                Back to Login
              </button>
            </>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <a href="/setup-help.html" target="_blank" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Setup Guide</a>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
