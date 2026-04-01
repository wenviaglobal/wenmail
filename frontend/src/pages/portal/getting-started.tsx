import { Link } from "react-router";
import { Globe, Shield, Mail, ArrowRightLeft, CheckCircle } from "lucide-react";

const steps = [
  {
    number: 1,
    icon: Globe,
    title: "Add Your Domain",
    description: "Go to the Domains page and add your company's domain name (e.g. yourcompany.com). You must own this domain.",
    link: "/portal/domains",
    linkText: "Go to Domains",
    details: [
      "You need access to your domain's DNS settings (GoDaddy, Namecheap, Cloudflare, etc.)",
      "Each domain must be unique — no two companies can register the same domain",
      "Your plan determines how many domains you can add",
    ],
  },
  {
    number: 2,
    icon: Shield,
    title: "Configure DNS Records",
    description: "After adding your domain, click 'DNS Guide' to see the exact records you need to add at your domain registrar.",
    details: [
      "You'll add 5 DNS records: Verification (TXT), MX, SPF, DKIM, and DMARC",
      "MX record tells the internet to send emails for your domain to our server",
      "SPF and DKIM prove that emails from your domain are legitimate (prevents spam)",
      "DMARC tells receiving servers what to do if SPF/DKIM checks fail",
      "DNS changes can take 5 minutes to 48 hours to propagate worldwide",
    ],
  },
  {
    number: 3,
    icon: CheckCircle,
    title: "Verify Your Domain",
    description: "Once DNS records are added, click 'Verify' on your domain. All status badges should turn green.",
    details: [
      "Verification confirms you own the domain",
      "MX, SPF, DKIM, DMARC badges show if each record is correctly configured",
      "If a badge stays red, double-check the DNS record — typos are the #1 issue",
      "You can re-verify anytime to check if records have propagated",
    ],
  },
  {
    number: 4,
    icon: Mail,
    title: "Create Mailboxes",
    description: "Now create email accounts for your team. Each mailbox is a real inbox that can send and receive email.",
    link: "/portal/mailboxes",
    linkText: "Go to Mailboxes",
    details: [
      "Example: john@yourcompany.com, hr@yourcompany.com, support@yourcompany.com",
      "Each mailbox gets a username (local part) and password",
      "Storage quota is set per your plan (default 500 MB per mailbox)",
      "Your plan determines the maximum number of mailboxes",
    ],
  },
  {
    number: 5,
    icon: ArrowRightLeft,
    title: "Set Up Aliases (Optional)",
    description: "Create forwarding rules so emails to one address get delivered to another mailbox.",
    link: "/portal/aliases",
    linkText: "Go to Aliases",
    details: [
      "Example: sales@yourcompany.com → forwards to john@yourcompany.com",
      "Aliases don't have their own inbox — they just redirect",
      "One alias can forward to multiple people (comma-separated)",
      "Great for team addresses like info@, support@, billing@",
    ],
  },
];

const emailClientSetup = {
  title: "Connect Your Email Client",
  description: "After creating mailboxes, configure Thunderbird, Outlook, or any email app:",
  settings: [
    { label: "IMAP Server (incoming)", value: "Your mail server hostname (from DNS Guide)" },
    { label: "IMAP Port", value: "993 (SSL/TLS)" },
    { label: "SMTP Server (outgoing)", value: "Same as IMAP server" },
    { label: "SMTP Port", value: "587 (STARTTLS)" },
    { label: "Username", value: "Your full email address (e.g. john@yourcompany.com)" },
    { label: "Password", value: "The password set when creating the mailbox" },
    { label: "Authentication", value: "Normal password" },
  ],
};

export function PortalGettingStartedPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Getting Started</h1>
      <p className="text-slate-500 mb-8">
        Follow these steps to set up email for your organization. The whole process takes about 15-30 minutes
        (plus DNS propagation time).
      </p>

      {/* Steps */}
      <div className="space-y-6 mb-10">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div key={step.number} className="bg-white border border-slate-200 rounded-lg p-5">
              <div className="flex items-start gap-4">
                <div className="bg-indigo-100 p-2.5 rounded-lg shrink-0">
                  <Icon className="text-indigo-600" size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                      {step.number}
                    </span>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{step.description}</p>

                  <ul className="space-y-1.5 mb-3">
                    {step.details.map((detail, i) => (
                      <li key={i} className="text-sm text-slate-500 flex items-start gap-2">
                        <span className="text-indigo-400 mt-1 shrink-0">-</span>
                        {detail}
                      </li>
                    ))}
                  </ul>

                  {step.link && (
                    <Link
                      to={step.link}
                      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline font-medium"
                    >
                      {step.linkText} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Email Client Setup */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold mb-2">{emailClientSetup.title}</h2>
        <p className="text-sm text-slate-500 mb-4">{emailClientSetup.description}</p>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {emailClientSetup.settings.map((s, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 w-1/3">{s.label}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          You can also access your email via Webmail (Roundcube) in the browser — ask your admin for the URL.
        </p>
      </div>

      {/* FAQ */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Common Questions</h2>
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-slate-800">How long does DNS propagation take?</h4>
            <p className="text-sm text-slate-500 mt-1">Usually 5-30 minutes, but can take up to 48 hours in rare cases. If verification fails, wait and try again.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-800">Can I use my existing domain?</h4>
            <p className="text-sm text-slate-500 mt-1">Yes! You keep ownership of your domain. You're just pointing its email (MX) records to our server. Your website stays unaffected.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-800">What if I already have email on this domain?</h4>
            <p className="text-sm text-slate-500 mt-1">Changing MX records will route new emails to our server. Contact support to import your existing emails via IMAP sync before switching.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-800">Can I migrate away later?</h4>
            <p className="text-sm text-slate-500 mt-1">Yes. Your data is yours. We support IMAP access, Maildir export, and mbox export. See the Import/Export page for details.</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-800">Why are all DNS records needed?</h4>
            <p className="text-sm text-slate-500 mt-1">MX routes email to us. SPF + DKIM prove your emails are real (not spam). DMARC tells Gmail/Outlook what to do with unverified emails. Without these, your emails will land in spam folders.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
