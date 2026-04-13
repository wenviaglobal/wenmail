CREATE TABLE "filter_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"condition" varchar(20) NOT NULL,
	"match_type" varchar(20) NOT NULL,
	"match_value" varchar(255) NOT NULL,
	"action" varchar(20) NOT NULL,
	"action_value" varchar(255),
	"enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "filter_rules" ADD CONSTRAINT "filter_rules_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;