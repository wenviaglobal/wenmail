export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
  text: string;
}

export const emailTemplates: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Email",
    category: "Onboarding",
    subject: "Welcome to [Company Name]!",
    text: "Hi [Name],\n\nWelcome to [Company Name]! We're excited to have you on board.\n\nHere's what you can do next:\n- Complete your profile\n- Explore our features\n- Reach out if you need help\n\nBest regards,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#4f46e5">Welcome to [Company Name]!</h2><p>Hi [Name],</p><p>We're excited to have you on board. Here's what you can do next:</p><ul><li>Complete your profile</li><li>Explore our features</li><li>Reach out if you need help</li></ul><p>Best regards,<br>[Your Name]</p></div>`,
  },
  {
    id: "meeting",
    name: "Meeting Request",
    category: "Business",
    subject: "Meeting Request: [Topic]",
    text: "Hi [Name],\n\nI'd like to schedule a meeting to discuss [Topic].\n\nProposed time: [Date & Time]\nDuration: [Duration]\nLocation: [Location/Link]\n\nPlease let me know if this works for you.\n\nBest regards,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Meeting Request</h2><p>Hi [Name],</p><p>I'd like to schedule a meeting to discuss <strong>[Topic]</strong>.</p><table style="border-collapse:collapse;margin:16px 0"><tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Time</td><td style="padding:8px;border:1px solid #e5e7eb">[Date & Time]</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Duration</td><td style="padding:8px;border:1px solid #e5e7eb">[Duration]</td></tr><tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:bold">Location</td><td style="padding:8px;border:1px solid #e5e7eb">[Location/Link]</td></tr></table><p>Please let me know if this works for you.</p><p>Best regards,<br>[Your Name]</p></div>`,
  },
  {
    id: "invoice",
    name: "Invoice Reminder",
    category: "Billing",
    subject: "Invoice #[Number] — Payment Reminder",
    text: "Hi [Name],\n\nThis is a friendly reminder that invoice #[Number] for [Amount] is due on [Date].\n\nPlease make the payment at your earliest convenience.\n\nThank you,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#dc2626">Payment Reminder</h2><p>Hi [Name],</p><p>This is a friendly reminder that your invoice is due:</p><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0"><p style="margin:4px 0"><strong>Invoice:</strong> #[Number]</p><p style="margin:4px 0"><strong>Amount:</strong> [Amount]</p><p style="margin:4px 0"><strong>Due Date:</strong> [Date]</p></div><p>Please make the payment at your earliest convenience.</p><p>Thank you,<br>[Your Name]</p></div>`,
  },
  {
    id: "followup",
    name: "Follow-up",
    category: "Sales",
    subject: "Following up on our conversation",
    text: "Hi [Name],\n\nI wanted to follow up on our recent conversation about [Topic].\n\nIs there anything else I can help with? I'm happy to answer any questions.\n\nLooking forward to hearing from you.\n\nBest regards,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Following Up</h2><p>Hi [Name],</p><p>I wanted to follow up on our recent conversation about <strong>[Topic]</strong>.</p><p>Is there anything else I can help with? I'm happy to answer any questions.</p><p>Looking forward to hearing from you.</p><p>Best regards,<br>[Your Name]</p></div>`,
  },
  {
    id: "thankyou",
    name: "Thank You",
    category: "General",
    subject: "Thank you!",
    text: "Hi [Name],\n\nThank you for [Reason]. We truly appreciate it.\n\nIf there's anything we can do for you, please don't hesitate to reach out.\n\nWarm regards,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#16a34a">Thank You!</h2><p>Hi [Name],</p><p>Thank you for <strong>[Reason]</strong>. We truly appreciate it.</p><p>If there's anything we can do for you, please don't hesitate to reach out.</p><p>Warm regards,<br>[Your Name]</p></div>`,
  },
  {
    id: "announcement",
    name: "Announcement",
    category: "General",
    subject: "[Company] Update: [Title]",
    text: "Hi [Name],\n\nWe have an exciting update to share!\n\n[Announcement details here]\n\nLearn more at [Link].\n\nBest,\n[Your Name]",
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;padding:24px;border-radius:8px 8px 0 0;text-align:center"><h1 style="margin:0;font-size:24px">[Title]</h1></div><div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px"><p>Hi [Name],</p><p>We have an exciting update to share!</p><p>[Announcement details here]</p><a href="[Link]" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">Learn More</a><p>Best,<br>[Your Name]</p></div></div>`,
  },
];
