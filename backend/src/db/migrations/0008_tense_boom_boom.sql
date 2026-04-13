CREATE TABLE "scheduled_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_email" varchar(255) NOT NULL,
	"to_addresses" text NOT NULL,
	"cc_addresses" text,
	"bcc_addresses" text,
	"subject" varchar(500),
	"text_body" text,
	"html_body" text,
	"attachments_json" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now()
);
