import { Link } from "react-router";
import { Mail, Shield, Globe, Users, Zap, Clock, ArrowRight, CheckCircle } from "lucide-react";
import { ThemeToggle } from "../components/theme-toggle";

const features = [
  { icon: Mail, title: "Custom Email", desc: "Professional email under your own domain — no more @gmail.com" },
  { icon: Shield, title: "Secure & Private", desc: "SPF, DKIM, DMARC on every domain. TLS encryption everywhere" },
  { icon: Globe, title: "Your Domain", desc: "Bring your own domain. We handle the infrastructure" },
  { icon: Users, title: "Team Ready", desc: "Create unlimited mailboxes for your team with per-user quotas" },
  { icon: Zap, title: "Instant Setup", desc: "Add domain, configure DNS, create mailboxes — all in minutes" },
  { icon: Clock, title: "99.9% Uptime", desc: "Enterprise-grade mail infrastructure on dedicated servers" },
];

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "to get started",
    features: ["1 domain", "25 mailboxes", "500 MB / mailbox", "300 emails / day", "Webmail access"],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Standard",
    price: "$14.99",
    period: "/ month",
    features: ["3 domains", "100 mailboxes", "1 GB / mailbox", "1,000 emails / day", "IMAP/SMTP access", "Priority support"],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Premium",
    price: "$49.99",
    period: "/ month",
    features: ["10 domains", "500 mailboxes", "5 GB / mailbox", "5,000 emails / day", "Dedicated support", "Custom branding"],
    cta: "Contact Sales",
    popular: false,
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center shadow-md">
              <Mail size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold">
              <span className="text-indigo-600">Wen</span>
              <span className="text-slate-800 dark:text-white">Mail</span>
            </span>
          </div>
          <nav className="flex items-center gap-4 md:gap-6">
            <a href="#features" className="hidden md:block text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white dark:hover:text-white">Features</a>
            <a href="#pricing" className="hidden md:block text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white dark:hover:text-white">Pricing</a>
            <Link to="/admin/login" className="hidden md:block text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700">Admin</Link>
            <ThemeToggle />
            <a href={`https://wpanel.wenvia.global/portal/login`}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm">
              Client Login
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-medium mb-6">
            <Zap size={14} /> Professional email hosting made simple
          </div>
          <h1 className="text-5xl font-extrabold text-slate-900 dark:text-white leading-tight mb-6">
            Your domain.<br />
            <span className="text-indigo-600">Your email.</span><br />
            Our infrastructure.
          </h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-10">
            Give your business professional email under your own domain.
            We handle Postfix, Dovecot, spam filtering, DKIM, and everything else —
            you just create mailboxes.
          </p>
          <div className="flex items-center justify-center gap-4">
            <a href={`https://wpanel.wenvia.global/portal/login`}
              className="bg-indigo-600 text-white px-8 py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center gap-2">
              Get Started <ArrowRight size={18} />
            </a>
            <a href="#features"
              className="border border-slate-200 text-slate-700 px-8 py-3 rounded-lg text-base font-medium hover:bg-slate-50 transition">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 md:px-6 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Everything you need for business email</h2>
            <p className="text-lg text-slate-500">No technical knowledge required. We handle the complex parts.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((f) => (
              <div key={f.title} className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition">
                <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center mb-4">
                  <f.icon size={24} className="text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Up and running in 3 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Add your domain", desc: "Enter your domain name and we generate all the DNS records you need" },
              { step: "2", title: "Configure DNS", desc: "Copy-paste the records at your registrar. Our guide walks you through it" },
              { step: "3", title: "Create mailboxes", desc: "Add email accounts for your team. They can start sending immediately" },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4 shadow-lg shadow-indigo-200">
                  {s.step}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{s.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 md:px-6 bg-slate-50 dark:bg-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-lg text-slate-500">Start free. Upgrade as you grow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan) => (
              <div key={plan.name}
                className={`bg-white dark:bg-slate-800 rounded-xl p-8 border-2 relative ${
                  plan.popular ? "border-indigo-600 shadow-xl shadow-indigo-100 dark:shadow-indigo-900/30" : "border-slate-100 dark:border-slate-700 shadow-sm"
                }`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                  <span className="text-slate-500 dark:text-slate-400 text-sm ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <CheckCircle size={16} className="text-green-500 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <a href={`https://wpanel.wenvia.global/portal/login`}
                  className={`block text-center py-2.5 rounded-lg font-medium text-sm transition ${
                    plan.popular
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                      : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}>
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 bg-slate-900 text-slate-400">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Mail size={16} className="text-white" />
            </div>
            <span className="text-white font-semibold">WenMail</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <span>Webmail: <a href="https://mail.wenvia.global" className="text-indigo-400 hover:underline">mail.wenvia.global</a></span>
            <span>Support: <a href="mailto:support@wenvia.global" className="text-indigo-400 hover:underline">support@wenvia.global</a></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
