import { useState } from "react";
import { useNavigate } from "react-router";
import { portalLogin, portalApi } from "../../api/portal";
import { Mail } from "lucide-react";

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      await portalLogin(email, password);
      navigate("/portal");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await portalApi.post("auth/forgot-password", { json: { email: forgotEmail } }).json();
      setForgotSent(true);
    } catch {
      setForgotSent(true); // Don't reveal if email exists
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-lg border border-slate-200 p-8">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center">
              <Mail size={16} className="text-white" />
            </div>
            <h1 className="text-xl font-bold">
              <span className="text-indigo-600">Wen</span>
              <span className="text-slate-800">Mail</span>
            </h1>
          </div>
          <p className="text-sm text-slate-500 text-center mb-6">Client Portal</p>

          {!showForgot ? (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded">{error}</div>}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {loading ? "Signing in..." : "Sign In"}
                </button>
              </form>
              <button onClick={() => setShowForgot(true)}
                className="w-full text-center text-xs text-indigo-600 hover:underline mt-4">
                Forgot Password?
              </button>
            </>
          ) : (
            <>
              {!forgotSent ? (
                <form onSubmit={handleForgot} className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Enter your email and we'll send a password reset request to your admin.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                  </div>
                  <button type="submit" disabled={forgotLoading}
                    className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                    {forgotLoading ? "Submitting..." : "Request Password Reset"}
                  </button>
                </form>
              ) : (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Mail size={20} className="text-green-600" />
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-2">Request Submitted</h3>
                  <p className="text-sm text-slate-500">
                    Your admin has been notified. They will reset your password and contact you with the new credentials.
                  </p>
                </div>
              )}
              <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}
                className="w-full text-center text-xs text-indigo-600 hover:underline mt-4">
                Back to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
