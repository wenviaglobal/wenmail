ALTER TABLE "password_reset_requests" ALTER COLUMN "client_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD COLUMN "request_type" varchar(20) DEFAULT 'portal';--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD COLUMN "mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;